export const formatCodeWithLineNumbers = ({
  content: codeContent,
  startLine: startingLine,
}) => {
  if (!codeContent) return '';

  const arr = codeContent.split(/\r?\n/).map((line, index) => {
    const lineNumber = index + startingLine;
    const lineNumberStr = String(lineNumber);
    return lineNumberStr.length;
  });
  const max = Math.max(...arr) > 6 ? Math.max(...arr) : 6;

  return codeContent
    .split(/\r?\n/)
    .map((line, index) => {
      const lineNumber = index + startingLine;
      const lineNumberStr = String(lineNumber);

      // Format line number with padding if needed
      // if (lineNumberStr.length >= 6) {
      //   return `${lineNumberStr}→${line}`;
      // }
      return `${lineNumberStr.padStart(max, ' ')}→${line}`;
    })
    .join('\n');
};
