import fs, { createWriteStream } from 'fs';
import path from 'path';
import { isString, isUrl } from '@/utils/is';
import { nanoid } from '@/utils/nanoid';
import { app } from 'electron';

export const saveFile = async (
  data: string | Buffer,
  filePath: string,
  workspace?: string,
): Promise<string> => {
  // const workspace = config?.configurable?.workspace;
  let _filePath = filePath;
  if (!path.isAbsolute(_filePath)) {
    _filePath = workspace
      ? path.join(workspace, filePath)
      : path.join(app.getPath('temp'), filePath);
  }
  if (isString(data) && isUrl(data)) {
    return await downloadFile(data, _filePath);
  } else if (data instanceof Buffer) {
    await fs.promises.writeFile(_filePath, data);
    return _filePath;
  } else {
    throw new Error('not support');
  }
};

export const downloadFile = async (
  url: string,
  savePath?: string,
): Promise<string> => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer);

    // 如果未指定保存路径，生成一个临时路径
    let finalSavePath = savePath;
    if (!finalSavePath) {
      finalSavePath = path.join(
        app.getPath('temp'),
        `${nanoid()}${path.extname(url) || ''}`,
      );
    }

    return new Promise((resolve, reject) => {
      const writer = createWriteStream(finalSavePath);
      writer.on('error', (err) => {
        reject(err);
      });
      writer.on('finish', () => {
        resolve(finalSavePath);
      });
      writer.write(data);
      writer.end();
    });
  } catch (error) {
    console.error('文件下载错误:', error);
    throw error;
  }
};

export const base64ToFile = async (
  base64: string,
  savePath: string,
): Promise<string> => {
  const buffer = Buffer.from(base64, 'base64');
  const writer = createWriteStream(savePath);
  writer.write(buffer);
  writer.end();
  return savePath;
};

export const imageToBase64 = async (filePath: string): Promise<string> => {
  const data = await fs.promises.readFile(filePath);
  return data.toString('base64');
};
