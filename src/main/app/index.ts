import { Repository } from 'typeorm';
import { BaseManager } from '../BaseManager';
import { Providers } from '@/entities/providers';
import {
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  OpenDialogOptions,
  OpenDialogReturnValue,
  ProxyConfig,
  shell,
  webUtils,
  type NativeTheme,
} from 'electron';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { CreateProvider, Provider } from '@/types/provider';
import { AppChannel } from '@/types/ipc-channel';
import { AppInfo, AppProxy } from '@/types/app';
import { app } from 'electron';
import { getDbPath, getDefaultModelPath } from '../utils';
import { platform } from 'os';
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import { isUrl } from '@/utils/is';
import fs from 'fs';
import {
  getSystemProxySettings,
  SystemProxySettings,
} from '../utils/systemProxy';
import { Settings } from '@/entities/settings';
import { getMainWindow } from '../main';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  getNodeRuntime,
  getPaddleOcrRuntime,
  getUVRuntime,
  installPaddleOcrRuntime,
  installUVRuntime,
  uninstallPaddleOcrRuntime,
  unInstallUVRuntime,
} from './runtime';
import { fstat } from 'fs';
import path from 'path';
import mastraManager from '../mastra';
import {
  DirectoryTreeNode,
  FileInfo,
  SearchInDirectoryParams,
  SearchInDirectoryResult,
  SearchResult,
} from '@/types/common';
import { rgPath } from '@vscode/ripgrep';
import { spawn } from 'child_process';
import readline from 'readline';
import { filesize } from 'filesize';
import { Translations } from '@/entities/translations';
import crypto from 'crypto';
import { agentManager } from '../mastra/agents';
import { providersManager } from '../providers';
import { toolsManager } from '../tools';
import { ToolType } from '@/types/tool';
import { Translation } from '../tools/work/translation';
import { nanoid } from '@/utils/nanoid';
import { HookAgent, HookProxyAgent } from './hook-agent';
class AppManager extends BaseManager {
  repository: Repository<Providers>;
  settingsRepository: Repository<Settings>;
  translationRepository: Repository<Translations>;
  appProxy: AppProxy;
  defaultApiServerPort = 41100;

  constructor() {
    super();
  }

  public async init() {
    this.translationRepository =
      dbManager.dataSource.getRepository(Translations);
    this.settingsRepository = dbManager.dataSource.getRepository(Settings);
    const settings = await this.settingsRepository.find();
    nativeTheme.themeSource =
      settings.find((x) => x.id === 'theme')?.value ?? 'system';
    const proxySetting = await this.settingsRepository.findOne({
      where: { id: 'proxy' },
    });
    this.appProxy = (proxySetting?.value || { mode: 'noproxy' }) as AppProxy;
    await this.setProxy(this.appProxy);

    // const uv = await getUVRuntime();
    // const node = await getNodeRuntime();
    // const paddleOcr = await getPaddleOcrRuntime();
  }

  public getMainWindow() {
    const windows = getMainWindow();
    return windows;
  }

  @channel(AppChannel.GetInfo)
  public async getInfo(): Promise<AppInfo> {
    const settings = await this.settingsRepository.find();
    const modelPath =
      settings.find((x) => x.id === 'modelPath')?.value ??
      getDefaultModelPath();
    const apiServer = settings.find((x) => x.id === 'apiServer')?.value;
    return {
      name: app.getName(),
      appPath: app.getAppPath(),
      homePath: app.getPath('home'),
      modelPath: modelPath,
      appData: app.getPath('appData'),
      userData: app.getPath('userData'),
      dataPath: getDbPath(),
      version: app.getVersion(),
      platform: platform(),
      resourcesPath: process.resourcesPath,
      cwd: process.cwd(),
      execPath: process.execPath,
      type: process.type,
      systemVersion: process.getSystemVersion(),
      isPackaged: app.isPackaged,
      theme: nativeTheme.themeSource,
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      defaultModel: settings.find((x) => x.id === 'defaultModel')?.value ?? {},
      proxy:
        this.appProxy ||
        ({
          mode: 'noproxy',
        } as AppProxy),
      apiServer: {
        status: mastraManager.httpServer?.listening ? 'running' : 'stopped',
        enabled: apiServer?.enabled ?? false,
        port: apiServer?.port ?? this.defaultApiServerPort,
      },
    };
  }

