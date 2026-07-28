import fs from 'fs';
import os from 'os';
import path from 'path';
import { readTextFileRange } from '../text-file-reader';

describe('readTextFileRange', () => {
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'aime-text-reader-'),
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  });

  it('reads only the requested range while counting all lines', async () => {
    const filePath = path.join(tempDirectory, 'large.csv');
    await fs.promises.writeFile(filePath, 'header\r\nrow-1\r\nrow-2\r\n');

    await expect(readTextFileRange(filePath, 1, 2, 2000)).resolves.toEqual({
      lines: ['row-1', 'row-2'],
      originalLineCount: 4,
      linesWereTruncatedInLength: false,
    });
  });

  it('preserves a final empty line', async () => {
    const filePath = path.join(tempDirectory, 'trailing-newline.txt');
    await fs.promises.writeFile(filePath, 'first\n');

    const result = await readTextFileRange(filePath, 0, 10, 2000);

    expect(result.lines).toEqual(['first', '']);
    expect(result.originalLineCount).toBe(2);
  });

  it('bounds memory used by long selected lines and marks them truncated', async () => {
    const filePath = path.join(tempDirectory, 'long-row.csv');
    await fs.promises.writeFile(filePath, `${'x'.repeat(10000)}\nshort`);

    const result = await readTextFileRange(filePath, 0, 2, 20);

    expect(result.lines).toEqual([`${'x'.repeat(20)}... [truncated]`, 'short']);
    expect(result.originalLineCount).toBe(2);
    expect(result.linesWereTruncatedInLength).toBe(true);
  });

  it('does not report truncation for long lines outside the requested range', async () => {
    const filePath = path.join(tempDirectory, 'unselected-long-row.csv');
    await fs.promises.writeFile(filePath, `${'x'.repeat(10000)}\nshort`);

    const result = await readTextFileRange(filePath, 1, 1, 20);

    expect(result.lines).toEqual(['short']);
    expect(result.linesWereTruncatedInLength).toBe(false);
  });
});
