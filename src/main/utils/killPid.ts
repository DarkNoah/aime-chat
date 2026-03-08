import { promisify } from "node:util";
import { execFile } from "node:child_process";
const execFileAsync = promisify(execFile);

export async function killPidForce(pid: number) {
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } catch {
      // ignore
    }
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
}

export async function closePidGracefully(pid: number) {
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T"]);
    } catch {
      // 忽略，后面会检查是否仍存活
    }
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param timeoutMs 超时后强制 kill，默认 5 秒
 * @param intervalMs 轮询间隔，默认 300ms
 */
export async function waitForPidExit(
  pid: number,
  timeoutMs = 5000,
  intervalMs = 300,
): Promise<void> {
  const start = Date.now();
  while (isPidAlive(pid)) {
    if (Date.now() - start >= timeoutMs) {
      await killPidForce(pid);
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