  @channel(AppChannel.Toast)
  public async toast(
    title: string,
    options?: { type?: 'success' | 'error'; icon?: string },
  ): Promise<void> {
    this.getMainWindow()?.webContents.send(AppChannel.Toast, title, options);
  }

  public async sendEvent(channel: string, data: any): Promise<void> {
    this.getMainWindow()?.webContents.send(channel, data);
  }

  @channel(AppChannel.OpenPath)
  public async openPath(path: string): Promise<void> {
    if (fs.existsSync(path)) {
      if (fs.statSync(path).isFile()) {
        await shell.showItemInFolder(path);
      } else {
        await shell.openPath(path);
      }
    } else {
      this.toast('The path does not exist', { type: 'error' });
    }
  }

  @channel(AppChannel.GetFileInfo)
  public async getFileInfo(_path: string): Promise<FileInfo> {
    const isExist = fs.existsSync(_path);
    let isFile;
    let name;
    let ext;
    let size;
    let sizeStr;
    if (isExist) {
      isFile = fs.statSync(_path).isFile();
      name = path.basename(_path);
      ext = path.extname(_path).toLowerCase();
      if (isFile) {
        size = fs.statSync(_path).size;
        sizeStr = filesize(size);
      }
    }

    return {
      path: _path,
      isExist,
      isFile,
      name,
      ext,
      size,
      sizeStr,
    };
  }

  @channel(AppChannel.GetDirectoryTree)
  public async getDirectoryTree(dirPath: string): Promise<DirectoryTreeNode> {
    // 只获取一层目录结构（懒加载）
    return this.getDirectoryChildren(dirPath);
  }

  // 获取指定目录的直接子项（不递归）
  private async getDirectoryChildren(
    dirPath: string,
  ): Promise<DirectoryTreeNode> {
    const IGNORED_ENTRIES = [
      'node_modules',
      '.git',
      '.DS_Store',
      '__pycache__',
      '.venv',
      'venv',
      '.idea',
      '.vscode',
      '.next',
      '.cache',
    ];

    if (!fs.existsSync(dirPath)) {
      return {
        name: path.basename(dirPath),
        path: dirPath,
        isDirectory: true,
        children: [],
      };
    }

    const stat = await fs.promises.stat(dirPath);
    const node: DirectoryTreeNode = {
      name: path.basename(dirPath),
      path: dirPath,
      isDirectory: stat.isDirectory(),
    };

    if (!stat.isDirectory()) {
      return node;
    }

    try {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });
      const children: DirectoryTreeNode[] = [];

      for (const entry of entries) {
        // 跳过被忽略的目录和隐藏文件（以.开头的，除了一些特殊的）
        if (IGNORED_ENTRIES.includes(entry.name)) {
          continue;
        }

        const childPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();

        const childNode: DirectoryTreeNode = {
          name: entry.name,
          path: childPath,
          isDirectory: isDir,
        };

        // 如果是目录，检查是否有子项（用于显示展开箭头）
        if (isDir) {
          try {
            const subEntries = await fs.promises.readdir(childPath);
            const hasChildren = subEntries.some(
              (e) => !IGNORED_ENTRIES.includes(e),
            );
            // 用空数组表示有子项但未加载，用 undefined 表示无子项
            childNode.children = hasChildren ? [] : undefined;
          } catch {
            childNode.children = undefined;
          }
        }

        children.push(childNode);
      }

