import { session } from 'electron';

let insecureTlsEnabled = false;

export function isInsecureTlsEnabled(): boolean {
  return insecureTlsEnabled;
}

/**
 * 全局开关：跳过 HTTPS 不安全证书校验。
 * - NODE_TLS_REJECT_UNAUTHORIZED 覆盖 Node 侧所有 tls/https 连接（每次连接时读取，可运行时切换）
 * - setCertificateVerifyProc 覆盖 Chromium（渲染进程）侧的证书校验
 */
export function setInsecureTlsEnabled(enabled: boolean): void {
  insecureTlsEnabled = enabled;

  if (enabled) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  } else {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }

  try {
    session.defaultSession.setCertificateVerifyProc(
      enabled ? (_request, callback) => callback(0) : null,
    );
  } catch {
    // app 尚未 ready 时 session 不可用，忽略
  }
}

/**
 * undici Agent/ProxyAgent 的 connect 选项。
 * 未开启时返回空对象，让 Node 按默认策略（含环境变量）决定。
 */
export function getTlsConnectOptions(): { rejectUnauthorized?: boolean } {
  return insecureTlsEnabled ? { rejectUnauthorized: false } : {};
}
