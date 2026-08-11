import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export * from './pdf';
export { getRgPath } from './ripgrep';

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

const UNINSTALL_MODEL_PATH_FILENAME = 'uninstall-model-path.txt';
const MODEL_DIRECTORY_MARKER_FILENAME = '.aime-chat-model-directory';

/**
 * Leave the active model directory in a format that the Windows uninstaller can
 * read without having to inspect the application database. The marker inside
 * the model directory lets the uninstaller verify that the app has used it.
 */
export const persistModelPathForUninstaller = (modelPath: string) => {
  if (process.platform !== 'win32' || !app.isPackaged) return;

  try {
    const resolvedModelPath = path.resolve(modelPath);
    const userData = app.getPath('userData');
    const unsafeModelPaths = [
      path.parse(resolvedModelPath).root,
      app.getPath('home'),
      app.getPath('appData'),
      userData,
      app.getPath('desktop'),
      app.getPath('documents'),
      app.getPath('downloads'),
      path.dirname(process.execPath),
    ].map((value) => path.resolve(value).toLowerCase());

    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(
      path.join(userData, UNINSTALL_MODEL_PATH_FILENAME),
      resolvedModelPath,
      'utf16le',
    );
    if (unsafeModelPaths.includes(resolvedModelPath.toLowerCase())) return;

    fs.writeFileSync(
      path.join(resolvedModelPath, MODEL_DIRECTORY_MARKER_FILENAME),
      '',
      { flag: 'a' },
    );
  } catch {
    // Failing to write uninstall metadata must not prevent the app from
    // starting or saving settings. The uninstaller will disable model cleanup.
  }
};

export const getAssetPath = (...paths: string[]): string => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');
  return path.join(RESOURCES_PATH, ...paths);
};
