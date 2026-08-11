import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  createDefaultThemeConfig,
  getThemeBackgroundDirectory,
  normalizeThemeConfig,
  removeReplacedThemeBackgrounds,
  saveThemeConfig,
  storeThemeBackground,
} from '../theme-background';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('theme background storage', () => {
  let testDirectory: string;
  let userDataDirectory: string;

  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-theme-'));
    userDataDirectory = path.join(testDirectory, '用户 data');
  });

  afterEach(() => {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  it('keeps the current theme untouched when no customization exists', () => {
    expect(normalizeThemeConfig(undefined, userDataDirectory)).toEqual(
      createDefaultThemeConfig(),
    );
  });

  it('copies a validated image into the managed user data directory', async () => {
    const sourcePath = path.join(testDirectory, '背景 #1.png');
    fs.writeFileSync(sourcePath, ONE_PIXEL_PNG);
    const persist = jest.fn(async () => undefined);

    const result = await saveThemeConfig({
      value: createDefaultThemeConfig(),
      sourcePaths: { sidebar: sourcePath },
      previousConfig: createDefaultThemeConfig(),
      userDataPath: userDataDirectory,
      persist,
    });

    expect(result.sidebarBackground.url).toBeDefined();
    const savedPath = fileURLToPath(result.sidebarBackground.url!);
    expect(path.dirname(savedPath)).toBe(
      fs.realpathSync(getThemeBackgroundDirectory(userDataDirectory)),
    );
    expect(path.basename(savedPath)).toMatch(/^sidebar-[0-9a-f]{16}\.png$/);
    expect((await sharp(savedPath).metadata()).format).toBe('png');
    expect(fs.readFileSync(sourcePath)).toEqual(ONE_PIXEL_PNG);
    expect(persist).toHaveBeenCalledWith(result);
    expect(JSON.stringify(result)).not.toContain(sourcePath);

    fs.unlinkSync(sourcePath);
    expect(
      normalizeThemeConfig(
        JSON.parse(JSON.stringify(result)),
        userDataDirectory,
      ),
    ).toEqual(result);
  });

  it('keeps only managed, existing background URLs and safe values', async () => {
    const sourcePath = path.join(testDirectory, 'chat.png');
    fs.writeFileSync(sourcePath, ONE_PIXEL_PNG);
    const imported = await storeThemeBackground(
      sourcePath,
      'chat',
      userDataDirectory,
    );

    expect(
      normalizeThemeConfig(
        {
          primaryColor: '#0f766e',
          sidebarBackground: {
            url: pathToFileURL(sourcePath).href,
            opacity: -1,
            blur: 99,
          },
          chatBackground: {
            url: imported.url,
            opacity: 0.35,
            blur: 8,
          },
        },
        userDataDirectory,
      ),
    ).toEqual({
      primaryColor: '#0F766E',
      sidebarBackground: { opacity: 0, blur: 20 },
      chatBackground: {
        url: imported.url,
        opacity: 0.35,
        blur: 8,
      },
    });
  });

  it('rejects unsupported or invalid image files', async () => {
    const sourcePath = path.join(testDirectory, 'background.png');
    fs.writeFileSync(sourcePath, 'not an image');

    await expect(
      storeThemeBackground(sourcePath, 'chat', userDataDirectory),
    ).rejects.toThrow('valid image');
  });

  it('does not restore a managed URL that was replaced with a symlink', async () => {
    const sourcePath = path.join(testDirectory, 'sidebar.png');
    fs.writeFileSync(sourcePath, ONE_PIXEL_PNG);
    const imported = await storeThemeBackground(
      sourcePath,
      'sidebar',
      userDataDirectory,
    );
    const managedPath = fileURLToPath(imported.url!);
    const outsidePath = path.join(testDirectory, 'outside.png');
    fs.renameSync(managedPath, outsidePath);
    fs.symlinkSync(outsidePath, managedPath);

    expect(
      normalizeThemeConfig(
        {
          sidebarBackground: {
            url: imported.url,
            opacity: 0.2,
            blur: 0,
          },
        },
        userDataDirectory,
      ).sidebarBackground.url,
    ).toBeUndefined();
  });

  it('rejects images with excessive dimensions', async () => {
    const sourcePath = path.join(testDirectory, 'too-wide.png');
    await sharp({
      create: {
        width: 8193,
        height: 1,
        channels: 3,
        background: '#000000',
      },
    })
      .png()
      .toFile(sourcePath);

    await expect(
      storeThemeBackground(sourcePath, 'chat', userDataDirectory),
    ).rejects.toThrow('dimensions are too large');
  });

  it('keeps the previous background when replacement validation fails', async () => {
    const previousSourcePath = path.join(testDirectory, 'previous.png');
    fs.writeFileSync(previousSourcePath, ONE_PIXEL_PNG);
    const previous = await storeThemeBackground(
      previousSourcePath,
      'sidebar',
      userDataDirectory,
    );
    const previousConfig = normalizeThemeConfig(
      {
        sidebarBackground: {
          url: previous.url,
          opacity: 0.2,
          blur: 0,
        },
      },
      userDataDirectory,
    );
    const invalidSourcePath = path.join(testDirectory, 'invalid.png');
    fs.writeFileSync(invalidSourcePath, 'not an image');
    const persist = jest.fn(async () => undefined);

    await expect(
      saveThemeConfig({
        value: previousConfig,
        sourcePaths: { sidebar: invalidSourcePath },
        previousConfig,
        userDataPath: userDataDirectory,
        persist,
      }),
    ).rejects.toThrow('valid image');

    expect(persist).not.toHaveBeenCalled();
    expect(fs.existsSync(fileURLToPath(previous.url))).toBe(true);
  });

  it('cleans a copied sidebar file when the chat source then fails', async () => {
    const sidebarSourcePath = path.join(testDirectory, 'sidebar.png');
    fs.writeFileSync(sidebarSourcePath, ONE_PIXEL_PNG);
    const invalidChatSourcePath = path.join(testDirectory, 'chat.png');
    fs.writeFileSync(invalidChatSourcePath, 'not an image');
    const persist = jest.fn(async () => undefined);

    await expect(
      saveThemeConfig({
        value: createDefaultThemeConfig(),
        sourcePaths: {
          sidebar: sidebarSourcePath,
          chat: invalidChatSourcePath,
        },
        previousConfig: createDefaultThemeConfig(),
        userDataPath: userDataDirectory,
        persist,
      }),
    ).rejects.toThrow('valid image');

    expect(persist).not.toHaveBeenCalled();
    expect(
      fs.readdirSync(getThemeBackgroundDirectory(userDataDirectory)),
    ).toEqual([]);
  });

  it('rolls back a newly copied background when persistence fails', async () => {
    const previousSourcePath = path.join(testDirectory, 'previous.png');
    fs.writeFileSync(previousSourcePath, ONE_PIXEL_PNG);
    const previous = await storeThemeBackground(
      previousSourcePath,
      'sidebar',
      userDataDirectory,
    );
    const previousConfig = normalizeThemeConfig(
      {
        sidebarBackground: {
          url: previous.url,
          opacity: 0.2,
          blur: 0,
        },
      },
      userDataDirectory,
    );
    const replacementSourcePath = path.join(testDirectory, 'replacement.png');
    await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 3,
        background: '#ff0000',
      },
    })
      .png()
      .toFile(replacementSourcePath);

    await expect(
      saveThemeConfig({
        value: previousConfig,
        sourcePaths: { sidebar: replacementSourcePath },
        previousConfig,
        userDataPath: userDataDirectory,
        persist: async () => {
          throw new Error('database write failed');
        },
      }),
    ).rejects.toThrow('database write failed');

    expect(fs.existsSync(fileURLToPath(previous.url))).toBe(true);
    expect(
      fs
        .readdirSync(getThemeBackgroundDirectory(userDataDirectory))
        .filter((fileName) => fileName.startsWith('sidebar-')),
    ).toEqual([path.basename(fileURLToPath(previous.url))]);
  });

  it('deletes the previous copy only after the new config is persisted', async () => {
    const previousSourcePath = path.join(testDirectory, 'previous.png');
    fs.writeFileSync(previousSourcePath, ONE_PIXEL_PNG);
    const previous = await storeThemeBackground(
      previousSourcePath,
      'chat',
      userDataDirectory,
    );
    const previousPath = fileURLToPath(previous.url);
    const previousConfig = normalizeThemeConfig(
      {
        chatBackground: { url: previous.url, opacity: 0.2, blur: 0 },
      },
      userDataDirectory,
    );
    const replacementSourcePath = path.join(testDirectory, 'replacement.png');
    await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 3,
        background: '#00ff00',
      },
    })
      .png()
      .toFile(replacementSourcePath);

    const result = await saveThemeConfig({
      value: previousConfig,
      sourcePaths: { chat: replacementSourcePath },
      previousConfig,
      userDataPath: userDataDirectory,
      persist: async () => {
        expect(fs.existsSync(previousPath)).toBe(true);
      },
    });

    expect(fs.existsSync(previousPath)).toBe(false);
    expect(fs.existsSync(fileURLToPath(result.chatBackground.url!))).toBe(true);
  });

  it('removes only replaced app-managed background copies', async () => {
    const sourcePath = path.join(testDirectory, 'background.png');
    fs.writeFileSync(sourcePath, ONE_PIXEL_PNG);
    const sidebar = await storeThemeBackground(
      sourcePath,
      'sidebar',
      userDataDirectory,
    );
    const chat = await storeThemeBackground(
      sourcePath,
      'chat',
      userDataDirectory,
    );
    const pendingSourcePath = path.join(testDirectory, 'pending.png');
    await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 3,
        background: '#ff0000',
      },
    })
      .png()
      .toFile(pendingSourcePath);
    const pendingImport = await storeThemeBackground(
      pendingSourcePath,
      'sidebar',
      userDataDirectory,
    );

    await removeReplacedThemeBackgrounds(
      normalizeThemeConfig(
        {
          sidebarBackground: { url: sidebar.url, opacity: 0.2, blur: 0 },
          chatBackground: { url: chat.url, opacity: 0.2, blur: 0 },
        },
        userDataDirectory,
      ),
      normalizeThemeConfig(
        { chatBackground: { url: chat.url, opacity: 0.2, blur: 0 } },
        userDataDirectory,
      ),
      userDataDirectory,
    );

    expect(fs.existsSync(fileURLToPath(sidebar.url!))).toBe(false);
    expect(fs.existsSync(fileURLToPath(chat.url!))).toBe(true);
    expect(fs.existsSync(fileURLToPath(pendingImport.url!))).toBe(true);
  });
});
