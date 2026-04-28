import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { rgPath as rawRgPath } from '@vscode/ripgrep';

export * from './pdf';

/**
 * 解析 @vscode/ripgrep 提供的 rgPath。
 * 打包后 rgPath 会指向 app.asar 内部，spawn 无法执行；
 * 需要替换为 app.asar.unpacked 中的真实磁盘文件路径。
 */
export const getRgPath = (): string => {
  if (!rawRgPath) return rawRgPath;
  if (rawRgPath.includes('app.asar') && !rawRgPath.includes('app.asar.unpacked')) {
    return rawRgPath.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`,
    );
  }
  return rawRgPath;
};

export const getDataPath = (...paths: string[]) => {
  let userData;
  if (app.isPackaged) {
    userData = app.getPath('userData');
  } else {
    userData = app.getAppPath();
  }
  userData = app.getPath('userData');

  const dataPath = path.join(userData, 'data');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return path.join(dataPath, ...paths);
};

export const getDbPath = () => {
  return getDataPath('main.db');
};

export const getDefaultModelPath = () => {
  const userData = app.getPath('userData');
  const modelsPath = path.join(userData, 'models');
  if (!fs.existsSync(modelsPath)) {
    fs.mkdirSync(modelsPath, { recursive: true });
  }
  return modelsPath;
};

export const getAssetPath = (...paths: string[]): string => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');
  return path.join(RESOURCES_PATH, ...paths);
};
