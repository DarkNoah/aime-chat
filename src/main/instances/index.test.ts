/* eslint-disable max-classes-per-file -- Isolated module mocks replace native and database dependencies. */
import { InstancesManager } from './index';
import { threadBrowserManager } from '../browser/manager';
import { dbManager } from '../db';

jest.mock('../db', () => ({
  dbManager: { dataSource: { getRepository: jest.fn() } },
}));
jest.mock('../BaseManager', () => ({ BaseManager: class {} }));
jest.mock('../ipc/IpcController', () => ({ channel: () => () => undefined }));
jest.mock('../browser/manager', () => ({
  threadBrowserManager: {
    prepareProfile: jest.fn(),
    overview: jest.fn(),
    closeAllTabs: jest.fn(),
    setInsecureTls: jest.fn(),
  },
}));
jest.mock('@/entities/instances', () => ({
  Instances: class {
    constructor(id: string, name: string, type: string, config: object) {
      Object.assign(this, { id, name, type, config });
    }
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(threadBrowserManager.prepareProfile)
    .mockReturnValue('/data/instances/default_browser');
  jest.mocked(threadBrowserManager.overview).mockReturnValue({
    userDataPath: '/data/instances/default_browser',
    tabCount: 0,
    threadCount: 0,
    chromiumVersion: '134',
    insecureTls: false,
    insecureTlsRestartRequired: false,
  });
});
it('replaces obsolete browser configuration after the profile migration succeeds', async () => {
  const repository = {
    delete: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
  };
  const transaction = jest.fn(async (callback) =>
    callback({ getRepository: () => repository }),
  );
  jest
    .mocked(dbManager.dataSource.getRepository)
    .mockReturnValue({ manager: { transaction } } as any);
  jest
    .mocked(threadBrowserManager.prepareProfile)
    .mockReturnValue('/data/instances/default_browser');
  await new InstancesManager().init();
  expect(repository.delete).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'browser' }),
  );
  expect(repository.save).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'default_browser',
      name: 'Electron Chromium',
      static: true,
      config: {
        engine: 'electron-chromium',
        userDataPath: '/data/instances/default_browser',
        insecureTls: false,
      },
    }),
  );
  expect(threadBrowserManager.setInsecureTls).toHaveBeenCalledWith(false);
});
it('preserves and restores the saved certificate setting at startup', async () => {
  const repository = {
    delete: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn().mockResolvedValue({ config: { insecureTls: true } }),
  };
  jest.mocked(dbManager.dataSource.getRepository).mockReturnValue({
    manager: {
      transaction: (callback) => callback({ getRepository: () => repository }),
    },
  } as any);
  await new InstancesManager().init();
  expect(repository.save).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({ insecureTls: true }),
    }),
  );
  expect(threadBrowserManager.setInsecureTls).toHaveBeenCalledWith(true);
});
it('does not change database settings if profile migration fails', async () => {
  const transaction = jest.fn();
  jest
    .mocked(dbManager.dataSource.getRepository)
    .mockReturnValue({ manager: { transaction } } as any);
  jest
    .mocked(threadBrowserManager.prepareProfile)
    .mockImplementationOnce(() => {
      throw new Error('profile busy');
    });
  await expect(new InstancesManager().init()).rejects.toThrow('profile busy');
  expect(transaction).not.toHaveBeenCalled();
});
it('reports only the shared Electron instance and scopes close-all to that instance', async () => {
  jest.mocked(threadBrowserManager.overview).mockReturnValue({
    userDataPath: '/data/instances/default_browser',
    tabCount: 3,
    threadCount: 2,
    chromiumVersion: '134',
    insecureTls: false,
    insecureTlsRestartRequired: false,
  });
  const manager = new InstancesManager();
  expect(await manager.getInstances()).toEqual([
    expect.objectContaining({
      name: 'Electron Chromium',
      tabCount: 3,
      threadCount: 2,
      status: 'running',
    }),
  ]);
  await expect(manager.stopInstance('other')).rejects.toThrow('Unknown');
  expect(threadBrowserManager.closeAllTabs).not.toHaveBeenCalled();
  await manager.stopInstance('default_browser');
  expect(threadBrowserManager.closeAllTabs).toHaveBeenCalledTimes(1);
});

it('saves instance TLS settings and rejects invalid IPC input', async () => {
  const manager = new InstancesManager();
  const record = {
    id: 'default_browser',
    config: { engine: 'electron-chromium', insecureTls: false },
  };
  const repository = {
    findOneByOrFail: jest.fn().mockResolvedValue(record),
    save: jest.fn(),
  };
  manager.repository = repository as any;
  await expect(manager.setInsecureTls('other', true)).rejects.toThrow(
    'Unknown',
  );
  await expect(
    manager.setInsecureTls('default_browser', 'false' as any),
  ).rejects.toThrow('boolean');
  expect(repository.save).not.toHaveBeenCalled();
  await manager.setInsecureTls('default_browser', true);
  expect(repository.save).toHaveBeenCalledWith(
    expect.objectContaining({
      config: { engine: 'electron-chromium', insecureTls: true },
    }),
  );
  expect(threadBrowserManager.setInsecureTls).toHaveBeenCalledWith(true);
});

it('keeps the runtime policy unchanged if saving fails', async () => {
  const manager = new InstancesManager();
  manager.repository = {
    findOneByOrFail: jest
      .fn()
      .mockResolvedValue({ config: { insecureTls: false } }),
    save: jest.fn().mockRejectedValue(new Error('disk full')),
  } as any;
  await expect(manager.setInsecureTls('default_browser', true)).rejects.toThrow(
    'disk full',
  );
  expect(threadBrowserManager.setInsecureTls).not.toHaveBeenCalled();
});
