import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { SkillInfo } from '@/types/skill';
import { toolsManager } from '..';
import { ToolType } from '@/types/tool';
import fg from 'fast-glob';
import { isString } from '@/utils/is';
import unzipper from 'unzipper';
import os from 'os';
import { getSkills } from '@/main/utils/skills';
import { getDataPath } from '@/main/utils';
import { Tools } from '@/entities/tools';
import { readSkillPackageMetadata } from '@/main/utils/skill-metadata';

export interface SkillToolParams extends BaseToolParams {
  skills: SkillInfo[] | string[];
}

export class Skill extends BaseTool {
  static readonly toolName = 'Skill';
  id: string = 'Skill';
  description = `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge.

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "commit", args: "-m 'Fix bug'"\` - invoke with arguments
  - \`skill: "review-pr", args: "123"\` - invoke with arguments
  - \`skill: "ms-office-suite:pdf"\` - invoke using fully qualified name

Important:
- Available skills are listed in system-reminder messages in the conversation
- When a skill matches the user's request, this is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- NEVER mention a skill without actually calling this tool
- Do not invoke a skill that is already running
- If the skill is already launching, you do not need to invoke the tool again.
`;
  inputSchema = z.strictObject({
    skill_id: z
      .string()
      .describe(
        `The skill id (no arguments). E.g., "skill:anthropic-agent-skills:pdf" or "skill:anthropic-agent-skills:xlsx"`,
      ),
    agrs: z.string().optional().describe(`Optional arguments for the skill`),
  });

  //outputSchema = z.string();

  constructor(config?: SkillToolParams) {
    super(config);
    // this.description = this.getDescription(config?.skills ?? []);
  }

  private static normalizeAimeChatDocsSkillId(skillId: string) {
    const id = skillId.toLowerCase();
    if (
      id === `${ToolType.SKILL}:local:aime-chat-dosc` ||
      id === `${ToolType.SKILL}:aime-chat-dosc`
    ) {
      return `${ToolType.SKILL}:local:aime-chat-docs`;
    }

    return skillId;
  }

  getDescription = (skills: SkillInfo[] | string[]) => {
    let _skills: SkillInfo[] = [];
    if (skills.length > 0 && isString(skills[0])) {
      throw new Error('Skills must be an array of SkillInfo');
    } else {
      _skills = skills as SkillInfo[];
    }

    return `Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke skills using this tool with the skill id only (no arguments)
- The skill's prompt will expand and provide detailed instructions on how to complete the task
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "xlsx"\` - invoke the xlsx skill
  - \`skill: "ms-office-suite:pdf"\` - invoke using fully qualified name

Important:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
</skills_instructions>

<available_skills>
${_skills
        .map(
          (skill) => `
  <skill>
    <id>${skill.id}</id>
    <name>${skill.name}</name>
    <description>${skill.description}</description>
  </skill>`,
        )
        .join('\n')}
</available_skills>
`;
  };

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { skill_id, agrs } = inputData;
    const { requestContext } = context ?? {};
    let _skillId = skill_id;
    if (!skill_id.startsWith(`${ToolType.SKILL}:`)) {
      // throw new Error(`please use skill id`);
      _skillId = `${ToolType.SKILL}:${skill_id}`;
    }
    const lookupSkillId = Skill.normalizeAimeChatDocsSkillId(_skillId);

    const workspace = requestContext.get('workspace' as never);
    let skillInfo;
    if (
      workspace &&
      fs.existsSync(workspace) &&
      fs.statSync(workspace).isDirectory()
    ) {
      const skillsPath = path.join(workspace, '.aime-chat', 'skills');
      if (fs.existsSync(skillsPath) && fs.statSync(skillsPath).isDirectory()) {
        const skills = await getSkills(skillsPath);
        const skill = skills.find(
          (x) =>
            x.id === lookupSkillId ||
            x.id === `${ToolType.SKILL}:local:${skill_id}`,
        );
        if (skill) {
          skillInfo = skill;
        }
      }
    }
    if (!skillInfo) {
      skillInfo = await skillManager.getSkill(
        lookupSkillId as `${ToolType.SKILL}: ${string}`,
      );
      if (!skillInfo) {
        skillInfo = await skillManager.getSkill(
          `${ToolType.SKILL}:local:${skill_id}` as `${ToolType.SKILL}: ${string}`,
        );
      }
    }
    const skillsLoaded = requestContext?.get('skillsLoaded' as never) ?? [];
    requestContext.set(
      'skillsLoaded' as never,
      [...new Set([...skillsLoaded, lookupSkillId])] as never,
    );

