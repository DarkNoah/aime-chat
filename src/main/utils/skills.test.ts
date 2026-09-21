/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getSkills } from './skills';

describe('workspace skill discovery', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-skills-'));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  async function writeSkill(directory: string) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'SKILL.md'),
      '---\nname: Review\ndescription: Review changes\n---\nReview instructions');
  }

  it.each(['skills', '.agents/skills'])(
    'discovers nested SKILL.md files under %s with callable IDs',
    async (root) => {
      const directory = path.join(workspace, root, 'team', 'review');
      await writeSkill(directory);
      expect(await getSkills(path.join(workspace, root))).toEqual([
        expect.objectContaining({
          id: 'skill:local:review',
          name: 'Review',
          description: 'Review changes',
          path: directory,
          skillmd: 'Review instructions',
        }),
      ]);
    },
  );

  it('preserves existing manifest IDs and source metadata', async () => {
    await writeSkill(path.join(workspace, 'review'));
    await fs.writeFile(path.join(workspace, 'skills.json'), JSON.stringify([
      { id: 'skill:market:review', name: 'review', source: 'market' },
    ]));
    expect(await getSkills(workspace)).toEqual([
      expect.objectContaining({ id: 'skill:market:review', source: 'market' }),
    ]);
  });

  it('handles workspace paths containing glob characters', async () => {
    const root = path.join(workspace, '[project]', 'skills');
    await writeSkill(path.join(root, 'review'));
    expect(await getSkills(root)).toHaveLength(1);
  });

  it('returns no skills for a missing directory', async () => {
    expect(await getSkills(path.join(workspace, 'missing'))).toEqual([]);
  });
});
