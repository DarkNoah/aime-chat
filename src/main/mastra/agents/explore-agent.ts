import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { BaseAgent, BaseAgentParams } from './base-agent';
import { ToolType } from '@/types/tool';
import { TodoWrite } from '@/main/tools/common/todo-write';
import { AskUserQuestion } from '@/main/tools/common/ask-user-question';
import { Read } from '@/main/tools/file-system/read';
import { Write } from '@/main/tools/file-system/write';
import { Bash } from '@/main/tools/file-system/bash';
import { Edit } from '@/main/tools/file-system/edit';
import { Glob } from '@/main/tools/file-system/glob';
import { Grep } from '@/main/tools/file-system/grep';
import { WebFetch } from '@/main/tools/web/web-fetch';
import { WebSearch } from '@/main/tools/web/web-search';
import { CodeExecution } from '@/main/tools/code/code-execution';
import { RequestContext } from '@mastra/core/request-context';
import { ChatRequestContext } from '@/types/chat';
import { Mastra } from '@mastra/core';
import os from 'os';
import fs from 'fs';
import path from 'path';
import {
  TaskCreate,
  TaskGet,
  TaskList,
  TaskUpdate,
} from '@/main/tools/common/task';

export class Explore extends BaseAgent {
  static readonly agentName = 'Explore';
  id: string = 'Explore';
  name: string = 'Explore';
  description?: string = `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`;
  instructions: DynamicAgentInstructions = ({
    requestContext,
    mastra,
  }: {
    requestContext: RequestContext<ChatRequestContext>;
    mastra: Mastra;
  }) => {
    let workspace;
    let isGitRepo;
    workspace = requestContext.get('workspace');
    const tools = requestContext.get('tools') ?? [];
    if (workspace) {
      isGitRepo = fs.existsSync(path.join(workspace, '.git'));
    }
    return {
      role: 'system',
      content: `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Use Bash for file operations like copying, moving, or listing directory contents
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Do not create any files, or run bash commands that modify the user's system state in any way

Complete the user's search request efficiently and report your findings clearly.


Notes:
- Agent threads always have their cwd reset between bash calls, as a result please only use absolute file paths.
- In your final response always share relevant file names and code snippets. Any file paths you return in your response MUST be absolute. Do NOT use relative paths.
- For clear communication with the user the assistant MUST avoid using emojis.

Here is useful information about the environment you are running in:
<env>
${workspace ? 'Working directory: ' + workspace : 'No working directory specified'}
${isGitRepo !== undefined ? `Is directory a git repo:${isGitRepo ? 'Yes' : 'No'}` : ''}
Platform: ${process.platform}
OS Version: ${os.type()} ${os.release()}
Today's date: ${new Date().toISOString().split('T')[0]}
</env>`,
    };
  };
  isHidden = true;
  // model: string = 'openai/gpt-4o-mini';
  tools: string[] = [
    // `${ToolType.BUILD_IN}:${TodoWrite.toolName}`,
    `${ToolType.BUILD_IN}:${TaskCreate.toolName}`,
    `${ToolType.BUILD_IN}:${TaskGet.toolName}`,
    `${ToolType.BUILD_IN}:${TaskList.toolName}`,
    `${ToolType.BUILD_IN}:${TaskUpdate.toolName}`,
    `${ToolType.BUILD_IN}:${Bash.toolName}`,
    `${ToolType.BUILD_IN}:${Read.toolName}`,
    `${ToolType.BUILD_IN}:${Write.toolName}`,
    `${ToolType.BUILD_IN}:${Edit.toolName}`,
    `${ToolType.BUILD_IN}:${Glob.toolName}`,
    `${ToolType.BUILD_IN}:${Grep.toolName}`,
    `${ToolType.BUILD_IN}:${WebFetch.toolName}`,
    `${ToolType.BUILD_IN}:${WebSearch.toolName}`,
    `${ToolType.BUILD_IN}:${CodeExecution.toolName}`,
  ];
  constructor(params: BaseAgentParams) {
    super(params);
  }
}