      // 排序：目录在前，文件在后，同类按名称排序
      children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      node.children = children;
    } catch {
      node.children = [];
    }

    return node;
  }

  @channel(AppChannel.GetDirectoryChildren)
  public async loadDirectoryChildren(
    dirPath: string,
  ): Promise<DirectoryTreeNode[]> {
    const result = await this.getDirectoryChildren(dirPath);
    return result.children || [];
  }

  @channel(AppChannel.SearchInDirectory)
  public async searchInDirectory(
    params: SearchInDirectoryParams,
  ): Promise<SearchInDirectoryResult> {
    const { pattern, directory, caseSensitive = false, limit = 100 } = params;

    if (!pattern || !directory) {
      return { results: [], total: 0, truncated: false };
    }

    if (!fs.existsSync(directory)) {
      return { results: [], total: 0, truncated: false };
    }

    const allResults: SearchResult[] = [];
    let totalCount = 0;

    // 1. 搜索文件名和文件夹名
    const fileResults = await this.searchFileNames(
      pattern,
      directory,
      caseSensitive,
    );
    allResults.push(...fileResults);
    totalCount += fileResults.length;

    // 2. 搜索文件内容
    const contentResults = await this.searchFileContent(
      pattern,
      directory,
      caseSensitive,
      limit - allResults.length,
    );
    allResults.push(...contentResults.results);
    totalCount += contentResults.total;

    const truncated = allResults.length > limit || contentResults.truncated;
    const finalResults = allResults.slice(0, limit);

    return { results: finalResults, total: totalCount, truncated };
  }

  private async searchFileNames(
    pattern: string,
    directory: string,
    caseSensitive: boolean,
  ): Promise<SearchResult[]> {
    return new Promise((resolve) => {
      const args: string[] = [
        '--files',
        '--hidden',
        '--glob',
        '!node_modules/**',
        '--glob',
        '!.git/**',
        directory,
      ];

      const child = spawn(rgPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const results: SearchResult[] = [];

      const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });

      const patternLower = pattern.toLowerCase();
      const regex = caseSensitive
        ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      rl.on('line', (filePath) => {
        const relativePath = filePath.replace(directory, '').replace(/^\//, '');
        const parts = relativePath.split('/');
        const fileName = parts.pop() || '';
        const folderPath = parts.join('/');

        // 检查文件名是否匹配
        if (regex.test(fileName)) {
          results.push({
            type: 'filename',
            file: filePath,
            line: 0,
            column: 0,
            match: fileName,
            context: fileName,
          });
        }

        // 检查文件夹名是否匹配（只检查最后一个文件夹）
        if (parts.length > 0) {
          const lastFolder = parts[parts.length - 1];
          if (
            regex.test(lastFolder) &&
            !results.some(
              (r) =>
                r.type === 'folder' &&
                r.file === path.join(directory, folderPath),
            )
          ) {
            results.push({
              type: 'folder',
              file: path.join(directory, folderPath),
              line: 0,
              column: 0,
              match: lastFolder,
              context: folderPath,
            });
          }
        }
      });

      rl.on('close', () => {
        // 去重文件夹结果
        const seen = new Set<string>();
        const uniqueResults = results.filter((r) => {
          const key = `${r.type}:${r.file}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        resolve(uniqueResults);
      });

      child.on('error', () => {
        resolve([]);
      });

      setTimeout(() => {
        child.kill('SIGTERM');
        rl.close();
      }, 5000);
    });
  }

  private async searchFileContent(
    pattern: string,
    directory: string,
    caseSensitive: boolean,
    limit: number,
  ): Promise<{ results: SearchResult[]; total: number; truncated: boolean }> {
    if (limit <= 0) {
      return { results: [], total: 0, truncated: false };
    }

    const args: string[] = [
      '--json',
      '--hidden',
      '--glob',
      '!node_modules/**',
      '--glob',
      '!.git/**',
      '--glob',
      '!*.lock',
      '--glob',
      '!package-lock.json',
    ];

    if (!caseSensitive) {
      args.push('-i');
    }

    args.push('-e', pattern, directory);

    return new Promise((resolve) => {
      const child = spawn(rgPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const results: SearchResult[] = [];
      let total = 0;
      let truncated = false;

      const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        try {
          const json = JSON.parse(line);
          if (json.type === 'match') {
            total++;
            if (results.length < limit) {
              const data = json.data;
              const submatches = data.submatches || [];
              const match = submatches[0]?.match?.text || '';
              results.push({
                type: 'content',
                file: data.path?.text || '',
                line: data.line_number || 0,
                column: submatches[0]?.start || 0,
                match,
                context: data.lines?.text?.trim() || '',
              });
            } else {
              truncated = true;
            }
          }
        } catch {
          // Ignore invalid JSON lines
        }
      });

      rl.on('close', () => {
        resolve({ results, total, truncated });
      });

      child.on('error', () => {
        resolve({ results: [], total: 0, truncated: false });
      });

      setTimeout(() => {
        child.kill('SIGTERM');
        rl.close();
      }, 10000);
    });
  }

  @channel(AppChannel.SetTheme)
  public async setTheme(theme: string): Promise<void> {
    if (['light', 'dark', 'system'].includes(theme)) {
      nativeTheme.themeSource = theme as NativeTheme['themeSource'];
      const data = new Settings('theme', theme);
      await this.settingsRepository.upsert(data, ['id']);
    }
  }

  public async getProxy(): Promise<string | undefined> {
    if (this.appProxy.host && this.appProxy.port) {
      return `${this.appProxy.host}:${this.appProxy.port}`;
    }
    return undefined;
  }

  @channel(AppChannel.SetProxy)
  public async setProxy(data: AppProxy): Promise<void> {
    let proxyConfig: ProxyConfig;
    if (data.mode === 'system') {
      const systemProxy = await getSystemProxySettings();
      proxyConfig = { mode: 'system' };
      setGlobalDispatcher(
        systemProxy.proxyEnable
          ? new ProxyAgent({
              uri: systemProxy.proxyServer,
            })
          : new Agent(),
      );
      if (systemProxy.proxyEnable) {
        const url = new URL(systemProxy.proxyServer);
        this.appProxy = {
          mode: 'system',
          host: url.hostname,
          port: parseInt(url.port),
        };
      } else {
        this.appProxy = {
          mode: 'system',
        };
      }

      const settingData = new Settings('proxy', { mode: 'system' });
      await this.settingsRepository.upsert(settingData, ['id']);
    } else if (data.mode == 'custom') {
      const proxy = data.host + ':' + data.port;
      proxyConfig = { proxyRules: proxy };
      if (!(proxy.startsWith('http://') || proxy.startsWith('https://'))) {
        proxyConfig.proxyRules = 'http://' + proxy;
      } else {
        proxyConfig.proxyRules = proxy;
      }

      const settingData = new Settings('proxy', { mode: 'custom' });
      await this.settingsRepository.upsert(settingData, ['id']);
      this.appProxy = {
        mode: 'custom',
      };

      try {
        const url = new URL(proxyConfig.proxyRules);
        setGlobalDispatcher(
          new HookProxyAgent({
            uri: proxyConfig.proxyRules,
          }),
        );
        this.appProxy = {
          mode: 'custom',
          host: url.hostname,
          port: parseInt(url.port),
        };
        settingData.value = {
          mode: 'custom',
          host: data.host,
          port: data.port,
        };
        await this.settingsRepository.upsert(settingData, ['id']);
      } catch {}
    } else if (data.mode == 'noproxy') {
      proxyConfig = {};
      setGlobalDispatcher(new Agent());
      this.appProxy = { mode: 'noproxy' };
      const settingData = new Settings('proxy', { mode: 'noproxy' });
      await this.settingsRepository.upsert(settingData, ['id']);
    }
  }

  @channel(AppChannel.SetLanguage)
  public async setLanguage(language: string): Promise<void> {
    const data = new Settings('language', language);
    await this.settingsRepository.upsert(data, ['id']);
  }

  @channel(AppChannel.ShowOpenDialog)
  public async showOpenDialog(
    options: OpenDialogOptions,
  ): Promise<OpenDialogReturnValue> {
    return await dialog.showOpenDialog(this.getMainWindow(), options);
  }

  @channel(AppChannel.SaveSettings)
  public async saveSettings(settings: {
    id: string;
    value: any;
  }): Promise<void> {
    await this.settingsRepository.upsert(settings, ['id']);
  }
  @channel(AppChannel.InstasllRumtime)
  public async installRuntime(pkg: string) {
    if (pkg == 'uv') {
      await installUVRuntime();
    } else if (pkg == 'paddleOcr') {
      await installPaddleOcrRuntime();
    }
  }

  @channel(AppChannel.UninstallRumtime)
  public async UninstallRumtime(pkg: string) {
    if (pkg == 'uv') {
      await unInstallUVRuntime();
    } else if (pkg == 'paddleOcr') {
      await uninstallPaddleOcrRuntime();
    }
  }

  @channel(AppChannel.GetRuntimeInfo)
  public async getRuntimeInfo(): Promise<any> {
    const uv = await getUVRuntime();
    return {
      uv: uv,
      node: await getNodeRuntime(),
      paddleOcr: await getPaddleOcrRuntime(),
    };
  }

  @channel(AppChannel.SetApiServerPort)
  public async setApiServerPort(port: number) {
    let settings = await this.settingsRepository.findOne({
      where: { id: 'apiServer' },
    });
    if (!settings?.value) {
      settings = new Settings('apiServer', {
        port: port,
        enabled: false,
      });
    }
    settings.value.port = port;
    await this.settingsRepository.upsert(settings, ['id']);
  }

  @channel(AppChannel.ToggleApiServerEnable)
  public async toggleApiServerEnable(enabled: boolean) {
    let settings = await this.settingsRepository.findOne({
      where: { id: 'apiServer' },
    });
    if (!settings?.value) {
      settings = new Settings('apiServer', {
        port: this.defaultApiServerPort,
        enabled: enabled,
      });
    }
    settings.value.enabled = enabled;
    if (enabled) {
      await mastraManager.start(settings.value.port);
    } else {
      await mastraManager.close();
    }
    await this.settingsRepository.upsert(settings, ['id']);
  }
  @channel(AppChannel.GetSetupStatus)
  public async getSetupStatus(): Promise<{
    needsSetup: boolean;
    hasProvider: boolean;
    hasDefaultModel: boolean;
    hasRuntime: boolean;
  }> {
    const providers = await providersManager.getList();
    const hasProvider =
      providers.length > 0 && providers.some((p) => p.isActive);
    const settings = await this.settingsRepository.find();
    const hasDefaultModel = !!settings.find((x) => x.id === 'defaultModel')
      ?.value?.model;
    const runtimeInfo = await this.getRuntimeInfo();
    const hasRuntime =
      runtimeInfo?.uv?.installed || runtimeInfo?.node?.installed;
    const setupCompleted = settings.find(
      (x) => x.id === 'setupCompleted',
    )?.value;

    return {
      needsSetup: !setupCompleted,
      hasProvider,
      hasDefaultModel,
      hasRuntime,
    };
  }

  @channel(AppChannel.CompleteSetup)
  public async completeSetup(): Promise<void> {
    await this.settingsRepository.upsert(new Settings('setupCompleted', true), [
      'id',
    ]);
  }

  @channel(AppChannel.Translation)
  public async translation(data: {
    source: string;
    lang: string;
    force?: boolean;
  }) {
    const hash = crypto.createHash('sha256').update(data.source).digest('hex');
    const translation = await this.translationRepository.findOne({
      where: { hash: hash, lang: data.lang.toLowerCase() },
    });
    if (translation) return translation.translation;

    if (!translation && data.force) {
      const tool = await toolsManager.buildTool(
        `${ToolType.BUILD_IN}:${Translation.toolName}`,
      );
      try {
        const result = await (tool as Translation).execute({
          source: data.source,
          lang: data.lang,
        });
        const entity = new Translations(nanoid());
        entity.hash = hash;
        entity.source = data.source;
        entity.lang = data.lang.toLowerCase();
        entity.translation = result;
        await this.translationRepository.upsert(entity, ['id']);
        return entity.translation;
      } catch (err) {
        this.toast(`Failed to translate: ${err.message}`, { type: 'error' });
        return data.source;
      }
    } else {
      return data.source ?? '';
    }
    return translation.translation;
  }
}
export const appManager = new AppManager();
