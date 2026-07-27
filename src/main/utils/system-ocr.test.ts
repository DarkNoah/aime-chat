import { isSystemOcrSupported, recognizeWithSystemOcr } from './system-ocr';

describe('isSystemOcrSupported', () => {
  it.each([
    ['darwin', true],
    ['win32', true],
    ['linux', false],
    ['freebsd', false],
  ] as const)('%s support is %s', (platform, expected) => {
    expect(isSystemOcrSupported(platform)).toBe(expected);
  });

  it('rejects on Linux before loading the native module', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      'platform',
    );
    Object.defineProperty(process, 'platform', {
      ...platformDescriptor,
      value: 'linux',
    });

    try {
      await expect(recognizeWithSystemOcr(new Uint8Array())).rejects.toThrow(
        'System OCR is not supported on linux',
      );
    } finally {
      Object.defineProperty(process, 'platform', platformDescriptor);
    }
  });
});
