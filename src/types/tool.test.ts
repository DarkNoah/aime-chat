import { ToolConfig } from './tool';

describe('Bash tool config', () => {
  it('uses the independent Python runtime by default', () => {
    const shell = process.platform === 'win32' ? 'powershell' : 'bash';

    expect(ToolConfig.Bash.configSchema.parse({ shell })).toMatchObject({
      shell,
      pythonRuntime: 'independent',
    });
  });

  it('allows selecting the system Python runtime', () => {
    const shell = process.platform === 'win32' ? 'powershell' : 'bash';

    expect(
      ToolConfig.Bash.configSchema.parse({ shell, pythonRuntime: 'system' }),
    ).toMatchObject({
      shell,
      pythonRuntime: 'system',
    });
  });
});
