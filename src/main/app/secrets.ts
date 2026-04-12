import { Repository } from 'typeorm';
import { BaseManager } from '../BaseManager';
import { Secrets } from '@/entities/secrets';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { SecretsChannel } from '@/types/ipc-channel';
import { nanoid } from '@/utils/nanoid';

class SecretsManager extends BaseManager {
    repository: Repository<Secrets>;

    public async init() {
        this.repository = dbManager.dataSource.getRepository(Secrets);
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

    public async getSecretsEnv(isGlobal: boolean | undefined = true): Promise<Record<string, string>> {
        const secrets = await this.repository.find({ where: { global: isGlobal } });
        const env: Record<string, string> = {};
        for (const secret of secrets) {
            env[secret.key] = secret.value;
        }
        return env;
    }

    public async getSecrets(isGlobal: boolean | undefined = true): Promise<Secrets[]> {
        const secrets = await this.repository.find({ where: { global: isGlobal } });
        return secrets;
    }
}

export const secretsManager = new SecretsManager();
