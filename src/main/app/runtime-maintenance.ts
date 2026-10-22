// Keep file-copy/cleanup isolated from commands that can modify an environment.
let migrating = false;
let users = 0;

export function assertRuntimeAvailable() {
  if (migrating) throw new Error('RUNTIME_MIGRATION_BUSY');
}

export function acquireRuntimeUse() {
  assertRuntimeAvailable();
  users += 1;
  let released = false;
  return () => {
    if (!released) users -= 1;
    released = true;
  };
}

export function beginRuntimeMigration() {
  if (migrating || users > 0) throw new Error('RUNTIME_MIGRATION_BUSY');
  migrating = true;
  return () => {
    migrating = false;
  };
}
