import { app, crashReporter } from 'electron';
import { appLog } from './logger';

let initialized = false;

export const getCrashDumpDirectory = () => app.getPath('crashDumps');

const logCrashEvent = (message: string, details: Record<string, unknown>) => {
  appLog.write('error', message, {
    ...details,
    dumpDirectory: getCrashDumpDirectory(),
  });
};

export const initCrashReporter = () => {
  if (initialized) {
    return;
  }

  crashReporter.start({
    uploadToServer: false,
  });
  initialized = true;

  appLog.write('info', '[crash-reporter] initialized', {
    dumpDirectory: getCrashDumpDirectory(),
  });

  app.on('render-process-gone', (_event, _webContents, details) => {
    logCrashEvent('[crash-reporter] render process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  app.on('child-process-gone', (_event, details) => {
    logCrashEvent('[crash-reporter] child process gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
};
