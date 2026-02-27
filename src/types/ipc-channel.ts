export enum InstancesChannel {
  GetInstances = 'instances:getInstances',
  UpdateInstance = 'instances:updateInstance',
  DeleteInstance = 'instances:deleteInstance',
  CreateInstance = 'instances:createInstance',
  GetInstance = 'instances:getInstance',
  RunInstance = 'instances:runInstance',
  StopInstance = 'instances:stopInstance',
  DetectBrowserProfiles = 'instances:detectBrowserProfiles',
}

export enum ProviderChannel {
  GetProviderTypeList = 'providers:getProviderTypeList',
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
  // 更新相关
  CheckForUpdates = 'app:checkForUpdates',
  DownloadUpdate = 'app:downloadUpdate',
  InstallUpdate = 'app:installUpdate',
  GetUpdateStatus = 'app:getUpdateStatus',
  // 更新事件
  UpdateAvailable = 'app:updateAvailable',
  UpdateNotAvailable = 'app:updateNotAvailable',
  UpdateDownloadProgress = 'app:updateDownloadProgress',
  UpdateDownloaded = 'app:updateDownloaded',
  UpdateError = 'app:updateError',
  Translation = 'app:translation',
  // Setup 相关
  GetSetupStatus = 'app:getSetupStatus',
  CompleteSetup = 'app:completeSetup',
  // 文件系统
  GetDirectoryTree = 'app:getDirectoryTree',
  GetDirectoryChildren = 'app:getDirectoryChildren',
  SearchInDirectory = 'app:searchInDirectory',
  ReadFileContent = 'app:readFileContent',
  // 屏幕截图
  ScreenCapture = 'app:screenCapture',
  GetScreenSources = 'app:getScreenSources',
  ScreenCaptureSelect = 'app:screenCaptureSelect',
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
  ImportSource = 'knowledge-base:importSource',
  GetKnowledgeBaseItems = 'knowledge-base:getKnowledgeBaseItems',
  DeleteKnowledgeBaseItem = 'knowledge-base:deleteKnowledgeBaseItem',
  SearchKnowledgeBase = 'knowledge-base:searchKnowledgeBase',
}

export enum ToolChannel {
  SaveSkill = 'tool:saveSkill',
  ImportSkill = 'tool:importSkill',
  ImportSkills = 'tool:importSkills',
  PreviewGitSkill = 'tool:previewGitSkill',
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
  SearchSkills = 'tool:searchSkills',
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
  DeleteSkill = 'project:deleteSkill',
}

export enum TaskQueueChannel {
  Add = 'task-queue:add',
  Pause = 'task-queue:pause',
  Resume = 'task-queue:resume',
  Cancel = 'task-queue:cancel',
  Remove = 'task-queue:remove',
  GetAll = 'task-queue:getAll',
  GetByGroup = 'task-queue:getByGroup',
  GetGroupConfigs = 'task-queue:getGroupConfigs',
  SetGroupConcurrency = 'task-queue:setGroupConcurrency',
  ClearCompleted = 'task-queue:clearCompleted',
  // 事件通道 (main -> renderer)
  TaskUpdated = 'task-queue:taskUpdated',
  TaskAdded = 'task-queue:taskAdded',
  TaskRemoved = 'task-queue:taskRemoved',
}
