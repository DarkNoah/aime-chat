import { app } from 'electron';
import path from 'path';
import fs from 'fs';

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
