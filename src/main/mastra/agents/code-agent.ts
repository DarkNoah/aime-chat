import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { BaseAgent, BaseAgentParams } from './base-agent';
import os from 'os';
import { ToolType } from '@/types/tool';
import { TodoWrite } from '@/main/tools/common/todo-write';
import { AskUserQuestion } from '@/main/tools/common/ask-user-question';
import { Task } from '@/main/tools/common/task';
import { Read } from '@/main/tools/file-system/read';
import { Write } from '@/main/tools/file-system/write';
import { Edit } from '@/main/tools/file-system/edit';
import { Glob } from '@/main/tools/file-system/glob';
import { Grep } from '@/main/tools/file-system/grep';
import { WebFetch } from '@/main/tools/web/web-fetch';
import { WebSearch } from '@/main/tools/web/web-search';
import { CodeExecution } from '@/main/tools/code/code-execution';
import { Bash } from '@/main/tools/file-system/bash';
import { Skill } from '@/main/tools/common/skill';
import fs from 'fs';
import path from 'path';
import { RequestContext } from '@mastra/core/request-context';
import { ChatRequestContext } from '@/types/chat';
import { Mastra } from '@mastra/core';
import { Explore } from './explore-agent';
import { codeAgentInstructions } from './prompts/code-agent-prompt';
import { Plan } from './plan-agent';
export class CodeAgent extends BaseAgent {
  id: string = 'CodeAgent';
  name: string = 'Code Agent';
  description: string = 'A code agent that can help with code related tasks.';
  instructions: DynamicAgentInstructions = codeAgentInstructions;
  // model: string = 'openai/gpt-4o-mini';
  tools: string[] = [
    `${ToolType.BUILD_IN}:${TodoWrite.name}`,
    `${ToolType.BUILD_IN}:${AskUserQuestion.name}`,
    // `${ToolType.BUILD_IN}:${Task.name}`,
    `${ToolType.BUILD_IN}:${Bash.name}`,
    `${ToolType.BUILD_IN}:${Read.name}`,
    `${ToolType.BUILD_IN}:${Write.name}`,
    `${ToolType.BUILD_IN}:${Edit.name}`,
    `${ToolType.BUILD_IN}:${Glob.name}`,
    `${ToolType.BUILD_IN}:${Grep.name}`,
    `${ToolType.BUILD_IN}:${WebFetch.name}`,
    `${ToolType.BUILD_IN}:${WebSearch.name}`,
    `${ToolType.BUILD_IN}:${CodeExecution.name}`,
    `${ToolType.BUILD_IN}:${Skill.name}`,
    `${ToolType.BUILD_IN}:${Task.name}`,
  ];
  subAgents: string[] = [`${Explore.name}`, `${Plan.name}`];
  constructor(params: BaseAgentParams) {
    super(params);
  }
}
