import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
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

export interface SkillToolParams extends BaseToolParams {
  skills: SkillInfo[] | string[];
}

export class Skill extends BaseTool {
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
    skill: z
      .string()
      .describe(`The skill name (no arguments). E.g., "pdf" or "xlsx"`),
  });

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
${_skills
  .map(
    (skill) => `
  <skill>
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
    const { skill } = inputData;
    const skillInfo = await skillManager.getClaudeSkill(skill);
    if (skillInfo)
      return `Base directory for this skill: ${skillInfo.path}

${skillInfo.content}`;
    return `skill: "${skill}" not found`;
  };
}

export class SkillManager {
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
          cwd: path.join(marketplaces, marketplace),
          absolute: true,
        });
        for (const md of mds) {
          const skillPath = path.dirname(md);
          const skillMD = await fs.promises.readFile(md, { encoding: 'utf8' });
          const data = matter(skillMD);

          const relativePath = path.relative(
            path.join(marketplaces, marketplace),
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
      `${marketplace ? marketplace + '/' : ''}**/${id.replaceAll(':', '/')}/SKILL.md`,
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

  public getSkill(id: `${ToolType.SKILL}:${string}`) {}
}

export const skillManager = new SkillManager();
