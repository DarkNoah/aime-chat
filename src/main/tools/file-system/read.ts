import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { truncateText } from '@/utils/common';
import os from 'os';
import { spawn } from 'child_process';
import { glob } from 'fast-glob';
import { formatCodeWithLineNumbers, updateFileModTime } from '.';
import { isBinaryFile } from 'isbinaryfile';
import { filesize } from 'filesize';
import { PDFLoader } from '@/main/utils/loaders/pdf-loader';
import { WordLoader } from '@/main/utils/loaders/word-loader';
import mime from 'mime';
import { OcrAccuracy, recognize } from '@napi-rs/system-ocr';
import { PowerPointLoader } from '@/main/utils/loaders/power-point-loader';
import { ExcelLoader } from '@/main/utils/loaders/excel-loader';
import { ToolConfig, ToolType } from '@/types/tool';
import { AudioLoader } from '@/main/utils/loaders/audio-loader';
import { Vision } from '../vision/vision';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { SpeechToText } from '../audio';
import { toolsManager } from '..';
import { LanguageModelV2ToolResultOutput, LanguageModelV2ToolResultPart } from '@ai-sdk/provider';
import { isArray, isObject, isString } from '@/utils/is';


const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;


export interface ReadParams extends BaseToolParams {
  forcePDFOcr?: boolean;
  forceWordOcr?: boolean;
  disableVision?: boolean;
}
export class Read extends BaseTool {
  static readonly toolName = 'Read';
  id: string = 'Read';
  description: string = `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:

- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to ${DEFAULT_MAX_LINES_TEXT_FILE} lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than ${MAX_LINE_LENGTH_TEXT_FILE} characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually by a multimodal LLM.
- This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.
- This tool can read audio files (.wav, .mp3 etc), and returns the audio transcription content (.srt format).
- This tool can read video files (.mp4, .mov, .webm), and returns the video transcription content (.srt format).
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths like /var/folders/123/abc/T/TemporaryItems/NSIRD_screencaptureui_ZfB1tD/Screenshot.png
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.`;
  inputSchema = z
    .object({
      file_path: z.string().describe('The absolute path to the file to read'),
      offset: z
        .number()
        .optional()
        .describe(
          'The line number to start reading from. Only provide if the file is too large to read at once, starting from 0',
        ),
      limit: z
        .number()
        .optional()
        .describe(
          'The number of lines to read. Only provide if the file is too large to read at once.',
        ),
      useVision: z.boolean().optional().default(false).describe('Optional: only use this when the file is an image. If set to true, it will be presented visually by a multimodal LLM, default is false.'),
    })
    .strict();

  configSchema = ToolConfig.Read.configSchema;
  forcePDFOcr?: ReadParams['forcePDFOcr'];
  forceWordOcr?: ReadParams['forceWordOcr'];
  disableVision?: ReadParams['disableVision'];
  // outputSchema = z.string();


  constructor(config?: ReadParams) {
    super(config);
    this.forcePDFOcr = config?.forcePDFOcr ?? true;
    this.forceWordOcr = config?.forceWordOcr ?? false;
    this.disableVision = config?.disableVision ?? false;
  }

