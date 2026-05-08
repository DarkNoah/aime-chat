import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import log from 'electron-log';

const LOG_FILE_NAME = 'main.log';
const MAX_LOG_OUTPUT_LENGTH = 4000;

type LogLevel = 'info' | 'warn' | 'error' | 'debug';
type LogData = Record<string, unknown>;

const trimLogOutput = (value?: string) => {
  if (!value) return undefined;
  if (value.length <= MAX_LOG_OUTPUT_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_OUTPUT_LENGTH)}... [truncated]`;
};

export const getLogDirectory = () => {
  const logDirectory = app.getPath('logs');
  fs.mkdirSync(logDirectory, { recursive: true });
  return logDirectory;
};

export const getLogFilePath = () => {
  const file = log.transports.file.getFile();
  return file.path;
};

log.initialize();
log.transports.file.level = 'info';
log.transports.file.maxSize = 1024 * 1024 * 10;
log.transports.file.resolvePathFn = () =>
  path.join(getLogDirectory(), LOG_FILE_NAME);
log.transports.console.level =
  process.env.NODE_ENV === 'development' ? 'debug' : 'warn';

const normalizeLogData = (data?: LogData) => {
  if (!data) return undefined;

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? trimLogOutput(value) : value,
    ]),
  );
};

export const appLog = {
  write(level: LogLevel, message: string, data?: LogData) {
    log[level](message, normalizeLogData(data));
  },
};
