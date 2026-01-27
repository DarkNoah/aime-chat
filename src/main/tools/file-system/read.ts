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
import { OcrLoader } from '@/main/utils/loaders/ocr-loader';
import { ToolConfig } from '@/types/tool';

const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;
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
- This tool allows to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.
- This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.
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
          'The line number to start reading from. Only provide if the file is too large to read at once',
        ),
      limit: z
        .number()
        .optional()
        .describe(
          'The number of lines to read. Only provide if the file is too large to read at once.',
        ),
    })
    .strict();
  outputSchema = z.string();
  // requireApproval: true,
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { file_path, offset, limit } = inputData;
    if (!fs.existsSync(file_path))
      throw new Error(`File '${file_path}' does not exist.`);

    const stats = await fs.promises.stat(file_path);

    if (!stats.isFile()) throw new Error(`File '${file_path}' is not a file.`);

    if (stats.size === 0) {
      await updateFileModTime(file_path, context.requestContext);
      return `<system-reminder>The file '${file_path}' is empty.</system-reminder>`;
    }

    if (offset !== undefined && offset < 0) {
      throw new Error('Offset must be a non-negative number');
    }
    if (limit !== undefined && limit <= 0) {
      throw new Error('Limit must be a positive number');
    }

    if (await isBinaryFile(file_path)) {
      throw new Error(
        `The file '${file_path}' is a binary file. please use ReadBinaryFile tool to read the file.`,
      );
    }

    const ext = path.extname(file_path).toLowerCase();

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
      throw new Error(
        `Error: offset is out of range, offset: ${startLine}, originalLineCount: ${originalLineCount}`,
      );
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

    let llmTextContent = '';
    if (contentRangeTruncated) {
      llmTextContent += `<system-reminder>File content truncated: showing lines ${actualStartLine + 1}-${endLine} of ${originalLineCount} total lines. Use offset/limit parameters to view more.</system-reminder>\n`;
    } else if (linesWereTruncatedInLength) {
      llmTextContent += `<system-reminder>File content partially truncated: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.</system-reminder>\n`;
    }

    const formattedLines = formatCodeWithLineNumbers({
      content: selectedLines.join('\n'),
      startLine: actualStartLine,
    });

    llmTextContent += formattedLines;
    await updateFileModTime(file_path, context.requestContext);
    return llmTextContent;
  };
}

export interface ReadBinaryFileParams extends BaseToolParams {
  mode?: 'auto' | 'system' | 'paddleocr' | 'mineru-api';
  forcePDFOcr?: boolean;
  forceWordOcr?: boolean;
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

  constructor(config?: ReadBinaryFileParams) {
    super(config);
    this.mode = config?.mode ?? 'auto';
    this.forcePDFOcr = config?.forcePDFOcr ?? false;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { file_source } = inputData;
    if (!fs.existsSync(file_source))
      throw new Error(`File '${file_source}' does not exist.`);
    const stats = await fs.promises.stat(file_source);
    if (!stats.isFile())
      throw new Error(`File '${file_source}' is not a file.`);
    if (stats.size === 0)
      return `<system-reminder>The file '${file_source}' is empty.</system-reminder>`;

    const ext = path.extname(file_source).toLowerCase();

    let content = '';
    const mimeType = mime.lookup(file_source);
    if (ext === '.pdf') {
      if (this.forcePDFOcr) {
        const loader = new OcrLoader(file_source, { mode: this.mode });
        const content = await loader.load();
        return content;
      } else {
        const loader = new PDFLoader(file_source);
        const content = await loader.load();
        return content;
      }
    } else if (ext === '.docx' || ext === '.doc') {
      const loader = new WordLoader(file_source);
      // const info = await loader.info();
      const content = await loader.load();
      return content;
    } else if (ext === '.xls' || ext === '.xlsx') {
      const loader = new ExcelLoader(file_source);
      const content = await loader.load();
      return content;
    } else if (ext === '.ppt' || ext === '.pptx') {
      const loader = new PowerPointLoader(file_source);
      const content = await loader.load();
      return content;
    } else if (mimeType.startsWith('image/')) {
      // 使用 paddle OCR 进行图像文字识别
      const loader = new OcrLoader(file_source, { mode: this.mode });
      const content = await loader.load();
      return content;
    }
    return content;
  };
}
