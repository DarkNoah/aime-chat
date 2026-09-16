import { Repository } from 'typeorm';
import { BaseManager } from '../BaseManager';
import { Secrets } from '@/entities/secrets';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { SecretsChannel } from '@/types/ipc-channel';
import { appManager } from './index';
import { app } from 'electron';
import path from 'path';
import type { Request, Response } from 'express';
import { api } from '../api/ApiController';

type SecretInput = Pick<Secrets, 'key' | 'value' | 'description' | 'global'>;

class SecretApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function secretSummary(secret: Secrets, reveal = false) {
  return {
    id: secret.id,
    key: secret.key,
    description: secret.description ?? null,
    global: secret.global,
    hasValue: secret.value.length > 0,
    ...(reveal ? { value: secret.value } : {}),
  };
}

function secretId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SecretApiError('A secret id is required', 400);
  }
  return value;
}

function booleanQuery(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new SecretApiError('Boolean query values must be true or false', 400);
}

function validateQuery(query: Request['query'], allowed: string[]) {
  if (Object.keys(query).some((key) => !allowed.includes(key))) {
    throw new SecretApiError('Unknown secret query parameter', 400);
  }
}

function parseSecretInput(
  input: unknown,
  partial: boolean,
): Partial<SecretInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SecretApiError('Expected a secret object', 400);
  }
  const data = input as Record<string, unknown>;
  const keys = Object.keys(data);
  if (
    !keys.length ||
    keys.some((key) => !['key', 'value', 'description', 'global'].includes(key))
  ) {
    throw new SecretApiError(
      'Provide only key, value, description or global',
      400,
    );
  }
  const result: Partial<SecretInput> = {};
  if (!partial || Object.hasOwn(data, 'key')) {
    if (
      typeof data.key !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(data.key.trim())
    ) {
      throw new SecretApiError(
        'key must be an environment variable name, such as MY_API_KEY',
        400,
      );
    }
    result.key = data.key.trim();
  }
  if (!partial || Object.hasOwn(data, 'value')) {
    if (typeof data.value !== 'string' || data.value.includes('\0')) {
      throw new SecretApiError(
        'value must be a string without NUL characters',
        400,
      );
    }
    result.value = data.value;
  }
  if (Object.hasOwn(data, 'description')) {
    if (typeof data.description !== 'string') {
      throw new SecretApiError(
        'description must be a string; use an empty string to clear it',
        400,
      );
    }
    result.description = data.description;
  }
  if (Object.hasOwn(data, 'global')) {
    if (typeof data.global !== 'boolean') {
      throw new SecretApiError('global must be a boolean', 400);
    }
    result.global = data.global;
  }
  return result;
}

class SecretsManager extends BaseManager {
  repository: Repository<Secrets>;

  public async init() {
    this.repository = dbManager.dataSource.getRepository(Secrets);
  }

