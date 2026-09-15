import { isFileWithinDirectory } from './file-preview-path';

it.each([
  ['/workspace/output/report.pdf', '/workspace', true],
  ['/workspace-other/report.pdf', '/workspace', false],
  ['/workspace/../outside/report.pdf', '/workspace', false],
  ['/workspace/output/../report.pdf', '/workspace', true],
  ['/Workspace/report.pdf', '/workspace', false],
  ['/report.pdf', '/', true],
  ['relative/report.pdf', '/workspace', false],
  ['https://example.com/report.pdf', '/workspace', false],
  ['C:\\Work\\report.pdf', 'c:\\work\\', true],
  ['C:\\Work-other\\report.pdf', 'c:\\work', false],
  ['C:\\Work\\..\\report.pdf', 'c:\\work', false],
  ['\\\\server\\share\\report.pdf', '\\\\server\\share', true],
])('checks whether %s belongs to %s', (file, workspace, expected) => {
  expect(isFileWithinDirectory(file, workspace)).toBe(expected);
});
