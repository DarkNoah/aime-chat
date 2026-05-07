#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');

const WEBPACK_PATTERN = /(^|[\s/\\])webpack($|[\s.:/\\-])/i;
const cwd = path.resolve(process.cwd());
const dryRun = process.argv.includes('--dry-run');

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return '';
  }
}

function parseUnixProcesses(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/,
      );

      if (!match) {
        return null;
      }

      const [, pid, ppid, cpu, memory, elapsed, command, args] = match;

      return {
        pid,
        ppid,
        cpu,
        memory,
        elapsed,
        name: path.basename(command || ''),
        commandLine: args,
      };
    })
    .filter(Boolean);
}

function getUnixProcesses() {
  const output = run('ps', [
    '-axo',
    'pid=,ppid=,pcpu=,pmem=,etime=,comm=,args=',
  ]);

  return parseUnixProcesses(output);
}

function getWindowsProcesses() {
  const script = [
    "$processes = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'webpack' -or $_.CommandLine -match 'webpack' }",
    '$processes | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
  ].join('; ');
  const output = run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);

  if (!output.trim()) {
    return [];
  }

  try {
    const data = JSON.parse(output);
    const processes = Array.isArray(data) ? data : [data];
    return processes.map((processInfo) => ({
      pid: String(processInfo.ProcessId || ''),
      ppid: String(processInfo.ParentProcessId || ''),
      cpu: '-',
      memory: '-',
      elapsed: '-',
      name: processInfo.Name || '',
      commandLine: processInfo.CommandLine || processInfo.Name || '',
    }));
  } catch (error) {
    console.error(`解析 Windows 进程信息失败：${error.message}`);
    return [];
  }
}

function isWebpackProcess(processInfo) {
  if (processInfo.pid === String(process.pid)) {
    return false;
  }

  const name = path.basename(processInfo.name || '').replace(/\.exe$/i, '');
  return (
    name.toLowerCase() === 'webpack' ||
    WEBPACK_PATTERN.test(processInfo.commandLine)
  );
}

function startsWithNodeInCurrentWorkingDirectory(processInfo) {
  return processInfo.commandLine.startsWith(`node ${cwd}`);
}

function getTargetProcesses() {
  const processes =
    process.platform === 'win32' ? getWindowsProcesses() : getUnixProcesses();

  return processes.filter(
    (processInfo) =>
      isWebpackProcess(processInfo) &&
      startsWithNodeInCurrentWorkingDirectory(processInfo),
  );
}

function formatTable(rows) {
  const headers = ['PID', 'PPID', 'CPU%', 'MEM%', 'ELAPSED', 'NAME', 'COMMAND'];
  const data = rows.map((row) => [
    row.pid,
    row.ppid,
    row.cpu,
    row.memory,
    row.elapsed,
    row.name,
    row.commandLine,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...data.map((row) => String(row[index] || '').length),
    ),
  );

  const renderRow = (row) =>
    row
      .map((cell, index) => String(cell || '').padEnd(widths[index], ' '))
      .join('  ');

  return [
    renderRow(headers),
    renderRow(widths.map((width) => '-'.repeat(width))),
    ...data.map(renderRow),
  ].join('\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function killPidWindows(pid) {
  try {
    execFileSync('taskkill.exe', ['/F', '/PID', String(pid)], {
      stdio: 'ignore',
    });
    console.log(`已强制结束 PID ${pid}`);
  } catch (error) {
    console.error(`终止 PID ${pid} 失败：${error.message}`);
  }
}

async function killPid(pid) {
  if (process.platform === 'win32') {
    killPidWindows(pid);
  } else {
    await killPidUnix(pid);
  }
}

async function main() {
  const targetProcesses = getTargetProcesses();

  if (targetProcesses.length === 0) {
    console.log(`未检测到命令行以 "node ${cwd}" 开头的 webpack 相关进程。`);
    return;
  }

  console.log(`检测到 ${targetProcesses.length} 个待处理 webpack 相关进程：`);
  console.log(formatTable(targetProcesses));

  if (dryRun) {
    console.log('dry-run 模式：未结束任何进程。');
    return;
  }

  for (const processInfo of targetProcesses) {
    const pid = Number.parseInt(processInfo.pid, 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      console.error(`跳过无效 PID：${processInfo.pid}`);
      continue;
    }

    await killPid(pid);
  }

  console.log('处理完成。');
}

main().catch((error) => {
  console.error(`脚本执行失败：${error.message}`);
  process.exit(1);
});
