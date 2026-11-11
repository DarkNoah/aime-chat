import fs from 'fs';
import path from 'path';
import { getRuntimeDirectory } from './runtime-directory';

export function getManagedAgentBrowserEntry(directory = getRuntimeDirectory()) {
  return path.join(
    directory,
    'agent-browser',
    'node_modules',
    'agent-browser',
    'bin',
    'agent-browser.js',
  );
}

export function getAgentBrowserCommand() {
  const entry = getManagedAgentBrowserEntry();
  return fs.existsSync(entry)
    ? { command: 'node', args: [entry] }
    : { command: 'agent-browser', args: [] as string[] };
}

export function getAgentBrowserVersionCommand() {
  const { command, args } = getAgentBrowserCommand();
  return `${command}${args.map((arg) => ` "${arg}"`).join('')} -V`;
}
