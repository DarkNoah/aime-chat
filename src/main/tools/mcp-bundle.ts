import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getMcpConfigForManifest,
  replaceVariables,
  unpackExtension,
  vAny,
  type McpbManifestAny,
} from '@anthropic-ai/mcpb';
import {
  McpBundlePreview,
  McpBundleUserConfigValue,
} from '@/types/mcp';
import { nanoid } from '@/utils/nanoid';
import { getUVRuntime } from '../app/runtime';

const MAX_MCP_BUNDLE_SIZE = 1024 * 1024 * 1024;

type InstalledMcpBundle = {
  installPath: string;
  name: string;
  mcpConfig: Record<string, unknown>;
};

export type ExistingMcpBundle = {
  installPath: string;
  name: string;
  version: string;
};

const getSystemDirs = () => ({
  HOME: app.getPath('home'),
  DESKTOP: app.getPath('desktop'),
  DOCUMENTS: app.getPath('documents'),
  DOWNLOADS: app.getPath('downloads'),
});

const sanitizeDirectoryName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp';

const ensureBundlePath = async (filePath: string) => {
  if (!filePath || path.extname(filePath).toLowerCase() !== '.mcpb') {
    throw new Error('Please select a valid .mcpb file.');
  }

  const resolvedPath = path.resolve(filePath);
  const stat = await fs.promises.stat(resolvedPath).catch(() => undefined);
  if (!stat?.isFile()) {
    throw new Error('The selected MCP Bundle does not exist.');
  }
  if (stat.size > MAX_MCP_BUNDLE_SIZE) {
    throw new Error('The selected MCP Bundle is larger than 1 GB.');
  }
  return resolvedPath;
};

