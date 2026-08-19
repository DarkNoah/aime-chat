import {
  isPythonRuntimeVersionCompatible,
  PYTHON_RUNTIME_VERSION,
} from './pythonRuntimeVersion';

describe('managed Python runtime version', () => {
  it('accepts only the configured Python major and minor version', () => {
    expect(PYTHON_RUNTIME_VERSION).toBe('3.12');
    expect(isPythonRuntimeVersionCompatible('3.12')).toBe(true);
    expect(isPythonRuntimeVersionCompatible('3.12.12')).toBe(true);
    expect(isPythonRuntimeVersionCompatible('Python 3.12.0')).toBe(true);
    expect(isPythonRuntimeVersionCompatible('3.10.18')).toBe(false);
    expect(isPythonRuntimeVersionCompatible('3.13.0')).toBe(false);
    expect(isPythonRuntimeVersionCompatible(undefined)).toBe(false);
  });
});