  public async doRead(inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>): Promise<{
      content?: string | any;
      isError: boolean;
      systemReminder?: string[];
    }> {
    const { file_path, offset, limit, useVision } = inputData;
    const appInfo = await appManager.getInfo();
    const currentModel = context?.requestContext?.get('model' as never) as string;
    const visionModelId = appInfo.defaultModel.visionModel || currentModel;


    if (!fs.existsSync(file_path)) {
      return {
        isError: true,
        systemReminder: [`<system-reminder>Error: File does not exist. </system-reminder>`],
      }
    }
    const stats = await fs.promises.stat(file_path);

    if (stats.isDirectory()) {
      return {
        isError: true,
        systemReminder: [`<system-reminder>Error: File '${file_path}' is a directory. </system-reminder>`],
      }
    }

    if (stats.size === 0) {
      await updateFileModTime(file_path, context.requestContext);
      return {
        isError: false,
        systemReminder: [`<system-reminder>File '${file_path}' is empty.</system-reminder>`],
      }
    }

    if (offset !== undefined && offset < 0) {
      return {
        isError: true,
        systemReminder: [`<system-reminder>Error: Offset must be a non-negative number.</system-reminder>`],
      }
    }
    if (limit !== undefined && limit <= 0) {
      return {
        isError: true,
        systemReminder: [`<system-reminder>Error: Limit must be a positive number.</system-reminder>`],
      }
    }
    const ext = path.extname(file_path).toLowerCase();

    if (await isBinaryFile(file_path) && ext != '.ts') {
      try {
        if (mime.lookup(file_path).startsWith('image/')) {
          if (this.disableVision === true || useVision === false) {
            const defaultOcr = appInfo?.defaultModel?.ocrModel;
            const provider = await providersManager.getProvider(defaultOcr);
            const ocrModel = defaultOcr.split('/').slice(1).join('/')
            const ocr = await provider.ocrModel(ocrModel).doOCR({ image: file_path, abortSignal: context?.abortSignal });
            return {
              isError: false,
              content: ocr,
            }
          }
          const result = await new Vision({
            modelId: visionModelId,
          }).execute({
            source: file_path,
            prompt: 'Please describe the image in detail.',
          }, context);
          return {
            isError: false,
            content: result,
          }
        }
        else if (mime.lookup(file_path).startsWith('video/')) {
          const result = await new Vision({
            modelId: visionModelId,
          }).execute({
            source: file_path,
            prompt: 'Please describe the video in detail.',
          }, context);
          return {
            isError: false,
            content: result,
          };
        }
      } catch (err) {
        console.error(err)
      }

      const content = await new ReadBinaryFile({
        forcePDFOcr: this.forcePDFOcr,
        forceWordOcr: this.forceWordOcr,
      }).execute({
        file_source: file_path,
      }, context);
      return {
        isError: false,
        content: content,
      };
    }



    const content = await fs.promises.readFile(file_path, 'utf-8');

    const lines = content.split(/\r?\n/);
    const originalLineCount = lines.length;
    const startLine = offset || 0;
    const effectiveLimit =
      limit === undefined
        ? DEFAULT_MAX_LINES_TEXT_FILE
        : Math.min(limit, DEFAULT_MAX_LINES_TEXT_FILE);
    // Ensure endLine does not exceed originalLineCount
    const endLine = Math.min(startLine + effectiveLimit, originalLineCount);
    // Ensure selectedLines doesn't try to slice beyond array bounds if startLine is too high
    const actualStartLine = Math.min(startLine, originalLineCount);
    let selectedLines = lines.slice(actualStartLine, endLine);

    if (startLine >= originalLineCount) {
      return {
        isError: true,
        systemReminder: [`<system-reminder>Error: offset is out of range, offset: ${startLine}, originalLineCount: ${originalLineCount}.</system-reminder>`],
      }
    }

    let linesWereTruncatedInLength = false;
    selectedLines = selectedLines.map((line) => {
      if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
        linesWereTruncatedInLength = true;
        return `${line.substring(0, MAX_LINE_LENGTH_TEXT_FILE)}... [truncated]`;
      }
      return line;
    });

    const contentRangeTruncated = endLine < originalLineCount;
    const isTruncated = contentRangeTruncated || linesWereTruncatedInLength;

    const systemReminder = [];
    if (contentRangeTruncated) {
      systemReminder.push(`<system-reminder>File content truncated: showing lines ${actualStartLine + 1}-${endLine} of ${originalLineCount} total lines. Use offset/limit parameters to view more.</system-reminder>`);
    } else if (linesWereTruncatedInLength) {
      systemReminder.push(`<system-reminder>File content partially truncated: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.</system-reminder>`);
    }

    const formattedLines = formatCodeWithLineNumbers({
      content: selectedLines.join('\n'),
      startLine: actualStartLine + 1,
    });

    await updateFileModTime(file_path, context.requestContext);
    return {
      isError: false,
      systemReminder: systemReminder,
      content: formattedLines,
    };
  }

  // requireApproval: true,
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const output = await this.doRead(inputData, context);
    if (output.isError) {
      return output.systemReminder?.join('\n')
    } else {
      if (isString(output.content)) {
        let value = '';
        if (output.systemReminder) {
          value += output.systemReminder?.join('\n') + '\n';
        }
        if (output.content) {
          value += output.content;
        }
        return value
      } else if (isObject(output.content)) {
        return output.content
      } else if (isArray(output.content)) {
        return output.content
      }
    }
  };

}

export interface ReadBinaryFileParams extends BaseToolParams {
  forcePDFOcr?: boolean;
  forceWordOcr?: boolean;
  reminder?: boolean;
  excludeInsideImage?: boolean;
}