const parseManifest = async (bundleDirectory: string) => {
  const manifestPath = path.join(bundleDirectory, 'manifest.json');
  const rawManifest = JSON.parse(
    await fs.promises.readFile(manifestPath, 'utf8'),
  );
  const result = vAny.McpbManifestSchema.safeParse(rawManifest);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid MCP Bundle manifest: ${details}`);
  }
  return result.data as McpbManifestAny;
};

const unpackBundle = async (filePath: string, outputDir: string) => {
  const unpacked = await unpackExtension({
    mcpbPath: filePath,
    outputDir,
    silent: true,
  });
  if (!unpacked) {
    throw new Error('Unable to unpack the MCP Bundle.');
  }
};

const resolveDefaultValue = (value: McpBundleUserConfigValue) =>
  replaceVariables(value, getSystemDirs()) as McpBundleUserConfigValue;

const normalizeMcpConfig = async (
  manifest: McpbManifestAny,
  installPath: string,
  config: Record<string, any>,
) => {
  const normalized = { ...config };
  const serverType = manifest.server.type;

  // Bundle commands are defined relative to the extracted bundle root. This
  // is especially important for `uv run`, which discovers pyproject.toml from
  // the child process working directory.
  normalized.cwd = installPath;

  if (
    serverType === 'node' &&
    /^(node|node\.exe)$/i.test(normalized.command) &&
    process.versions.electron
  ) {
    normalized.command = process.execPath;
    normalized.env = {
      ...(normalized.env || {}),
      ELECTRON_RUN_AS_NODE: '1',
    };
  }

  if (serverType === 'uv' && /^(uv|uv\.exe)$/i.test(normalized.command)) {
    const runtime = await getUVRuntime(true);
    if (!runtime?.installed || !runtime.path) {
      throw new Error('This MCP Bundle requires the UV runtime. Install UV in Settings first.');
    }
    normalized.command = runtime.path;
  }

  if (serverType === 'binary' && !path.isAbsolute(normalized.command)) {
    normalized.command = path.resolve(installPath, normalized.command);
    if (
      process.platform === 'win32' &&
      path.extname(normalized.command).toLowerCase() !== '.exe' &&
      fs.existsSync(`${normalized.command}.exe`)
    ) {
      normalized.command = `${normalized.command}.exe`;
    }
  }

  return normalized;
};

class McpBundleManager {
  private getInstallRoot() {
    return path.join(app.getPath('userData'), 'mcp-bundles');
  }

  private async findInstalledMatches(name: string) {
    const installRoot = this.getInstallRoot();
    const entries = await fs.promises
      .readdir(installRoot, { withFileTypes: true })
      .catch(() => []);
    const matches: Array<ExistingMcpBundle & { modifiedAt: number }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.installing-')) continue;
      const installPath = path.join(installRoot, entry.name);
      try {
        const manifest = await parseManifest(installPath);
        if (manifest.name.toLowerCase() !== name.toLowerCase()) continue;
        const stat = await fs.promises.stat(installPath);
        matches.push({
          installPath,
          name: manifest.name,
          version: manifest.version,
          modifiedAt: stat.mtimeMs,
        });
      } catch {
        // Ignore unrelated or incomplete directories in the bundle root.
      }
    }

    return matches.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  public async findInstalled(name: string): Promise<ExistingMcpBundle | undefined> {
    const [match] = await this.findInstalledMatches(name);
    if (!match) return undefined;
    const { modifiedAt: _modifiedAt, ...installed } = match;
    return installed;
  }

  public async removeInstalled(name: string) {
    const matches = await this.findInstalledMatches(name);
    await Promise.all(matches.map(({ installPath }) => this.rollback(installPath)));
  }

  public async preview(filePath: string): Promise<McpBundlePreview> {
    const resolvedPath = await ensureBundlePath(filePath);
    const tempDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'aime-mcpb-preview-'),
    );

    try {
      await unpackBundle(resolvedPath, tempDirectory);
      const manifest = await parseManifest(tempDirectory);
      const userConfig = (manifest.user_config || {}) as McpBundlePreview['userConfig'];
      const defaultUserConfig = Object.fromEntries(
        Object.entries(userConfig)
          .filter(([, option]) => option.default !== undefined)
          .map(([key, option]) => [
            key,
            resolveDefaultValue(option.default as McpBundleUserConfigValue),
          ]),
      );
      const supportedPlatforms = manifest.compatibility?.platforms;

      return {
        filePath: resolvedPath,
        name: manifest.name,
        displayName: manifest.display_name || manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author.name,
        serverType: manifest.server.type,
        manifestVersion:
          manifest.manifest_version || manifest.dxt_version || 'unknown',
        userConfig,
        defaultUserConfig,
        tools: manifest.tools || [],
        platformSupported:
          !supportedPlatforms || supportedPlatforms.includes(process.platform),
        supportedPlatforms,
      };
    } finally {
      await fs.promises.rm(tempDirectory, { recursive: true, force: true });
    }
  }

  public async install(
    filePath: string,
    userConfig: Record<string, McpBundleUserConfigValue>,
  ): Promise<InstalledMcpBundle> {
    const resolvedPath = await ensureBundlePath(filePath);
    const installRoot = this.getInstallRoot();
    await fs.promises.mkdir(installRoot, { recursive: true });

    const stagingPath = path.join(installRoot, `.installing-${nanoid()}`);
    await fs.promises.mkdir(stagingPath, { recursive: true });

    try {
      await unpackBundle(resolvedPath, stagingPath);
      const manifest = await parseManifest(stagingPath);
      const supportedPlatforms = manifest.compatibility?.platforms;
      if (supportedPlatforms && !supportedPlatforms.includes(process.platform)) {
        throw new Error(`This MCP Bundle does not support ${process.platform}.`);
      }

      const missingRequiredConfig = Object.entries(manifest.user_config || {})
        .filter(([, option]) => option.required)
        .find(([key]) => {
          const value = userConfig[key];
          return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
        });
      if (missingRequiredConfig) {
        throw new Error(`Required configuration is missing: ${missingRequiredConfig[0]}`);
      }

      const installPath = path.join(
        installRoot,
        `${sanitizeDirectoryName(manifest.name)}-${sanitizeDirectoryName(manifest.version)}-${nanoid(8)}`,
      );
      await fs.promises.rename(stagingPath, installPath);

      try {
        const rawConfig = await getMcpConfigForManifest({
          manifest,
          extensionPath: installPath,
          systemDirs: getSystemDirs(),
          userConfig: userConfig as any,
          pathSeparator: path.sep,
        });
        if (!rawConfig) {
          throw new Error('The MCP Bundle did not produce a runnable MCP configuration.');
        }

        return {
          installPath,
          name: manifest.name,
          mcpConfig: await normalizeMcpConfig(
            manifest,
            installPath,
            rawConfig as Record<string, any>,
          ),
        };
      } catch (error) {
        await fs.promises.rm(installPath, { recursive: true, force: true });
        throw error;
      }
    } catch (error) {
      await fs.promises.rm(stagingPath, { recursive: true, force: true });
      throw error;
    }
  }

  public async rollback(installPath: string) {
    const installRoot = path.resolve(this.getInstallRoot());
    const resolvedPath = path.resolve(installPath);
    if (
      resolvedPath !== installRoot &&
      resolvedPath.startsWith(`${installRoot}${path.sep}`)
    ) {
      await fs.promises.rm(resolvedPath, { recursive: true, force: true });
    }
  }
}

export const mcpBundleManager = new McpBundleManager();
