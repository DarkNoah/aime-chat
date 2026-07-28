type SystemOcrInput = string | Uint8Array;
type SystemOcrModule = typeof import('@napi-rs/system-ocr');

const runtimeRequire = eval('require') as (id: string) => SystemOcrModule; // eslint-disable-line no-eval

export function isSystemOcrSupported(
  platform: string = process.platform,
): boolean {
  return platform === 'darwin' || platform === 'win32';
}

export async function recognizeWithSystemOcr(
  image: SystemOcrInput,
  signal?: AbortSignal,
) {
  if (!isSystemOcrSupported()) {
    throw new Error(
      `System OCR is not supported on ${process.platform}. Use RapidOCR or another OCR provider instead.`,
    );
  }

  // This native module only ships macOS and Windows binaries. Keep the load
  // behind the platform check so loading the Electron main process is safe on
  // Linux.
  const { OcrAccuracy, recognize } = runtimeRequire(
    '@napi-rs/system-ocr',
  ) as SystemOcrModule;
  return recognize(image, OcrAccuracy.Accurate, undefined, signal);
}
