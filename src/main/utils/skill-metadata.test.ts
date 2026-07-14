import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseSkillMarkdown, readSkillPackageMetadata } from './skill-metadata';

describe('skill metadata', () => {
  it('normalizes rich SKILL.md frontmatter metadata', () => {
    const { metadata } = parseSkillMarkdown(`---
name: sensitive_plaintext_audit
title: 数据智能审计 Agent
display_name: 数据智能审计 Agent
version: 4.3.0
type: skill
category: 数据安全/隐私合规
description: 敏感数据审计 Skill
icon: ./assets/icon.png
tags:
  - 数据安全
  - 敏感数据
entrypoints:
  scan: 'python3 scripts/field_audit.py --input "<input>"'
autoInstall: true
---

# Sensitive plaintext audit
`);

    expect(metadata).toEqual({
      name: 'sensitive_plaintext_audit',
      title: '数据智能审计 Agent',
      displayName: '数据智能审计 Agent',
      version: '4.3.0',
      category: '数据安全/隐私合规',
      description: '敏感数据审计 Skill',
      icon: './assets/icon.png',
      tags: ['数据安全', '敏感数据'],
      entrypoints: {
        scan: 'python3 scripts/field_audit.py --input "<input>"',
      },
      autoInstall: true,
      url: undefined,
    });
  });

  it('reads SKILL.md metadata and resolves a package-relative icon', async () => {
    const skillPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'skill-metadata-'),
    );
    await fs.promises.mkdir(path.join(skillPath, 'assets'));
    await fs.promises.writeFile(
      path.join(skillPath, 'assets', 'icon.png'),
      'x',
    );
    await fs.promises.writeFile(
      path.join(skillPath, 'SKILL.md'),
      [
        '---',
        'name: configured',
        'display_name: Configured Skill',
        'description: Skill description',
        'icon: ./assets/icon.png',
        '---',
        'Instructions',
      ].join('\n'),
    );

    const metadata = await readSkillPackageMetadata(skillPath);

    expect(metadata.name).toBe('configured');
    expect(metadata.displayName).toBe('Configured Skill');
    expect(metadata.description).toBe('Skill description');
    expect(metadata.icon).toBe(
      `file://${path.join(skillPath, 'assets', 'icon.png')}`,
    );
    expect(metadata.content).toBe('Instructions');

    const previewMetadata = await readSkillPackageMetadata(skillPath, {
      inlineIcon: true,
    });
    expect(previewMetadata.icon).toBe('data:image/png;base64,eA==');

    await fs.promises.rm(skillPath, { recursive: true, force: true });
  });
});
