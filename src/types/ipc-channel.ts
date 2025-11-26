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
  GetInfo = 'app:getInfo',
  Send = 'app:send',
  SetTheme = 'app:setTheme',
  OpenPath = 'app:openPath',
  SetProxy = 'app:setProxy',
  SetLanguage = 'app:setlanguage',
  ShowOpenDialog = 'app:showOpenDialog',
  SaveSettings = 'app:saveSettings',
  InstasllRumtime = 'app:installRumtime',
  UninstallRumtime = 'app:uninstallRumtime',
  GetRuntimeInfo = 'app:getRuntimeInfo',
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
  ChatResume = 'mastra:chatResume',
  ChatAbort = 'mastra:chatAbort',
  SaveMessages = 'mastra:saveMessages',
}

export enum KnowledgeBaseChannel {
  Create = 'knowledge-base:create',
  Update = 'knowledge-base:update',
  Delete = 'knowledge-base:delete',
  Get = 'knowledge-base:get',
  GetList = 'knowledge-base:getList',
}

export enum ToolChannel {
  ImportMCP = 'tool:importMcp',
  GetMcp = 'tool:getMcp',
  DeleteTool = 'tool:deleteTool',
  GetAvailableTools = 'tool:getAvailableTools',
  GetList = 'tool:getList',
  GetTool = 'tool:getTool',
  ToggleToolActive = 'tool:toggleToolActive',
  ExecuteTool = 'tool:executeTool',
  AbortTool = 'tool:abortTool',
}
