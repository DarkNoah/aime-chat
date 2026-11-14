import { getSkillIconName, loadEntityIcon } from './use-entity-icon';

describe('use-entity-icon', () => {
  const getEntityIcon = jest.fn();

  beforeAll(() => {
    (window as any).electron = { app: { getEntityIcon } };
  });

  beforeEach(() => {
    getEntityIcon.mockReset();
  });

  it('uses the last id segment as the skill icon name', () => {
    expect(getSkillIconName('skill:pdf')).toBe('pdf');
    expect(getSkillIconName('skill:local:pdf')).toBe('pdf');
    expect(getSkillIconName('skill:anthropics:xlsx')).toBe('xlsx');
    expect(getSkillIconName('mcp:github')).toBeUndefined();
    expect(getSkillIconName(undefined)).toBeUndefined();
    expect(getSkillIconName('skill:')).toBeUndefined();
  });

  it('dedupes concurrent requests and caches the result', async () => {
    getEntityIcon.mockResolvedValue('data:image/jpeg;base64,AAA');
    const [a, b] = await Promise.all([
      loadEntityIcon('agents', 'writer'),
      loadEntityIcon('agents', 'writer'),
    ]);
    expect(a).toBe('data:image/jpeg;base64,AAA');
    expect(b).toBe(a);
    await loadEntityIcon('agents', 'writer');
    expect(getEntityIcon).toHaveBeenCalledTimes(1);
    expect(getEntityIcon).toHaveBeenCalledWith('agents', 'writer');
  });

  it('caches a missing icon as null', async () => {
    getEntityIcon.mockRejectedValue(new Error('ipc failed'));
    await expect(loadEntityIcon('skills', 'missing')).resolves.toBeNull();
    await expect(loadEntityIcon('skills', 'missing')).resolves.toBeNull();
    expect(getEntityIcon).toHaveBeenCalledTimes(1);
  });
});
