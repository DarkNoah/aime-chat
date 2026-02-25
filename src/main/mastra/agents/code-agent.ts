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
import {
  Task,
  TaskCreate,
  TaskGet,
  TaskList,
  TaskUpdate,
} from '@/main/tools/common/task';
import { Read } from '@/main/tools/file-system/read';
import { Write } from '@/main/tools/file-system/write';
import { Edit } from '@/main/tools/file-system/edit';
import { Glob } from '@/main/tools/file-system/glob';
import { Grep } from '@/main/tools/file-system/grep';
import { WebFetch } from '@/main/tools/web/web-fetch';
import { WebSearch } from '@/main/tools/web/web-search';
import { CodeExecution } from '@/main/tools/code/code-execution';
import {
  Bash,
  BashOutput,
  KillBash,
  ListBash,
} from '@/main/tools/file-system/bash';
import { Skill } from '@/main/tools/common/skill';
import fs from 'fs';
import path from 'path';
import { Explore } from './explore-agent';
import { codeAgentInstructions } from './prompts/code-agent-prompt';
import { Plan } from './plan-agent';
import { LibSQLDatabaseInfo, LibSQLDescribeTable, LibSQLListTable, LibSQLRun } from '@/main/tools/database/libsql';
import { Message } from '@/main/tools/common/message';

export class CodeAgent extends BaseAgent {
  id: string = 'CodeAgent';
  name: string = 'Code Agent';
  description: string = 'A code agent that can help with code related tasks.';
  instructions: DynamicAgentInstructions = codeAgentInstructions;
  // model: string = 'openai/gpt-4o-mini';
  tools: string[] = [
    // `${ToolType.BUILD_IN}:${TodoWrite.toolName}`,
    `${ToolType.BUILD_IN}:${AskUserQuestion.toolName}`,
    // `${ToolType.BUILD_IN}:${Task.toolName}`,
    `${ToolType.BUILD_IN}:${Bash.toolName}`,
    `${ToolType.BUILD_IN}:${BashOutput.toolName}`,
    `${ToolType.BUILD_IN}:${KillBash.toolName}`,
    `${ToolType.BUILD_IN}:${Read.toolName}`,
    `${ToolType.BUILD_IN}:${Write.toolName}`,
    `${ToolType.BUILD_IN}:${Edit.toolName}`,
    `${ToolType.BUILD_IN}:${Glob.toolName}`,
    `${ToolType.BUILD_IN}:${Grep.toolName}`,
    `${ToolType.BUILD_IN}:${WebFetch.toolName}`,
    `${ToolType.BUILD_IN}:${WebSearch.toolName}`,
    `${ToolType.BUILD_IN}:${CodeExecution.toolName}`,
    `${ToolType.BUILD_IN}:${Skill.toolName}`,
    `${ToolType.BUILD_IN}:${Task.toolName}`,
    `${ToolType.BUILD_IN}:${Message.toolName}`,
    `${ToolType.BUILD_IN}:${TaskCreate.toolName}`,
    `${ToolType.BUILD_IN}:${TaskGet.toolName}`,
    `${ToolType.BUILD_IN}:${TaskList.toolName}`,
    `${ToolType.BUILD_IN}:${TaskUpdate.toolName}`,
    `${ToolType.BUILD_IN}:${LibSQLListTable.toolName}`,
    `${ToolType.BUILD_IN}:${LibSQLDescribeTable.toolName}`,
    `${ToolType.BUILD_IN}:${LibSQLDatabaseInfo.toolName}`,
    `${ToolType.BUILD_IN}:${LibSQLRun.toolName}`,
  ];
  subAgents: string[] = [`${Explore.agentName}`, `${Plan.agentName}`];
  constructor(params: BaseAgentParams) {
    super(params);
  }
}
