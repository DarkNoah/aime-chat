import fs from "node:fs";
import path from "node:path";
import psList from "ps-list";

type CheckResult = {
  userDataDir: string;
  exists: boolean;
  lockFiles: string[];
  matchedProcesses: Array<{
    pid: number;
    name: string;
    cmdline: string;
  }>;
  inUse: boolean;
  staleLock: boolean;
};

function normalizePath(p: string) {
  let resolved = path.resolve(p);

  // Windows 下路径比较通常忽略大小写
  if (process.platform === "win32") {
    resolved = resolved.toLowerCase();
  }

  // 去掉结尾分隔符
  resolved = resolved.replace(/[\\/]+$/, "");
  return resolved;
}

function existsFile(p: string) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listProcesses(): Promise<Array<{ pid: number; name: string; cmdline: string }>> {
  const processes = await psList();
  return processes.map((proc) => ({
    pid: proc.pid,
    name: proc.name,
    cmdline: proc.cmd ?? "",
  }));
}

export async function checkUserDataDirInUse(userDataDir: string, executablePath?: string): Promise<CheckResult> {
  const normalizedDir = normalizePath(userDataDir);
  const exists = existsFile(normalizedDir);

  const lockCandidates = ["SingletonLock", "SingletonCookie", "SingletonSocket"]
    .map((name) => path.join(normalizedDir, name))
    .filter(existsFile);

  const processes = await listProcesses();

  // 常见 Chromium 浏览器名
  const browserNamePattern =
    process.platform === "win32"
      ? /^(chrome|msedge|brave|vivaldi|chromium|opera)\.exe$/i
      : /^(chrome|google-chrome|google chrome|microsoft-edge|microsoft edge|msedge|brave|vivaldi|chromium|chromium-browser|opera)$/i;

  // 兼容：
  // --user-data-dir=/path
  // --user-data-dir "/path"
  // Windows 引号路径
  const escapedDir = escapeRegExp(normalizedDir);

  const argPatterns = [
    new RegExp(`--user-data-dir=${escapedDir}(\\s|$|")`, process.platform === "win32" ? "i" : ""),
    new RegExp(`--user-data-dir\\s+"?${escapedDir}"?(\\s|$)`, process.platform === "win32" ? "i" : ""),
  ];


  const matchedProcesses = processes.filter((proc) => {
    if (executablePath && proc.cmdline.trim() === executablePath || proc.cmdline.trim().startsWith(executablePath + ' ')) {

      if (argPatterns.some(pattern => proc.cmdline.trim().match(pattern))) {
        return true;
      } else {
        return false;
      }
      return true;
    }
    return false;
  });

  const inUse = matchedProcesses.length > 0;// || lockCandidates.length > 0;
  const staleLock = matchedProcesses.length === 0; //&& lockCandidates.length > 0;

  return {
    userDataDir: normalizedDir,
    exists,
    lockFiles: lockCandidates,
    matchedProcesses,
    inUse,
    staleLock,
  };
}
