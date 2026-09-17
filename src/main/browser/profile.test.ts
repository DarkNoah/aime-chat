import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  browserProfilePath,
  migrateBrowserProfile,
  PROFILE_MARKER,
} from './profile';

let root: string;
let source: string;
let target: string;
const put = (filename: string, contents: string) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, contents);
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-profile-test-'));
  source = path.join(root, 'Partitions', 'aime-browser');
  target = browserProfilePath(root);
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it('preserves the Electron profile, removes only legacy default data, and is idempotent', () => {
  put(path.join(source, 'Cookies'), 'current-login');
  put(path.join(source, 'Local Storage', 'state'), 'current-storage');
  put(path.join(target, 'Default', 'Cookies'), 'legacy-login');
  const custom = path.join(root, 'system-edge', 'Cookies');
  put(custom, 'untouched');
  expect(migrateBrowserProfile(root)).toBe(target);
  expect(fs.readFileSync(path.join(target, 'Cookies'), 'utf8')).toBe(
    'current-login',
  );
  expect(
    fs.readFileSync(path.join(target, 'Local Storage', 'state'), 'utf8'),
  ).toBe('current-storage');
  expect(fs.existsSync(path.join(target, 'Default'))).toBe(false);
  expect(fs.existsSync(source)).toBe(false);
  expect(fs.readFileSync(custom, 'utf8')).toBe('untouched');
  put(path.join(target, 'Cookies'), 'updated-login');
  migrateBrowserProfile(root);
  expect(fs.readFileSync(path.join(target, 'Cookies'), 'utf8')).toBe(
    'updated-login',
  );
  expect(fs.readdirSync(path.dirname(target))).toEqual(['default_browser']);
});

it('creates a fresh Electron profile if only the old external browser exists', () => {
  put(path.join(target, 'Default', 'Cookies'), 'legacy');
  migrateBrowserProfile(root);
  expect(fs.readdirSync(target)).toEqual([PROFILE_MARKER]);
});

it.each(['source', 'legacy', 'destination'])(
  'recovers after interruption at the %s rename',
  (boundary) => {
    put(path.join(source, 'Cookies'), 'preserved');
    put(path.join(target, 'Default', 'Cookies'), 'obsolete');
    const rename = fs.renameSync;
    const mock = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      rename(from, to);
      if (
        (boundary === 'source' && from === source) ||
        (boundary === 'legacy' && from === target) ||
        (boundary === 'destination' && to === target)
      )
        throw new Error('interrupted');
    });
    expect(() => migrateBrowserProfile(root)).toThrow('interrupted');
    mock.mockRestore();
    migrateBrowserProfile(root);
    expect(fs.readFileSync(path.join(target, 'Cookies'), 'utf8')).toBe(
      'preserved',
    );
    expect(fs.readdirSync(path.dirname(target))).toEqual(['default_browser']);
  },
);

it('retries legacy cleanup without resetting the committed new profile', () => {
  put(path.join(source, 'Cookies'), 'preserved');
  put(path.join(target, 'Default', 'Cookies'), 'obsolete');
  const mock = jest.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
    throw new Error('busy');
  });
  expect(() => migrateBrowserProfile(root)).toThrow('busy');
  mock.mockRestore();
  put(path.join(target, 'Cookies'), 'new-login');
  migrateBrowserProfile(root);
  expect(fs.readFileSync(path.join(target, 'Cookies'), 'utf8')).toBe(
    'new-login',
  );
});

it('refuses a directory symlink instead of deleting an external profile', () => {
  const outside = path.join(root, 'external');
  put(path.join(outside, 'Cookies'), 'untouched');
  fs.mkdirSync(path.dirname(target));
  fs.symlinkSync(
    outside,
    target,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect(() => migrateBrowserProfile(root)).toThrow('real directory');
  expect(fs.readFileSync(path.join(outside, 'Cookies'), 'utf8')).toBe(
    'untouched',
  );
});

it('refuses to move a profile owned by another running process', () => {
  fs.symlinkSync(`test-host-${process.ppid}`, path.join(root, 'SingletonLock'));
  put(path.join(source, 'Cookies'), 'preserved');
  expect(() => migrateBrowserProfile(root)).toThrow('Close the browser');
  expect(fs.readFileSync(path.join(source, 'Cookies'), 'utf8')).toBe(
    'preserved',
  );
});

it('refuses unexpected staging data without deleting it', () => {
  const stage = path.join(
    root,
    'instances',
    '.electron-browser-migration-v1.stage',
    'data',
  );
  put(stage, 'untouched');
  expect(() => migrateBrowserProfile(root)).toThrow('Unrecognized');
  expect(fs.readFileSync(stage, 'utf8')).toBe('untouched');
});
