import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthClientInformationMixed,
  OAuthTokens,
  OAuthTokensSchema,
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
  OAuthClientInformationFullSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import crypto from 'crypto';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface OAuthProviderOptions {
  /** Server URL to connect to */
  serverUrl: string;
  /** Port for the OAuth callback server */
  callbackPort: number;
  /** Desired hostname for the OAuth callback server */
  host: string;
  /** Path for the OAuth callback endpoint */
  callbackPath?: string;
  /** Directory to store OAuth credentials */
  configDir?: string;
  /** Client name to use for OAuth registration */
  clientName?: string;
  /** Client URI to use for OAuth registration */
  clientUri?: string;
  /** Software ID to use for OAuth registration */
  softwareId?: string;
  /** Software version to use for OAuth registration */
  softwareVersion?: string;
  /** Static OAuth client metadata to override default OAuth client metadata */
  // staticOAuthClientMetadata?: StaticOAuthClientMetadata;
  // /** Static OAuth client information to use instead of OAuth registration */
  // staticOAuthClientInfo?: StaticOAuthClientInformationFull;
}

export class MastraOAuthClientProvider implements OAuthClientProvider {
  serverUrlHash: string;

  constructor(readonly options: OAuthProviderOptions) {
    this.serverUrlHash = crypto
      .createHash('md5')
      .update(options.serverUrl)
      .digest('hex');
  }

  get redirectUrl(): string | URL {
    return `http://${this.options.host}:${this.options.callbackPort}${this.options.callbackPath}`;
  }
  clientMetadataUrl?: string;
  get clientMetadata(): {
    redirect_uris: string[];
    token_endpoint_auth_method?: string;
    grant_types?: string[];
    response_types?: string[];
    client_name?: string;
    client_uri?: string;
    logo_uri?: string;
    scope?: string;
    contacts?: string[];
    tos_uri?: string;
    policy_uri?: string;
    jwks_uri?: string;
    jwks?: any;
    software_id?: string;
    software_version?: string;
    software_statement?: string;
  } {
    throw new Error('Method not implemented.');
  }
  async state?(): Promise<string> {
    throw new Error('Method not implemented.');
  }
  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const clientInfo = await readJsonFile<OAuthClientInformationFull>(
      this.serverUrlHash,
      'client_info.json',
      OAuthClientInformationFullSchema,
    );
    return clientInfo;
  }
  async saveClientInformation?(
    clientInformation: OAuthClientInformationMixed,
  ): Promise<void> {
    await writeJsonFile(
      this.serverUrlHash,
      'client_info.json',
      clientInformation,
    );
  }
  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens = await readJsonFile<OAuthTokens>(
      this.serverUrlHash,
      'tokens.json',
      OAuthTokensSchema,
    );
    return tokens;
  }
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeJsonFile(this.serverUrlHash, 'tokens.json', tokens);
  }
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    try {
      await open(authorizationUrl.toString());
      console.log('Browser opened automatically.');
    } catch (error) {
      console.error(
        'Could not open browser automatically. Please copy and paste the URL above into your browser.',
      );
    }
  }
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await writeTextFile(this.serverUrlHash, 'code_verifier.txt', codeVerifier);
  }
  async codeVerifier(): Promise<string> {
    const verifier = await readTextFile(
      this.serverUrlHash,
      'code_verifier.txt',
      'No code verifier saved for session',
    );
    return verifier;
  }
  addClientAuthentication?(
    headers: Headers,
    params: URLSearchParams,
    url: string | URL,
    metadata?: AuthorizationServerMetadata,
  ): void | Promise<void> {
    throw new Error('Method not implemented.');
  }
  validateResourceURL?(
    serverUrl: string | URL,
    resource?: string,
  ): Promise<URL | undefined> {
    throw new Error('Method not implemented.');
  }
  invalidateCredentials?(
    scope: 'all' | 'client' | 'tokens' | 'verifier',
  ): void | Promise<void> {
    throw new Error('Method not implemented.');
  }
}

export async function writeJsonFile(
  serverUrlHash: string,
  filename: string,
  data: any,
): Promise<void> {
  try {
    const configDir = path.join(app.getPath('userData'), '.mcp');
    await fs.promises.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, `${serverUrlHash}_${filename}`);
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      'utf-8',
    );
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    throw error;
  }
}

export async function readJsonFile<T>(
  serverUrlHash: string,
  filename: string,
  schema: any,
): Promise<T | undefined> {
  try {
    const configDir = path.join(app.getPath('userData'), '.mcp');
    await fs.promises.mkdir(configDir, { recursive: true });

    const filePath = path.join(configDir, `${serverUrlHash}_${filename}`);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const result = await schema.parseAsync(JSON.parse(content));
    // console.log({ filename: result })
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // console.log(`File ${filename} does not exist`)
      return undefined;
    }
    console.error(`Error reading ${filename}:`, error);
    return undefined;
  }
}

export async function writeTextFile(
  serverUrlHash: string,
  filename: string,
  data: string,
): Promise<void> {
  try {
    const configDir = path.join(app.getPath('userData'), '.mcp');
    await fs.promises.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, `${serverUrlHash}_${filename}`);
    await fs.promises.writeFile(filePath, data, 'utf-8');
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    throw error;
  }
}

export async function readTextFile(
  serverUrlHash: string,
  filename: string,
  errorMessage?: string,
): Promise<string> {
  try {
    const configDir = path.join(app.getPath('userData'), '.mcp');
    await fs.promises.mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, `${serverUrlHash}_${filename}`);
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(errorMessage || `Error reading ${filename}`);
  }
}
