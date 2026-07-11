import type { ToolExecutionContext } from '@mastra/core/tools' with { "resolution-mode": "import" };
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { nanoid } from '@/utils/nanoid';

export interface CreatePlanParams extends BaseToolParams { }

const PLANS_DIR = path.join('.aime-chat', 'plans');

const todoSchema = z.strictObject({
  id: z
    .string()
    .optional()
    .describe('Unique id of the todo item. Auto-generated if omitted.'),
  content: z
    .string()
    .min(1)
    .describe('Imperative description of the step, e.g. "Add login API endpoint".'),
  status: z
    .enum(['pending', 'in_progress', 'completed'])
    .optional()
    .default('pending')
    .describe('Current status of the step. Defaults to "pending".'),
});

/** Convert the plan title into a safe file name; unsafe characters are replaced with "-" */
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|\s#%&{}$!'@+`=]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || nanoid(8);
}

export class CreatePlan extends BaseTool<CreatePlanParams> {
  static readonly toolName = 'CreatePlan';
  id: string = 'CreatePlan';
  description = `Create a plan for the current task.

Use this tool for any kind of task that benefits from an upfront plan - coding, research, writing, data analysis, operations, automation, etc.

IMPORTANT prerequisite: only call this tool AFTER you have gathered sufficient context to back the plan. Before calling it, you should:
- Explore the codebase (read files, grep, glob) to understand existing patterns and constraints
- Search the web or documentation when external knowledge is needed
- Ask the user questions to clarify ambiguous requirements and confirm the direction
Do NOT generate a plan based on assumptions. A plan built on insufficient context wastes the user's time and leads to rework.

The generated markdown file contains:
- YAML frontmatter with \`name\`, \`overview\` and a structured \`todos\` list (id / content / status)
- The plan body you provide (mermaid flowchart, execution steps, key resources, acceptance criteria, etc.)

Keep the plan concise but complete enough to execute directly.`;

  inputSchema = z
    .object({
      name: z
        .string()
        .min(1)
        .describe('Short title of the plan, also used as the file name.'),
      overview: z
        .string()
        .describe('One or two sentence summary of what this plan accomplishes.'),
      todos: z
        .array(todoSchema)
        .min(1)
        .describe('Ordered todo list of execution steps for the plan.'),
      plan: z
        .string()
        .describe(
          `The full plan content in markdown. It MUST include the following sections:
- \`## Flowchart\`: a mermaid flowchart describing the execution flow, wrapped in a \`\`\`mermaid code fence
- \`## Steps\`: detailed execution steps, consistent with the todos list
- \`## Key Resources\`: key files, tools, data sources, links or other resources involved, with a short note for each
- \`## Acceptance Criteria\`: concrete ways to verify the task is completed correctly (commands to run, behaviors to check, deliverables to review, etc)

These sections are the baseline, NOT the limit - dynamically add any other sections that fit the task at hand, e.g. Risks, Dependencies, Timeline, Research Questions, API Design, Data Model, Testing Strategy, Alternatives Considered, Rollback Plan, Open Questions. Do NOT repeat the title/overview - they are rendered automatically.`,
        ),
    })
    .strict();

  resumeSchema = z.object({
    confirm: z.boolean(),
  });
  suspendSchema = z.object({
    reason: z.string(),
  });

  constructor(config?: CreatePlanParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<
      typeof this.suspendSchema,
      typeof this.resumeSchema
    >,
  ) => {
    const { name, overview, todos, plan } = inputData;

    if (!context.agent?.resumeData) {
      return context.agent?.suspend?.({ reason: 'Human approval required.' });
    }

    const confirm = context.agent?.resumeData?.confirm;
    if (!confirm) {
      return `User has not approved your plan.`;
    }



    const workspace = context.requestContext.get('workspace' as never) as
      | string
      | undefined;
    if (!workspace) {
      throw new Error('Workspace not found, CreatePlan must be used in a chat workspace');
    }

    const normalizedTodos = todos.map((todo) => ({
      id: todo.id || nanoid(8),
      content: todo.content,
      status: todo.status ?? 'pending',
    }));

    const body = [`# ${name}`, '', overview.trim(), '', plan.trim()].join('\n') + '\n';

    const content = matter.stringify(body, {
      name,
      overview,
      todos: normalizedTodos,
    });

    const plansDir = path.join(workspace, PLANS_DIR);
    fs.mkdirSync(plansDir, { recursive: true });

    let fileName = `${slugify(name)}.plan.md`;
    if (fs.existsSync(path.join(plansDir, fileName))) {
      fileName = `${slugify(name)}-${nanoid(6)}.plan.md`;
    }
    const planPath = path.join(plansDir, fileName);
    await fs.promises.writeFile(planPath, content, 'utf-8');

    const relativePath = path.join(PLANS_DIR, fileName);
    return `Plan file created at \`${relativePath}\`.

User has approved your plan. You can now start executing it. Start with updating your todo list if applicable, and keep the plan file's todo statuses in sync as you make progress.`;
  };
}
