/** @jest-environment node */
import type { Application, RequestHandler } from 'express';
import { BaseManager } from '../../BaseManager';
import { secretsManager } from '../secrets';

jest.mock('electron', () => ({}));
jest.mock('../../db', () => ({ dbManager: {} }));
jest.mock('../index', () => ({ appManager: {} }));
jest.mock('@/utils/nanoid', () => {
  let sequence = 0;
  return { nanoid: () => `secret-id-${++sequence}` };
});

const routes = new Map<string, RequestHandler>();
const app = Object.fromEntries(
  ['get', 'post', 'put', 'patch', 'delete'].map((method) => [
    method,
    (url: string, handler: RequestHandler) =>
      routes.set(`${method} ${url}`, handler),
  ]),
) as unknown as Application;

const stored = new Map<string, any>();
const uniqueError = () =>
  Object.assign(new Error('INSERT secret VALUE secret-token'), {
    driverError: { code: 'SQLITE_CONSTRAINT_UNIQUE' },
    parameters: ['secret-token'],
  });
const repository = {
  find: jest.fn(async ({ where = {} }: any = {}) =>
    [...stored.values()]
      .filter((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      )
      .map((row) => ({ ...row })),
  ),
  findOneBy: jest.fn(async ({ id }: any) =>
    stored.has(id) ? { ...stored.get(id) } : null,
  ),
  save: jest.fn(async (row: any) => {
    if (
      [...stored.values()].some(
        (other) => other.key === row.key && other.id !== row.id,
      )
    )
      throw uniqueError();
    stored.set(row.id, { ...row });
    return { ...row };
  }),
  update: jest.fn(async ({ id }: any, patch: any) => {
    if (!stored.has(id)) return { affected: 0 };
    if (
      patch.key &&
      [...stored.values()].some((row) => row.key === patch.key && row.id !== id)
    )
      throw uniqueError();
    stored.set(id, { ...stored.get(id), ...patch });
    return { affected: 1 };
  }),
  delete: jest.fn(async ({ id }: any) => ({
    affected: stored.delete(id) ? 1 : 0,
  })),
};

async function invoke(method: string, individual = false, input: any = {}) {
  const handler = routes.get(
    `${method} /api/secrets${individual ? '/:id' : ''}`,
  );
  if (!handler) throw new Error('Missing secret API route');
  const res = {
    headersSent: false,
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockReturnValue(res);
  const next = jest.fn();
  await handler(
    { query: {}, params: { id: 'one' }, ...input } as any,
    res as any,
    next,
  );
  return {
    data: res.json.mock.calls[0]?.[0],
    error: next.mock.calls[0]?.[0],
    res,
  };
}

beforeAll(() => BaseManager.registerApiRoutes(app));
beforeEach(() => {
  jest.clearAllMocks();
  stored.clear();
  stored.set('one', {
    id: 'one',
    key: 'FIRST_KEY',
    value: 'secret-token',
    description: 'First',
    global: true,
  });
  stored.set('two', { id: 'two', key: 'SECOND_KEY', value: '', global: false });
  secretsManager.repository = repository as any;
});

it('registers CRUD routes and lists metadata with exact key/global filters', async () => {
  expect(routes.size).toBe(5);
  const listed = await invoke('get');
  expect(listed.data).toEqual([
    {
      id: 'one',
      key: 'FIRST_KEY',
      description: 'First',
      global: true,
      hasValue: true,
    },
    {
      id: 'two',
      key: 'SECOND_KEY',
      description: null,
      global: false,
      hasValue: false,
    },
  ]);
  expect(JSON.stringify(listed.data)).not.toContain('secret-token');
  expect(listed.res.setHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'no-store',
  );
  const filtered = await invoke('get', false, {
    query: { key: 'SECOND_KEY', global: 'false' },
  });
  expect(filtered.data).toHaveLength(1);
  expect(filtered.data[0].id).toBe('two');
  expect((await secretsManager.getList())[0].value).toBe('secret-token');
});

it('reveals only an explicitly requested individual value and disables caching', async () => {
  expect((await invoke('get', true)).data).not.toHaveProperty('value');
  expect(
    (await invoke('get', true, { query: { reveal: 'false' } })).data,
  ).not.toHaveProperty('value');
  const revealed = await invoke('get', true, { query: { reveal: 'true' } });
  expect(revealed.data.value).toBe('secret-token');
  expect(revealed.res.setHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'no-store',
  );
  expect(
    (await invoke('get', false, { query: { reveal: 'true' } })).error.status,
  ).toBe(400);
});

it('creates a non-global secret by default and preserves exact value bytes without echoing them', async () => {
  const created = await invoke('post', false, {
    body: { key: ' NEW_KEY ', value: ' secret-token\n ', description: 'New' },
  });
  expect(created.error).toBeUndefined();
  expect(created.res.status).toHaveBeenCalledWith(201);
  expect(created.data).toMatchObject({
    key: 'NEW_KEY',
    global: false,
    hasValue: true,
  });
  expect(created.data).not.toHaveProperty('value');
  expect(stored.get(created.data.id).value).toBe(' secret-token\n ');
});

it('patches supplied columns only, supports rename/false/clearing and preserves omitted values', async () => {
  const first = await invoke('patch', true, {
    body: { key: 'RENAMED_KEY', description: '', global: false },
  });
  expect(first.data).toMatchObject({
    id: 'one',
    key: 'RENAMED_KEY',
    global: false,
    description: '',
    hasValue: true,
  });
  expect(stored.get('one').value).toBe('secret-token');
  expect(repository.update).toHaveBeenCalledWith(
    { id: 'one' },
    { key: 'RENAMED_KEY', description: '', global: false },
  );
  const cleared = await invoke('patch', true, { body: { value: '' } });
  expect(cleared.data.hasValue).toBe(false);
  expect(stored.get('one')).toMatchObject({
    key: 'RENAMED_KEY',
    global: false,
    value: '',
  });
});

it('preserves independent concurrent API patches', async () => {
  await Promise.all([
    invoke('patch', true, { body: { value: 'rotated-token' } }),
    invoke('patch', true, { body: { global: false } }),
  ]);
  expect(stored.get('one')).toMatchObject({
    value: 'rotated-token',
    global: false,
  });
});

it.each([
  undefined,
  null,
  [],
  {},
  { key: 'KEY' },
  { value: 'secret-token' },
  { key: '1KEY', value: 'secret-token' },
  { key: 'KEY', value: 42 },
  { key: 'KEY', value: 'x\0y' },
  { key: 'KEY', value: '', global: 'false' },
  { key: 'KEY', value: '', description: null },
  { key: 'KEY', value: '', id: 'one' },
])('rejects invalid create input before storage: %p', async (body) => {
  expect((await invoke('post', false, { body })).error.status).toBe(400);
  expect(repository.save).not.toHaveBeenCalled();
});

it.each([
  {},
  { value: null },
  { global: 0 },
  { unknown: 'secret-token' },
  JSON.parse('{"__proto__":{}}'),
])('rejects invalid patches before storage: %p', async (body) => {
  expect((await invoke('patch', true, { body })).error.status).toBe(400);
  expect(repository.update).not.toHaveBeenCalled();
});

it.each([
  { global: 'yes' },
  { global: ['true'] },
  { key: ['FIRST_KEY'] },
  { key: '' },
  { unknown: 'secret-token' },
])('rejects malformed list queries: %p', async (query) => {
  expect((await invoke('get', false, { query })).error.status).toBe(400);
  expect(repository.find).not.toHaveBeenCalled();
});

it('reports duplicate creation/rename as 409 without overwriting or exposing values in errors', async () => {
  const created = await invoke('post', false, {
    body: { key: 'FIRST_KEY', value: 'another-secret' },
  });
  const renamed = await invoke('patch', true, { body: { key: 'SECOND_KEY' } });
  for (const result of [created, renamed]) {
    expect(result.error.status).toBe(409);
    expect(result.error.stack).not.toContain('secret-token');
    expect(JSON.stringify(result.error)).not.toContain('secret-token');
  }
  expect(stored.size).toBe(2);
  expect(stored.get('one').key).toBe('FIRST_KEY');
});

it('deletes just the selected record and returns 404 for missing records', async () => {
  expect((await invoke('delete', true)).data).toEqual({
    success: true,
    id: 'one',
  });
  expect(stored.has('one')).toBe(false);
  expect(stored.has('two')).toBe(true);
  for (const method of ['get', 'patch', 'delete']) {
    expect(
      (await invoke(method, true, { body: { global: true } })).error.status,
    ).toBe(404);
  }
});

it('rejects empty IDs and malformed reveal before touching storage', async () => {
  for (const method of ['get', 'patch', 'delete']) {
    expect(
      (await invoke(method, true, { params: {}, body: { global: true } })).error
        .status,
    ).toBe(400);
  }
  expect(
    (await invoke('get', true, { query: { reveal: ['true'] } })).error.status,
  ).toBe(400);
  expect(repository.findOneBy).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});

it('sanitizes unexpected database errors before the HTTP handler logs or returns them', async () => {
  repository.save.mockRejectedValueOnce(
    Object.assign(new Error('SQL secret-token'), {
      parameters: ['secret-token'],
    }),
  );
  const result = await invoke('post', false, {
    body: { key: 'NEW_KEY', value: 'secret-token' },
  });
  expect(result.error).toMatchObject({
    status: 500,
    message: 'Secret storage operation failed',
  });
  expect(result.error.stack).not.toContain('secret-token');
  expect(result.error).not.toHaveProperty('parameters');
  expect(result.res.setHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'no-store',
  );
});