    if (skillInfo) {
      return `<system-reminder> Launching : \`${skillInfo.id}\`</system-reminder>
Base directory for this skill: ${skillInfo.path}

${skillInfo.content || skillInfo.skillmd}


${agrs ? 'ARGUMENTS: ' + agrs : ''}
`;
    }
    return `skill id: "${_skillId}" not found`;
  };
}

export class SkillManager {
  public async getSkills(): Promise<SkillInfo[]> {
    const discoveredSkills = await this.getLocalSkills();
    const localSkills = await toolsManager.toolsRepository.find({
      where: {
        type: ToolType.SKILL,
      },
    });
    const discoveredById = new Map(
      discoveredSkills.map((skill) => [skill.id, skill]),
    );

    return localSkills.map((tool) => {
      const id = tool.id as `${ToolType.SKILL}:${string}`;
      const discovered = discoveredById.get(id);
      return {
        ...discovered,
        id,
        name: discovered?.name || tool.name,
        description: discovered?.description || tool.description || '',
        path:
          discovered?.path ||
          path.join(
            app.getPath('userData'),
            'skills',
            tool.id.split(':').slice(2).join(':') || tool.id.split(':')[1],
          ),
        source: tool.value?.source,
        repo: tool.value?.repo,
      };
    });
  }


  async getLocalSkills(): Promise<SkillInfo[]> {
    const skillsPath = path.join(app.getPath('userData'), 'skills');
    if (
      !(fs.existsSync(skillsPath) && fs.statSync(skillsPath).isDirectory())
    ) {
      return [];
    }
    const skillList: SkillInfo[] = [];

    const mds = await fg('**/SKILL.md', {
      cwd: skillsPath,
      absolute: true,
    });

    for (const md of mds) {
      const skillName = path.basename(path.dirname(md));
      const skillPath = path.dirname(md);
      const metadata = await readSkillPackageMetadata(skillPath);
      delete metadata.content;
      const skill = {
        ...metadata,
        id: `${ToolType.SKILL}:local:${skillName}`,
        name: metadata.name || skillName,
        description: metadata.description || '',
        path: skillPath,
      } as SkillInfo;
      let localSkill: Tools | undefined = await toolsManager.toolsRepository.findOne({
        where: {
          type: ToolType.SKILL,
          id: skill.id
        },
      });
      if (!localSkill) {
        localSkill = new Tools(skill.id, skill.name, ToolType.SKILL);
        localSkill.isActive = true;
      }
      localSkill.name = skill.name;
      localSkill.description = skill.description;
      localSkill.value = {
        ...localSkill.value,
        path: skill.path,
      };
      await toolsManager.toolsRepository.save(localSkill);

      skillList.push(skill);
    }
    return skillList;
  }

  async getClaudeSkills(): Promise<SkillInfo[]> {
    const marketplaces = path.join(
      app.getPath('home'),
      '.claude',
      'plugins',
      'marketplaces',
    );
    if (
      !(fs.existsSync(marketplaces) && fs.statSync(marketplaces).isDirectory())
    ) {
      return [];
    }
    const marketplaceDir = fs.readdirSync(marketplaces);
    const skillList: SkillInfo[] = [];
    for (const marketplace of marketplaceDir) {
      try {
        const mds = await fg('**/SKILL.md', {
          cwd: path.join(marketplaces, marketplace, 'skills'),
          absolute: true,
        });
        for (const md of mds) {
          const skillPath = path.dirname(md);
          const metadata = await readSkillPackageMetadata(skillPath);
          delete metadata.content;

          const relativePath = path.relative(
            path.join(marketplaces, marketplace, 'skills'),
            skillPath,
          );
          const skillId = relativePath
            .replaceAll('\\', ':')
            .replaceAll('/', ':');
          const skill = {
            ...metadata,
            id: `${ToolType.SKILL}:${marketplace}:${skillId}`,
            name: metadata.name || skillId,
            description: metadata.description || '',
            // isActive: false,
            path: skillPath,
          } as SkillInfo;
          skillList.push(skill);
        }
      } catch { }
    }

    return skillList;
  }

  async getClaudeSkill(id: string, marketplace?: string) {
    const marketplaces = path.join(
      app.getPath('home'),
      '.claude',
      'plugins',
      'marketplaces',
    );
    if (
      marketplace &&
      !(fs.existsSync(marketplaces) && fs.statSync(marketplaces).isDirectory())
    ) {
      return undefined;
    }
    const mds = await fg(
      `${marketplace ? marketplace + '/' : ''}**/${id.replaceAll(':', '/')}/SKILL.md`.replace(
        /\\/g,
        '/',
      ),
      {
        cwd: marketplaces,
        absolute: true,
      },
    );
    if (mds.length === 1) {
      const md = mds[0];
      const metadata = await readSkillPackageMetadata(path.dirname(md));
      return {
        ...metadata,
        id: `${ToolType.SKILL}:${marketplace}:${id}`,
        name: metadata.name || id,
        description: metadata.description || '',
        content: metadata.content,
        path: path.dirname(md),
        type: ToolType.SKILL,
        isActive: false,
      };
    } else {
      return undefined;
    }
  }

