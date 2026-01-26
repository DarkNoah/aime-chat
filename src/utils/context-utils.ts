import { FileInfo } from '@/types/common';
import { isString } from './is';

export async function splitContextAndFiles(input: string): Promise<{
  context: string;
  attachments: FileInfo[];
}> {
  if (!isString(input)) {
    return { context: input, attachments: [] };
  }
  if (!input || !(input.includes('<file>') || input.includes('<folder>'))) {
    return { context: input, attachments: [] };
  }
  const attachments: FileInfo[] = [];
  const fileRegex = /<file>([\s\S]*?)<\/file>/g;
  let match: RegExpExecArray | null;

  // 提取所有 <file>xxx</file> 内容

  while ((match = fileRegex.exec(input)) !== null) {
    const path = match[1];
    const info = await window.electron.app.getFileInfo(path);
    attachments.push(info);
  }

  // 去掉所有 <file>...</file> 后，剩下的就是 context
  let context = input.replace(fileRegex, '').trim();

  const folderRegex = /<folder>([\s\S]*?)<\/folder>/g;
  while ((match = folderRegex.exec(input)) !== null) {
    const path = match[1];
    const info = await window.electron.app.getFileInfo(path);
    attachments.push(info);
  }
  context = context.replace(folderRegex, '').trim();

  return { context, attachments: attachments };
}