  private async respond<T>(
    res: Response,
    operation: () => Promise<T>,
    status = 200,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.status(status).json(await operation());
    } catch (error) {
      if (error instanceof SecretApiError) throw error;
      // TypeORM errors may contain SQL parameters, including plaintext values.
      // Only forward fixed messages to the shared HTTP error handler/logger.
      if (
        error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        error?.driverError?.code === 'SQLITE_CONSTRAINT_UNIQUE'
      ) {
        throw new SecretApiError('A secret with this key already exists', 409);
      }
      throw new SecretApiError('Secret storage operation failed', 500);
    }
  }

  @api({ method: 'get', path: '/api/secrets', raw: true })
  public async listApi(req: Request, res: Response) {
    return this.respond(res, async () => {
      validateQuery(req.query, ['key', 'global']);
      const global = booleanQuery(req.query.global);
      const key = req.query.key;
      if (key !== undefined && (typeof key !== 'string' || !key.trim())) {
        throw new SecretApiError('key must be a non-empty string', 400);
      }
      const secrets = await this.repository.find({
        where: {
          ...(key !== undefined ? { key: (key as string).trim() } : {}),
          ...(global !== undefined ? { global } : {}),
        },
        order: { key: 'ASC' },
      });
      return secrets.map((secret) => secretSummary(secret));
    });
  }

  @api({ method: 'get', path: '/api/secrets/:id', raw: true })
  public async getApi(req: Request, res: Response) {
    return this.respond(res, async () => {
      validateQuery(req.query, ['reveal']);
      const reveal = booleanQuery(req.query.reveal) ?? false;
      const secret = await this.repository.findOneBy({
        id: secretId(req.params.id),
      });
      if (!secret) throw new SecretApiError('Secret not found', 404);
      return secretSummary(secret, reveal);
    });
  }

  @api({ method: 'post', path: '/api/secrets', raw: true })
  public async createApi(req: Request, res: Response) {
    return this.respond(
      res,
      async () => {
        const data = parseSecretInput(req.body, false) as SecretInput;
        return secretSummary(await this.create(data));
      },
      201,
    );
  }

  @api({ method: 'patch', path: '/api/secrets/:id', raw: true })
  public async updateApi(req: Request, res: Response) {
    return this.respond(res, async () => {
      const id = secretId(req.params.id);
      const data = parseSecretInput(req.body, true);
      // Update only supplied columns so concurrent API patches do not overwrite
      // unrelated fields with a stale entity snapshot.
      const result = await this.repository.update({ id }, data);
      if (!result.affected) throw new SecretApiError('Secret not found', 404);
      const secret = await this.repository.findOneBy({ id });
      if (!secret) throw new SecretApiError('Secret not found', 404);
      return secretSummary(secret);
    });
  }

  @api({ method: 'delete', path: '/api/secrets/:id', raw: true })
  public async deleteApi(req: Request, res: Response) {
    return this.respond(res, async () => {
      const id = secretId(req.params.id);
      const result = await this.repository.delete({ id });
      if (!result.affected) throw new SecretApiError('Secret not found', 404);
      return { success: true, id };
    });
  }

  @channel(SecretsChannel.GetList)
  public async getList(): Promise<Secrets[]> {
    return this.repository.find();
  }

  @channel(SecretsChannel.Create)
  public async create(data: {
    key: string;
    value: string;
    description?: string;
    global?: boolean;
  }): Promise<Secrets> {
    const entity = new Secrets(
      data.key,
      data.value,
      data.description,
      data.global,
    );
    return this.repository.save(entity);
  }

  @channel(SecretsChannel.Update)
  public async update(
    id: string,
    data: {
      key?: string;
      value?: string;
      description?: string;
      global?: boolean;
    },
  ): Promise<Secrets> {
    const entity = await this.repository.findOneByOrFail({ id });
    if (data.key !== undefined) entity.key = data.key;
    if (data.value !== undefined) entity.value = data.value;
    if (data.description !== undefined) entity.description = data.description;
    if (data.global !== undefined) entity.global = data.global;
    return this.repository.save(entity);
  }

  @channel(SecretsChannel.Delete)
  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  public async getSecretsEnv(
    isGlobal: boolean | undefined = true,
  ): Promise<Record<string, string>> {
    const secrets = await this.repository.find({ where: { global: isGlobal } });
    const env: Record<string, string> = {};
    for (const secret of secrets) {
      env[secret.key] = secret.value;
    }
    const appInfo = await appManager.getInfo();
    if (appInfo.apiServer.enabled) {
      env['AIME_CHAT_API_BASE_URL'] =
        `http://localhost:${appInfo.apiServer.port}`;
    }
    env['AIME_CHAT_SKILL_PATH'] = path.join(app.getPath('userData'), 'skills');
    return env;
  }

  public async getSecrets(
    isGlobal: boolean | undefined = true,
  ): Promise<Secrets[]> {
    try {
      const secrets = await this.repository.find({
        where: { global: isGlobal },
      });
      return secrets;
    } catch (err) {
      return [];
    }
  }
}

export const secretsManager = new SecretsManager();