  public async getSkill(id: `${ToolType.SKILL}:${string}`) {
    const marketplace = id.split(':')[1];
    const skill = id.split(':').slice(2).join(':');
    const sk = await skillManager.getClaudeSkill(skill, marketplace);

    if (sk) {
      //const skill = id.split(':').slice(2).join(':');
      // const sk = await skillManager.getClaudeSkill(skill, marketplace);
      return sk;
    } else {
      const localSkill = await toolsManager.toolsRepository.findOne({
        where: {
          id,
          type: ToolType.SKILL,
        },
      });
      if (!localSkill) {
        return undefined;
      }
      const skillPath = localSkill.value?.path;
      const source = localSkill.value?.source;
      const repo = localSkill.value?.repo;
      try {
        const skillInfo = await readSkillPackageMetadata(skillPath);
        return {
          ...skillInfo,
          id: localSkill.id,
          name: skillInfo.name || localSkill.name,
          description: skillInfo.description || localSkill.description || '',
          path: skillPath,
          source: source,
          repo,
          type: ToolType.SKILL,
          isActive: localSkill.isActive,
        };
      } catch (err) {
        console.error(`Error reading skill file: ${err}`);
        return {
          id: localSkill.id,
          name: undefined,
          description: undefined,
          content: undefined,
          path: skillPath,
          source,
          repo,
          type: ToolType.SKILL,
          isActive: localSkill.isActive,
        };
      }
    }
  }

  public async deleteSkill(id: `${ToolType.SKILL}:${string}`) {
    const marketplace = id.split(':')[1];

    if (marketplace == 'anthropic-agent-skills') {
      const skill = id.split(':').slice(2).join(':');
      throw new Error('Cannot delete Claude skill');
    } else {
      const localSkill = await toolsManager.toolsRepository.findOne({
        where: {
          id,
          type: ToolType.SKILL,
        },
      });
      const skillPath = path.join(
        app.getPath('userData'),
        'skills',
        localSkill.id.split(':')[1],
      );
      if (fs.existsSync(skillPath)) {
        await fs.promises.rm(skillPath, { recursive: true });
      }
      // await toolsManager.toolsRepository.delete(id);
    }
  }

  public async saveSkill(
    id: `${ToolType.SKILL}:${string}`,
    name: string,
    description: string,
    content?: string,
    resources?: Record<string, string[]>,
  ) {
    const skillPath = path.join(
      app.getPath('userData'),
      'skills',
      id.split(':').pop() as string,
    );
    fs.mkdirSync(skillPath, { recursive: true });
    const skillMDContent = `---
name: ${name}
description: ${description}
---
${content}`;
    await fs.promises.writeFile(
      path.join(skillPath, 'SKILL.md'),
      skillMDContent,
    );
  }

  public async parseSkill(file: string, savePath?: string): Promise<SkillInfo> {
    // 创建临时目录
    const tempDir = path.join(os.tmpdir(), `skill-${nanoid()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      // 流式解压 zip 文件到临时目录
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(file)
          .pipe(unzipper.Extract({ path: tempDir }))
          .on('close', resolve)
          .on('error', reject);
      });

      // 查找 SKILL.md 文件（兼容大小写）
      const files = await fg('**/skill.md', {
        cwd: tempDir,
        caseSensitiveMatch: false,
        absolute: true,
      });

      if (files.length !== 1) {
        throw new Error('SKILL.md not found in the zip file');
      }

      const sourcePath = path.dirname(files[0]);
      const metadata = await readSkillPackageMetadata(sourcePath);
      delete metadata.content;
      if (savePath) {
        // 确保目标目录存在
        await fs.promises.mkdir(savePath, { recursive: true });
        // 将 tempDir 内容复制到 savePath
        await fs.promises.cp(sourcePath, savePath, { recursive: true });
      }
      return {
        ...metadata,
        id: `${ToolType.SKILL}:local:${path.basename(sourcePath)}`,
        name: metadata.name || path.basename(sourcePath),
        description: metadata.description || '',
        // content: data.content,
      };
    } finally {
      // 清理临时目录
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

export const skillManager = new SkillManager();
