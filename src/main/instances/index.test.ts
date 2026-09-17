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
  },
}));
jest.mock('@/entities/instances', () => ({
  Instances: class {
    constructor(id: string, name: string, type: string, config: object) {
      Object.assign(this, { id, name, type, config });
    }
  },
}));

beforeEach(() => jest.clearAllMocks());
it('replaces obsolete browser configuration after the profile migration succeeds', async () => {
  const repository = { delete: jest.fn(), save: jest.fn() };
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
      },
    }),
  );
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
