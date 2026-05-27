import type {
  ToolExecutionContext,
  ValidationError,
} from '@mastra/core/tools';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';

export class CreateGoal extends BaseTool {
  static readonly toolName = 'CreateGoal';
  id: string = 'CreateGoal';
  description = `Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks.
Set token_budget only when an explicit token budget is requested. Fails if a goal exists; use update_goal only for status.`;
  inputSchema = z.object({
    objective: z.string().describe('Required. The concrete objective to start pursuing. This starts a new active goal only when no goal is currently defined; if a goal already exists, this tool fails.')
  });
  isHidden = true;

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ): Promise<unknown | ValidationError> => {
    const { requestContext } = options;
    const { objective } = inputData;
    const goal = requestContext?.get('goal' as never) as any;
    if (goal) {
      if (goal.enable && !(goal.status == 'complete' || goal.status == 'blocked')) {
        return `Failed to create a new goal, current goal is pending: ${goal.objective}`;
      }
    }
    requestContext?.set('goal' as never, { enable: true, objective: objective as string, status: 'pending' } as never);

    return 'Goal created successfully. current goal: ' + objective;
  };
}


export class UpdateGoal extends BaseTool {
  static readonly toolName = 'UpdateGoal';
  id: string = 'UpdateGoal';
  description = `Update the existing goal.
Use this tool only to mark the goal achieved or genuinely blocked.
Set status to \`complete\` only when the objective has actually been achieved and no required work remains.
Set status to \`blocked\` only when the same blocking condition has repeated for at least three consecutive goal turns, counting the original/user-triggered turn and any automatic continuations, and the agent cannot make meaningful progress without user input or an external-state change.
If the user resumes a goal that was previously marked \`blocked\`, treat the resumed run as a fresh blocked audit. If the same blocking condition then repeats for at least three consecutive resumed goal turns, set status to \`blocked\` again.
Once the blocked threshold is satisfied, do not keep reporting that you are still blocked while leaving the goal active; set status to \`blocked\`.
Do not use \`blocked\` merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.
Do not mark a goal complete merely because its budget is nearly exhausted or because you are stopping work.
You cannot use this tool to pause, resume, budget-limit, or usage-limit a goal; those status changes are controlled by the user or system.
When marking a budgeted goal achieved with status \`complete\`, report the final token usage from the tool result to the user.`;
  inputSchema = z.object({
    status: z.enum(["complete", "blocked"]).describe('Required. Set to `complete` only when the objective is achieved and no required work remains. Set to `blocked` only after the same blocking condition has recurred for at least three consecutive goal turns and the agent is at an impasse. After a previously blocked goal is resumed, the resumed run starts a fresh blocked audit.')
  });
  isHidden = true;

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ): Promise<unknown | ValidationError> => {
    const { requestContext } = options;
    const { status } = inputData;
    const goal = requestContext?.get('goal' as never) as any;
    if (goal && goal.enable) {
      requestContext?.set('goal' as never, { enable: false, objective: goal?.objective as string, status: status } as never);
      return {
        objective: goal?.objective,
        status: status,
      }
    }
    return `Failed to update goal, current goal not set or not active.`;
  };
}

export class GetGoal extends BaseTool {
  static readonly toolName = 'GetGoal';
  id: string = 'GetGoal';
  description = `Get the current goal for this thread, including status, budgets, token and elapsed-time usage, and remaining token budget.`;
  inputSchema = z.object({});
  isHidden = true;
  constructor(config?: BaseToolParams) {
    super(config);
  }
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ): Promise<unknown | ValidationError> => {
    const { requestContext } = options;
    const goal = requestContext?.get('goal' as never) as any;
    if (goal && goal.enable) {
      return {
        objective: goal?.objective,
        status: goal.status,
      }
    }
    return `Goal not set or not active.`;
  };
}


export class GoalToolkit extends BaseToolkit {
  static readonly toolName = 'GoalToolkit';
  id: string = 'GoalToolkit';
  description = '';

  constructor(params?: BaseToolkitParams) {
    const listConfig = params?.[GetGoal.toolName];
    const createConfig = params?.[CreateGoal.toolName];
    const updateConfig = params?.[UpdateGoal.toolName];
    super(
      [
        new GetGoal(listConfig),
        new CreateGoal(createConfig),
        new UpdateGoal(updateConfig),
      ],
      params,
    );
  }
}
