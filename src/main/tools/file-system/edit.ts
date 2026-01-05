import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import fs from 'fs';
import BaseTool from '../base-tool';
import { needReadFile, updateFileModTime, formatCodeWithLineNumbers } from '.';

export class Edit extends BaseTool {
  static readonly toolName = 'Edit';
  id: string = 'Edit';
  description: string = `Performs exact string replacements in files.

Usage:

- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`;

  inputSchema = z.object({
    file_path: z.string().describe('The absolute path to the file to modify'),
    old_string: z.string().describe('The text to replace'),
    new_string: z
      .string()
      .describe(
        'The text to replace it with (must be different from old_string)',
      ),
    replace_all: z
      .boolean()
      .default(false)
      .describe('Replace all occurences of old_string (default false)'),
  });
  outputSchema = z.string();
  // requireApproval: true,
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const {
      file_path,
      old_string,
      new_string,
      replace_all = false,
    } = inputData;
    if (!fs.existsSync(file_path)) {
      throw new Error(`File ${file_path} does not exist.`);
    }

    if (!fs.statSync(file_path).isFile()) {
      throw new Error(`File ${file_path} is not a file.`);
    }

    const { requestContext } = context;

    if (await needReadFile(file_path, context.requestContext)) {
      throw new Error(
        `File '${file_path}' has been modified since last read. Please use 'Read' tool to read the file first and then do this again.`,
      );
    }

    let content = '';

    if (fs.existsSync(file_path)) {
      content = fs.readFileSync(file_path, 'utf-8').replaceAll(`\r\n`, `\n`);
    }
    // if (old_string === new_string)
    //   throw new Error('old_string and new_string are the same');

    const new_content = patchFile(file_path, content, [
      {
        old_string,
        new_string,
        replace_all,
      },
    ]);
    await fs.promises.writeFile(file_path, new_content);

    await updateFileModTime(file_path, context.requestContext);

    if (replace_all)
      return `The file ${file_path} has been updated. All occurrences of '${old_string}' were successfully replaced with '${new_string}'.`;

    const { snippet, startLine } = replaceSnippetWithContext(
      content || '',
      old_string,
      new_string,
    );
    return `The file ${file_path} has been updated. Here's the result of running \`cat -n\` on a snippet of the edited file:
${formatCodeWithLineNumbers({ content: snippet, startLine })}`;
  };
}

// export class MultiEdit extends BaseTool {
//   id: string = 'MultiEdit';
//   description: string = `This is a tool for making multiple edits to a single file in one operation. It is built on top of the \`edit\` tool and allows you to perform multiple find-and-replace operations efficiently. Prefer this tool over the \`edit\` tool when you need to make multiple edits to the same file.

// Before using this tool:

// 1. Use the \`file_read\` tool to understand the file's contents and context
// 2. Verify the directory path is correct

// To make multiple file edits, provide the following:
// 1. file_path: The absolute path to the file to modify (must be absolute, not relative)
// 2. edits: An array of edit operations to perform, where each edit contains:
//    - old_string: The text to replace (must match the file contents exactly, including all whitespace and indentation)
//    - new_string: The edited text to replace the old_string
//    - replace_all: Replace all occurences of old_string. This parameter is optional and defaults to false.

// IMPORTANT:
// - All edits are applied in sequence, in the order they are provided
// - Each edit operates on the result of the previous edit
// - All edits must be valid for the operation to succeed - if any edit fails, none will be applied
// - This tool is ideal when you need to make several changes to different parts of the same file

// CRITICAL REQUIREMENTS:
// 1. All edits follow the same requirements as the single Edit tool
// 2. The edits are atomic - either all succeed or none are applied
// 3. Plan your edits carefully to avoid conflicts between sequential operations

// WARNING:
// - The tool will fail if edits.old_string doesn't match the file contents exactly (including whitespace)
// - The tool will fail if edits.old_string and edits.new_string are the same
// - Since edits are applied in sequence, ensure that earlier edits don't affect the text that later edits are trying to find

// When making edits:
// - Ensure all edits result in idiomatic, correct code
// - Do not leave the code in a broken state
// - Always use absolute file paths (starting with /)
// - Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
// - Use replace_all for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.

// If you want to create a new file, use:
// - A new file path, including dir name if needed
// - First edit: empty old_string and the new file's contents as new_string
// - Subsequent edits: normal edit operations on the created content`;

