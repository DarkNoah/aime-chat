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
}

export enum MastraChannel {
  GetThreads = 'mastra:getThreads',
  GetThread = 'mastra:getThread',
  GetThreadMessages = 'mastra:getThreadMessages',
  CreateThread = 'mastra:createThread',
  UpdateThread = 'mastra:updateThread',
  DeleteThread = 'mastra:deleteThread',
  Chat = 'mastra:chat',
  ChatAbort = 'mastra:chatAbort',
}

export enum KnowledgeBaseChannel {
  Create = 'knowledge-base:create',
  Update = 'knowledge-base:update',
  Delete = 'knowledge-base:delete',
  Get = 'knowledge-base:get',
  GetList = 'knowledge-base:getList',
}

export enum ToolChannel {
  ImportMCP = 'tool:import-mcp',
}