export class ReadBinaryFile extends BaseTool {
  static readonly toolName = 'ReadBinaryFile';
  id: string = 'ReadBinaryFile';
  description: string = `Reads binary files from the local filesystem. Use this tool specifically for non-text files that cannot be read as plain text.

Supported file types:
- PDF files (.pdf): Extracts text content from PDF documents
- Word documents (.doc, .docx): Extracts text content from Word files
- Excel spreadsheets (.xls, .xlsx): Reads spreadsheet data
- PowerPoint presentations (.ppt, .pptx): Extracts content from presentations
- Image files (PNG, JPG, etc.): Uses OCR to extract text from images

Usage:
- The file_path parameter must be an absolute path, not a relative path
- For regular text files, use the Read tool instead
- This tool is automatically suggested when Read tool detects a binary file
- You can batch multiple file reads in a single response for efficiency
- If you read a file that exists but has empty contents you will receive a system reminder warning`;
  inputSchema = z
    .object({
      file_source: z.string().describe('The absolute path to the file to read'),
      args: z.object({}).optional().describe(``),
    })
    .strict();
  outputSchema = z.string();

  configSchema = ToolConfig.ReadBinaryFile.configSchema;
  mode?: ReadBinaryFileParams['mode'];
  forcePDFOcr?: ReadBinaryFileParams['forcePDFOcr'];
  forceWordOcr?: ReadBinaryFileParams['forceWordOcr'];
  reminder?: ReadBinaryFileParams['reminder'];
  excludeInsideImage?: ReadBinaryFileParams['excludeInsideImage'];

  constructor(config?: ReadBinaryFileParams) {
    super(config);
    this.mode = config?.mode ?? 'auto';
    this.forcePDFOcr = config?.forcePDFOcr ?? true;
    this.forceWordOcr = config?.forceWordOcr ?? true;
    this.reminder = config?.reminder ?? true;
    this.excludeInsideImage = config?.excludeInsideImage ?? false;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { file_source } = inputData;
    const { abortSignal } = context
    if (!fs.existsSync(file_source))
      throw new Error(`File '${file_source}' does not exist.`);
    const stats = await fs.promises.stat(file_source);
    if (!stats.isFile())
      throw new Error(`'${file_source}' is not a file.`);
    if (stats.size === 0)
      throw new Error(`File '${file_source}' is empty.`);



    const appInfo = await appManager.getInfo();
    const defaultOcr = appInfo?.defaultModel?.ocrModel;


    const ext = path.extname(file_source).toLowerCase();

    let content = '';
    const mimeType = mime.lookup(file_source);
    const provider = await providersManager.getProvider(defaultOcr);
    if (!provider) {
      throw new Error(`OCR provider not found`);
    }
    const ocrModel = defaultOcr.split('/').slice(1).join('/');
    let result = ''

    if (ext === '.pdf') {
      try {
        if (this.forcePDFOcr === true) {
          const result = await provider.ocrModel(ocrModel).doOCR({ image: file_source, excludeInsideImage: this.excludeInsideImage, abortSignal });
          return result;
        }
      } catch (err) {
        console.log(err)
      }
      const loader = new PDFLoader(file_source);
      const content = await loader.load();
      result = content;
    } else if (ext === '.docx' || ext === '.doc') {
      try {
        if (this.forceWordOcr === true) {
          result = await provider.ocrModel(ocrModel).doOCR({ image: file_source, excludeInsideImage: this.excludeInsideImage, abortSignal });
          if (!result) throw new Error('OCR result is empty');
        }
      } catch {

      }
      const loader = new WordLoader(file_source, {
        type: ext === '.docx' ? 'docx' : 'doc',
      });
      // const info = await loader.info();
      const content = await loader.load();
      result = content;
    } else if (ext === '.xls' || ext === '.xlsx') {
      const loader = new ExcelLoader(file_source);
      const content = await loader.load();
      result = content;
    } else if (ext === '.ppt' || ext === '.pptx') {
      const loader = new PowerPointLoader(file_source);
      const content = await loader.load();
      result = content;
    } else if (mimeType.startsWith('image/')) {


      result = await provider.ocrModel(ocrModel).doOCR({ image: file_source, excludeInsideImage: this.excludeInsideImage, abortSignal });


      // throw new Error(`Unsupported file type: ${mimeType}`);


      // 使用 paddle OCR 进行图像文字识别
      // const loader = new OcrLoader(file_source, { modelId: defaultOcr });
      // const content = await loader.load();
      // return content;
    } else if (mimeType.startsWith('audio/')) {
      let speechToText = await toolsManager.buildTool(
        `${ToolType.BUILD_IN}:${SpeechToText.toolName}` as `${ToolType.BUILD_IN}:${string}`,
        // toolEntity.value ?? {},
      );


      //const speechToText = new SpeechToText();
      const content = await (speechToText as SpeechToText).execute({
        source: file_source,
        output_type: 'srt',
      }, context);
      result = content
      // const loader = new AudioLoader(file_source, { outputType: 'asr' });
      // const content = await loader.load();
      // return content.text;
    }
    if (result.trim() === '' && this.reminder == true) return `<system-reminder>The file '${file_source}' is empty.</system-reminder>`;
    return result;
  };

}
