import fs from 'fs';

export interface TextFileRange {
  lines: string[];
  originalLineCount: number;
  linesWereTruncatedInLength: boolean;
}

/**
 * Scan a UTF-8 text file without materializing the whole file in memory.
 *
 * The line semantics intentionally match `content.split(/\r?\n/)`, including
 * the final empty line when a file ends with a newline.
 */
export async function readTextFileRange(
  filePath: string,
  startLine: number,
  lineLimit: number,
  maxLineLength: number,
): Promise<TextFileRange> {
  const lines: string[] = [];
  let originalLineCount = 0;
  let linesWereTruncatedInLength = false;
  let linePrefix = '';
  let lineLength = 0;
  let lastCharacter = '';

  const appendLinePart = (part: string) => {
    if (!part) return;

    lineLength += part.length;
    lastCharacter = part[part.length - 1];

    const remainingPrefixLength = maxLineLength - linePrefix.length;
    if (remainingPrefixLength > 0) {
      linePrefix += part.slice(0, remainingPrefixLength);
    }
  };

  const finishLine = (endedByNewline: boolean) => {
    const hasCarriageReturn = endedByNewline && lastCharacter === '\r';
    const effectiveLineLength = lineLength - (hasCarriageReturn ? 1 : 0);
    const isSelected =
      originalLineCount >= startLine &&
      originalLineCount < startLine + lineLimit;

    if (isSelected) {
      const prefix =
        hasCarriageReturn && linePrefix.endsWith('\r')
          ? linePrefix.slice(0, -1)
          : linePrefix;
      if (effectiveLineLength > maxLineLength) {
        linesWereTruncatedInLength = true;
        lines.push(`${prefix.slice(0, maxLineLength)}... [truncated]`);
      } else {
        lines.push(prefix);
      }
    }

    originalLineCount += 1;
    linePrefix = '';
    lineLength = 0;
    lastCharacter = '';
  };

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  for await (const chunk of stream) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let position = 0;
    let newlinePosition = text.indexOf('\n', position);

    while (newlinePosition !== -1) {
      appendLinePart(text.slice(position, newlinePosition));
      finishLine(true);
      position = newlinePosition + 1;
      newlinePosition = text.indexOf('\n', position);
    }

    appendLinePart(text.slice(position));
  }

  finishLine(false);

  return {
    lines,
    originalLineCount,
    linesWereTruncatedInLength,
  };
}
