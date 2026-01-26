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
import matter from 'gray-matter';
import { ToolType } from '@/types/tool';
import fg from 'fast-glob';
import { isString } from '@/utils/is';
import unzipper from 'unzipper';
import os from 'os';
import { getSkills } from '@/main/utils/skills';

export interface SkillToolParams extends BaseToolParams {
  skills: SkillInfo[] | string[];
}

export class Skill extends BaseTool {
  static readonly toolName = 'Skill';
  id: string = 'Skill';
  description = `Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke skills using this tool with the skill name only (no arguments)
- When you invoke a skill, you will see <command-message>The "{name}" skill is loading</command-message>
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
  <skill>
    <name>document-skills:xlsx</name>
    <description>Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis, and visualization. When Claude needs to work with spreadsheets (.xlsx, .xlsm, .csv, .tsv, etc) for: (1) Creating new spreadsheets with formulas and formatting, (2) Reading or analyzing data, (3) Modify existing spreadsheets while preserving formulas, (4) Data analysis and visualization in spreadsheets, or (5) Recalculating formulas (plugin:document-skills@anthropic-agent-skills)</description>
    <location>plugin</location>
  </skill>
</available_skills>

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
    this.description = this.getDescription(config?.skills ?? []);
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
    const { requestContext } = context;
    if (!skill_id.startsWith(`${ToolType.SKILL}:`)) {
      throw new Error(`please use skill id`);
    }

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
        const skill = skills.find((x) => x.id === skill_id);
        if (skill) {
          skillInfo = skill;
        }
      }
    }
    if (!skillInfo) {
      skillInfo = await skillManager.getSkill(
        skill_id as `${ToolType.SKILL}:${string}`,
      );
    }

    if (skillInfo)
      return `Base directory for this skill: ${skillInfo.path}

${skillInfo.content}


${agrs ? 'ARGUMENTS: ' + agrs : ''}
`;
    return `skill id: "${skill_id}" not found`;
  };
}

export class SkillManager {
  public async getSkills(): Promise<SkillInfo[]> {
    const claudeSkills = await this.getClaudeSkills();
    const localSkills = await toolsManager.toolsRepository.find({
      where: {
        type: ToolType.SKILL,
      },
    });
    return [
      ...claudeSkills,
      ...localSkills
        .filter((x) => !claudeSkills.map((y) => y.id).includes(x.id))
        .map((x) => {
          return {
            id: x.id as `${ToolType.SKILL}:${string}`,
            name: x.name,
            description: x.description,
            path: path.join(
              app.getPath('userData'),
              'skills',
              x.id.split(':')[1],
            ),
          };
        }),
    ];
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
          const skillMD = await fs.promises.readFile(md, { encoding: 'utf8' });
          const data = matter(skillMD);

          const relativePath = path.relative(
            path.join(marketplaces, marketplace, 'skills'),
            skillPath,
          );
          const skillId = relativePath
            .replaceAll('\\', ':')
            .replaceAll('/', ':');
          const skill = {
            id: `${ToolType.SKILL}:${marketplace}:${skillId}`,
            name: skillId,
            description: data.data.description,
            // isActive: false,
            path: skillPath,
          } as SkillInfo;
          skillList.push(skill);
        }
      } catch {}
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
      const skillMD = await fs.promises.readFile(md, { encoding: 'utf8' });
      const data = matter(skillMD);
      return {
        id: `${ToolType.SKILL}:${marketplace}:${id}`,
        name: id,
        description: data.data.description,
        content: data.content,
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
      try {
        const skillPath = localSkill.value?.path;
        const skillContent = await fs.promises.readFile(
          path.join(skillPath, 'SKILL.md'),
          { encoding: 'utf8' },
        );
        const skillInfo = matter(skillContent);
        return {
          id: localSkill.id,
          name: skillInfo.data.name,
          description: skillInfo.data.description,
          content: skillInfo.content,
          path: skillPath,
          type: ToolType.SKILL,
          isActive: localSkill.isActive,
        };
      } catch (err) {
        console.error(`Error reading skill file: ${err}`);
        return undefined;
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

      if (files.length === 0) {
        throw new Error('SKILL.md not found in the zip file');
      }

      // 读取并返回 SKILL.md 内容
      const skillMD = await fs.promises.readFile(files[0], {
        encoding: 'utf8',
      });
      const sourcePath = path.dirname(files[0]);
      const data = matter(skillMD);
      if (savePath) {
        // 确保目标目录存在
        await fs.promises.mkdir(savePath, { recursive: true });
        // 将 tempDir 内容复制到 savePath
        await fs.promises.cp(sourcePath, savePath, { recursive: true });
      }
      return {
        id: `${ToolType.SKILL}:${data.data.name}`,
        name: data.data.name,
        description: data.data.description,
        // content: data.content,
      };
    } finally {
      // 清理临时目录
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

export const skillManager = new SkillManager();
