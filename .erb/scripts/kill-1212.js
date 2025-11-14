#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');

const DEFAULT_PORT = 1212;

const portArg = process.argv.find((arg) => /^\d+$/.test(arg));
const port = Number(portArg ?? process.env.PORT ?? DEFAULT_PORT);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`无效端口：${portArg ?? process.env.PORT ?? ''}`);
  process.exit(1);
}

function runCommand(command) {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (error) {
    return '';
  }
}

function commandExists(command) {
  const checker =
    process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;
  try {
    execSync(checker, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function uniqueNumericIds(ids) {
  return Array.from(
    new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  );
}

function getPidsFromLsof(targetPort) {
  if (!commandExists('lsof')) {
    return [];
  }

  const commands = [
    `lsof -iTCP:${targetPort} -sTCP:LISTEN -t`,
    `lsof -i :${targetPort} -t`,
  ];

  for (const command of commands) {
    const output = runCommand(command);
    const pids = output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter(Number.isInteger);
    if (pids.length > 0) {
      return pids;
    }
  }

  return [];
}

function getPidsFromSs(targetPort) {
  if (!commandExists('ss')) {
    return [];
  }

  const output =
    runCommand(`ss -ltnp 'sport = :${targetPort}'`) +
    runCommand(`ss -lunp 'sport = :${targetPort}'`);
  const matches = Array.from(output.matchAll(/pid=(\d+)/g));
  return matches
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isInteger);
}

function getPidsFromFuser(targetPort) {
  if (!commandExists('fuser')) {
    return [];
  }

  const output =
    runCommand(`fuser -n tcp ${targetPort}`) +
    runCommand(`fuser ${targetPort}/tcp`);
  const matches = Array.from(output.matchAll(/\b(\d+)\b/g));
  return matches
    .map((match) => Number.parseInt(match[1], 10))
    .filter((pid) => Number.isInteger(pid) && pid !== targetPort);
}

function getPidsUnix(targetPort) {
  const strategies = [getPidsFromLsof, getPidsFromSs, getPidsFromFuser];

  for (const strategy of strategies) {
    const pids = uniqueNumericIds(strategy(targetPort));
    if (pids.length > 0) {
      return pids;
    }
  }

  return [];
}

function getPidsWindows(targetPort) {
  const output = runCommand(`netstat -ano | findstr ":${targetPort}"`);
  if (!output) {
    return [];
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pidSet = new Set();

  for (const line of lines) {
    if (!line.includes(`:${targetPort}`)) {
      continue;
    }
    const parts = line.trim().split(/\s+/);
    const pidCandidate = parts[parts.length - 1];
    if (/^\d+$/.test(pidCandidate)) {
      pidSet.add(Number.parseInt(pidCandidate, 10));
    }
  }

  return uniqueNumericIds(Array.from(pidSet));
}

async function getPids(targetPort) {
  switch (os.platform()) {
    case 'win32':
      return getPidsWindows(targetPort);
    case 'darwin':
    case 'linux':
      return getPidsUnix(targetPort);
    default:
      console.warn(`未针对 ${os.platform()} 定制，尝试类 Unix 策略。`);
      return getPidsUnix(targetPort);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function killPidWindows(pid) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    console.log(`已强制结束 PID ${pid}`);
  } catch (error) {
    if (error.status === 128) {
      console.log(`PID ${pid} 已不存在。`);
      return;
    }
    console.error(`终止 PID ${pid} 失败：${error.message}`);
  }
}

async function killPidUnix(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`已发送 SIGTERM 给 PID ${pid}`);
  } catch (error) {
    if (error.code === 'ESRCH') {
      console.log(`PID ${pid} 已不存在。`);
      return;
    }
    if (error.code === 'EPERM') {
      console.error(`无权限终止 PID ${pid}：${error.message}`);
      return;
    }
    throw error;
  }

  await sleep(500);

  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') {
      console.log(`PID ${pid} 已结束。`);
      return;
    }
    if (error.code === 'EPERM') {
      console.error(`检查 PID ${pid} 状态时无权限：${error.message}`);
      return;
    }
    throw error;
  }

  try {
    process.kill(pid, 'SIGKILL');
    console.log(`已发送 SIGKILL 给 PID ${pid}`);
  } catch (error) {
    if (error.code === 'ESRCH') {
      console.log(`PID ${pid} 已结束。`);
      return;
    }
    if (error.code === 'EPERM') {
      console.error(`无权限强制终止 PID ${pid}：${error.message}`);
      return;
    }
    throw error;
  }
}

async function killPid(pid) {
  if (os.platform() === 'win32') {
    await killPidWindows(pid);
  } else {
    await killPidUnix(pid);
  }
}

async function main() {
  const pids = uniqueNumericIds(await getPids(port));

  if (pids.length === 0) {
    console.log(`端口 ${port} 当前空闲，无需处理。`);
    return;
  }

  console.log(`端口 ${port} 被以下进程占用：${pids.join(', ')}`);

  for (const pid of pids) {
    try {
      await killPid(pid);
    } catch (error) {
      console.error(`处理 PID ${pid} 时发生错误：${error.message}`);
    }
  }

  console.log('处理完成。');
}

main().catch((error) => {
  console.error(`脚本执行失败：${error.message}`);
  process.exit(1);
});