//   inputSchema = z.strictObject({
//     file_path: z.string().describe('The path to the file to modify.'),
//     edits: z
//       .array(
//         z.object({
//           old_string: z.string().describe('The text to replace'),
//           new_string: z.string().describe('The text to replace it with'),
//           replace_all: z
//             .boolean()
//             .default(false)
//             .optional()
//             .describe('Replace all occurences of old_string (default false).'),
//         }),
//       )
//       .min(1, 'At least one edit is required')
//       .describe('Array of edit operations to perform sequentially on the file'),
//   });
//   outputSchema = z.string();
//   // requireApproval: true,
//   execute = async (
//     inputData: z.infer<typeof this.inputSchema>,
//     context: ToolExecutionContext<z.ZodSchema, any>,
//   ) => {
//     const workspace = parentConfig?.configurable?.workspace;

//     const { file_path, edits } = inputData;
//     let _file_path = file_path;

//     if (!path.isAbsolute(file_path)) {
//       _file_path = path.join(workspace, file_path);
//     }

//     if (!fs.existsSync(_file_path)) {
//       throw new Error(`File ${_file_path} does not exist.`);
//     }

//     if (fileSystemManager.needReadFile(_file_path)) {
//       throw new Error(
//         `File '${_file_path}' has been modified since last read. Please use 'Read' tool to read the file first and then do this again.`,
//       );
//     }

//     let content = '';

//     if (fs.existsSync(_file_path)) {
//       content = fs.readFileSync(_file_path, 'utf-8').replaceAll(`\r\n`, `\n`);
//     }
//     const new_content = patchFile(_file_path, content, edits);

//     fs.mkdirSync(path.dirname(_file_path), { recursive: true });

//     await fs.promises.writeFile(_file_path, new_content);
//     fileSystemManager.updateFileModTime(_file_path);

//     return `Applied ${edits.length} edit${edits.length === 1 ? '' : 's'} to ${_file_path}:
// ${edits
//   .map(
//     (Z, D) =>
//       `${D + 1}. Replaced "${Z.old_string.substring(0, 50)}${Z.old_string.length > 50 ? '...' : ''}" with "${Z.new_string.substring(0, 50)}${Z.new_string.length > 50 ? '...' : ''}"`,
//   )
//   .join(`\n`)}`;
//   };
// }

const replaceSnippetWithContext = (
  text,
  oldString,
  newString,
  contextLines = 4,
) => {
  // Calculate the line number where the oldString appears
  const lineNumber = (text.split(oldString)[0] ?? '').split(/\r?\n/).length - 1;

  // Replace the oldString with newString in the text
  const replacedText = safeReplace(text, oldString, newString).split(/\r?\n/);

  // Calculate the start and end lines for the context window
  const startLine = Math.max(0, lineNumber - contextLines);
  const endLine = lineNumber + contextLines + oldString.split(/\r?\n/).length;

  // Return the snippet with context and the starting line number
  return {
    snippet: replacedText.slice(startLine, endLine).join(`\n`),
    startLine: startLine + 1, // Converting to 1-based line numbering
  };
};

const safeReplace = (
  sourceString: string,
  searchValue: string,
  replaceValue: string,
  replaceAll = false,
) => {
  const replacer = replaceAll
    ? (str: string, search: string, replace: string) =>
        str.replaceAll(search, () => replace)
    : (str: string, search: string, replace: string) =>
        str.replace(search, () => replace);

  if (replaceValue !== '') {
    return replacer(sourceString, searchValue, replaceValue);
  }

  return !searchValue.endsWith(`\n`) &&
    sourceString.includes(`${searchValue}\n`)
    ? replacer(sourceString, `${searchValue}\n`, replaceValue)
    : replacer(sourceString, searchValue, replaceValue);
};

const patchFile = (
  filePath: string,
  fileContents: string,
  edits: { old_string: string; new_string: string; replace_all: boolean }[],
) => {
  let contents = fileContents;
  const newContents: string[] = [];
  for (const edit of edits) {
    const oldString = edit.old_string.replace(/\n+$/, '');
    for (const newContent of newContents)
      if (oldString !== '' && newContent.includes(oldString))
        throw new Error(
          'Cannot edit file: old_string is a substring of a new_string from a previous edit.',
        );
    const W = contents;
    contents =
      edit.old_string === ''
        ? edit.new_string
        : safeReplace(
            contents,
            edit.old_string,
            edit.new_string,
            edit.replace_all,
          );

    if (contents === W && edit.old_string != edit.new_string)
      throw new Error('String not found in file. Failed to apply edit.');
    newContents.push(edit.new_string);
  }
  if (contents === fileContents)
    throw new Error(
      'Original and edited file match exactly. Failed to apply edit.',
    );
  return contents;
};
