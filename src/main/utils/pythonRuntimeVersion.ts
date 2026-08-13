export const PYTHON_RUNTIME_VERSION = '3.12';

export function isPythonRuntimeVersionCompatible(version?: string) {
  const match = version?.trim().match(/^(?:Python\s+)?(\d+)\.(\d+)(?:\.|$)/i);

  return match ? `${match[1]}.${match[2]}` === PYTHON_RUNTIME_VERSION : false;
}
