import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

let mockAssetRoot = '';

jest.mock('../../utils', () => ({
  getAssetPath: (...paths: string[]) => path.join(mockAssetRoot, ...paths),
}));

import {
  applyBrandingThemeBackgrounds,
  getBrandingLogoUrl,
  getThemeBackgroundLocks,
  resolveAssetFileUrl,
} from '../branding';

const BRANDING_VARIABLES = [
  'APP_LOGO',
  'SIDEBAR_BACKGROUND',
  'CHAT_BACKGROUND',
] as const;

const createThemeConfig = () => ({
  sidebarBackground: { url: 'file:///stored/sidebar.png', opacity: 0.3, blur: 4 },
  chatBackground: { opacity: 0.1, blur: 2 },
});

describe('branding assets', () => {
  let outsideRoot = '';
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-branding-'));
    mockAssetRoot = path.join(root, 'assets');
    outsideRoot = path.join(root, 'outside');
    fs.mkdirSync(path.join(mockAssetRoot, 'branding'), { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.writeFileSync(path.join(mockAssetRoot, 'icon.png'), 'icon');
    fs.writeFileSync(path.join(mockAssetRoot, 'branding/sidebar.webp'), 'side');
    fs.writeFileSync(path.join(mockAssetRoot, 'branding/chat.jpg'), 'chat');
    fs.writeFileSync(path.join(mockAssetRoot, 'notes.txt'), 'notes');
    fs.writeFileSync(path.join(outsideRoot, 'secret.png'), 'secret');

    BRANDING_VARIABLES.forEach((variable) => delete process.env[variable]);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    BRANDING_VARIABLES.forEach((variable) => delete process.env[variable]);
    warnSpy.mockRestore();
  });

  it('resolves a path relative to the assets directory', () => {
    expect(resolveAssetFileUrl('branding/sidebar.webp', 'SIDEBAR_BACKGROUND')).toBe(
      pathToFileURL(
        fs.realpathSync(path.join(mockAssetRoot, 'branding/sidebar.webp')),
      ).href,
    );
  });

  it('ignores an unset or blank value', () => {
    expect(resolveAssetFileUrl(undefined, 'APP_LOGO')).toBeUndefined();
    expect(resolveAssetFileUrl('   ', 'APP_LOGO')).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('rejects paths that escape the assets directory', () => {
    expect(
      resolveAssetFileUrl('../outside/secret.png', 'APP_LOGO'),
    ).toBeUndefined();
    expect(
      resolveAssetFileUrl(path.join(outsideRoot, 'secret.png'), 'APP_LOGO'),
    ).toBeUndefined();
  });

  it('rejects a symlink pointing outside of the assets directory', () => {
    const linkPath = path.join(mockAssetRoot, 'linked.png');
    try {
      fs.symlinkSync(path.join(outsideRoot, 'secret.png'), linkPath);
    } catch {
      return;
    }
    expect(resolveAssetFileUrl('linked.png', 'APP_LOGO')).toBeUndefined();
  });

  it('rejects unsupported extensions, directories, and missing files', () => {
    expect(resolveAssetFileUrl('notes.txt', 'APP_LOGO')).toBeUndefined();
    expect(resolveAssetFileUrl('branding', 'APP_LOGO')).toBeUndefined();
    expect(resolveAssetFileUrl('missing.png', 'APP_LOGO')).toBeUndefined();
  });

  it('reads the logo from APP_LOGO', () => {
    expect(getBrandingLogoUrl()).toBeUndefined();
    process.env.APP_LOGO = 'icon.png';
    expect(getBrandingLogoUrl()).toBe(
      pathToFileURL(fs.realpathSync(path.join(mockAssetRoot, 'icon.png'))).href,
    );
  });

  it('locks only the backgrounds that resolve successfully', () => {
    expect(getThemeBackgroundLocks()).toEqual({ sidebar: false, chat: false });

    process.env.SIDEBAR_BACKGROUND = 'branding/sidebar.webp';
    process.env.CHAT_BACKGROUND = 'missing.png';
    expect(getThemeBackgroundLocks()).toEqual({ sidebar: true, chat: false });
  });

  it('overrides background urls while keeping opacity and blur', () => {
    process.env.SIDEBAR_BACKGROUND = 'branding/sidebar.webp';
    process.env.CHAT_BACKGROUND = 'branding/chat.jpg';

    const config = applyBrandingThemeBackgrounds(createThemeConfig());

    expect(config.sidebarBackground).toEqual({
      url: pathToFileURL(
        fs.realpathSync(path.join(mockAssetRoot, 'branding/sidebar.webp')),
      ).href,
      opacity: 0.3,
      blur: 4,
    });
    expect(config.chatBackground).toEqual({
      url: pathToFileURL(
        fs.realpathSync(path.join(mockAssetRoot, 'branding/chat.jpg')),
      ).href,
      opacity: 0.1,
      blur: 2,
    });
  });

  it('keeps the stored config when no background is branded', () => {
    const config = createThemeConfig();
    expect(applyBrandingThemeBackgrounds(config)).toBe(config);
  });

  it('leaves the untouched target alone when only one is branded', () => {
    process.env.CHAT_BACKGROUND = 'branding/chat.jpg';

    const config = applyBrandingThemeBackgrounds(createThemeConfig());

    expect(config.sidebarBackground.url).toBe('file:///stored/sidebar.png');
    expect(config.chatBackground.url).toContain('chat.jpg');
  });
});
