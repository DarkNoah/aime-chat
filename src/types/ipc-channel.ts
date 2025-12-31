export enum ProviderChannel {
  GetAvailableModels = 'providers:getAvailableModels',
  GetModelList = 'providers:getModelList',
  GetList = 'providers:getList',
  Get = 'providers:get',
  Create = 'providers:create',
  Update = 'providers:update',
  Delete = 'providers:delete',
  UpdateModels = 'providers:updateModels',
}

export enum AppChannel {
  GetFileInfo = 'app:GetFileInfo',
  GetInfo = 'app:getInfo',
  Toast = 'app:toast',
  SetTheme = 'app:setTheme',
  OpenPath = 'app:openPath',
  SetProxy = 'app:setProxy',
  SetLanguage = 'app:setlanguage',
  ShowOpenDialog = 'app:showOpenDialog',
  SaveSettings = 'app:saveSettings',
  InstasllRumtime = 'app:installRumtime',
  UninstallRumtime = 'app:uninstallRumtime',
  GetRuntimeInfo = 'app:getRuntimeInfo',
  SetApiServerPort = 'app:setApiServerPort',
  ToggleApiServerEnable = 'app:toggleApiServerEnable',
}

export enum MastraChannel {
  GetThreads = 'mastra:getThreads',
  GetThread = 'mastra:getThread',
  GetThreadMessages = 'mastra:getThreadMessages',
  CreateThread = 'mastra:createThread',
  UpdateThread = 'mastra:updateThread',
  DeleteThread = 'mastra:deleteThread',
  Chat = 'mastra:chat',
  ChatWorkflow = 'mastra:chatWorkflow',
  ChatAbort = 'mastra:chatAbort',
  SaveMessages = 'mastra:saveMessages',
  ClearMessages = 'mastra:clearMessages',
  GetUsage = 'mastra:getUsage',
  GetUsageSummary = 'mastra:getUsageSummary',
}

export enum KnowledgeBaseChannel {
  Create = 'knowledge-base:create',
  Update = 'knowledge-base:update',
  Delete = 'knowledge-base:delete',
  Get = 'knowledge-base:get',
  GetList = 'knowledge-base:getList',
}

export enum ToolChannel {
  SaveSkill = 'tool:saveSkill',
  ImportSkill = 'tool:importSkill',
  SaveMCPServer = 'tool:saveMCPServer',
  ReconnectMCP = 'tool:reconnectMCP',
  GetMcp = 'tool:getMcp',
  DeleteTool = 'tool:deleteTool',
  GetAvailableTools = 'tool:getAvailableTools',
  GetList = 'tool:getList',
  GetTool = 'tool:getTool',
  ToggleToolActive = 'tool:toggleToolActive',
  ExecuteTool = 'tool:executeTool',
  AbortTool = 'tool:abortTool',
  UpdateToolConfig = 'tool:updateToolConfig',
}

export enum LocalModelChannel {
  GetList = 'local-model:getList',
  DownloadModel = 'local-model:downloadModel',
  DeleteModel = 'local-model:deleteModel',
  SetDefaultModel = 'local-model:setDefaultModel',
}

export enum AgentChannel {
  GetAgent = 'agent:getAgent',
  GetList = 'agent:getList',
  SaveAgent = 'agent:saveAgent',
  ImportAgent = 'agent:importAgent',
  GetAvailableAgents = 'agent:getAvailableAgents',
  DeleteAgent = 'agent:deleteAgent',
  GetAgentConfig = 'agent:getAgentConfig',
}

export enum ProjectChannel {
  GetProject = 'project:getProject',
  GetList = 'project:getList',
  SaveProject = 'project:saveProject',
  DeleteProject = 'project:deleteProject',
  CreateThread = 'project:createThread',
}
