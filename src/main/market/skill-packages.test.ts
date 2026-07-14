import fs from 'fs';
import os from 'os';
import path from 'path';
import { discoverMarketSkillPackages } from './skill-packages';

describe('discoverMarketSkillPackages', () => {
  let marketPath: string;

  beforeEach(async () => {
    marketPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'market-skills-'),
    );
  });

  afterEach(async () => {
    await fs.promises.rm(marketPath, { recursive: true, force: true });
  });

  it('uses the first-level parent directory as a group', async () => {
    const rootSkill = path.join(marketPath, 'skill1');
    const groupedSkill = path.join(marketPath, 'abc', 'skill2');
    await fs.promises.mkdir(rootSkill, { recursive: true });
    await fs.promises.mkdir(groupedSkill, { recursive: true });
    await fs.promises.writeFile(
      path.join(rootSkill, 'SKILL.md'),
      '---\nname: skill1\ndescription: Root skill\nautoInstall: false\n---\n',
    );
    await fs.promises.writeFile(
      path.join(groupedSkill, 'SKILL.md'),
      [
        '---',
        'name: skill2',
        'display_name: Grouped Skill',
        'version: 2.1.0',
        'category: Office',
        'description: Grouped skill',
        'tags:',
        '  - audit',
        'autoInstall: true',
        '---',
      ].join('\n'),
    );

    const skills = await discoverMarketSkillPackages(marketPath);

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'skill1',
          group: undefined,
          autoInstall: false,
        }),
        expect.objectContaining({
          id: 'skill2',
          group: 'abc',
          autoInstall: true,
          displayName: 'Grouped Skill',
          version: '2.1.0',
          category: 'Office',
          tags: ['audit'],
        }),
      ]),
    );
  });

  it('supports a URL-only package configured by SKILL.md', async () => {
    const skillPath = path.join(marketPath, 'remote-skill');
    await fs.promises.mkdir(skillPath, { recursive: true });
    await fs.promises.writeFile(
      path.join(skillPath, 'SKILL.md'),
      [
        '---',
        'name: remote-skill',
        'description: Remote skill',
        'url: https://example.com/SKILL.md',
        'autoInstall: false',
        '---',
      ].join('\n'),
    );

    const skills = await discoverMarketSkillPackages(marketPath);

    expect(skills).toEqual([
      expect.objectContaining({
        name: 'remote-skill',
        description: 'Remote skill',
        url: 'https://example.com/SKILL.md',
        group: undefined,
      }),
    ]);
  });
});
