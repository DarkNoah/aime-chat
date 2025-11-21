import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import fs from 'fs';

export const Edit = createTool({
  id: 'Edit',
  description: `Performs exact string replacements in files.

Usage:

- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
  inputSchema: z.object({
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
  }),
  outputSchema: z.string(),
  execute: async (
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

    if (fileSystemManager.needReadFile(file_path)) {
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

    fileSystemManager.updateFileModTime(file_path);

    if (replace_all)
      return `The file ${file_path} has been updated. All occurrences of '${old_string}' were successfully replaced with '${new_string}'.`;

    const { snippet, startLine } = replaceSnippetWithContext(
      content || '',
      old_string,
      new_string,
    );
    return `The file ${file_path} has been updated. Here's the result of running \`cat -n\` on a snippet of the edited file:
${formatCodeWithLineNumbers({ content: snippet, startLine })}`;
  },
});

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

const formatCodeWithLineNumbers = ({
  content: codeContent,
  startLine: startingLine,
}) => {
  if (!codeContent) return '';

  return codeContent
    .split(/\r?\n/)
    .map((line, index) => {
      const lineNumber = index + startingLine;
      const lineNumberStr = String(lineNumber);

      // Format line number with padding if needed
      if (lineNumberStr.length >= 6) {
        return `${lineNumberStr}\t${line}`;
      }
      return `${lineNumberStr.padStart(6, ' ')}\t${line}`;
    })
    .join('\n');
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
