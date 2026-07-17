export const getToolMessageDescription = (toolName: string, input: any) => {
  switch (toolName) {
    case 'Skill':
      return input?.skill_id;
    case 'Read':
    case 'Write':
    case 'Edit':
      return input?.file_path;
    case 'Glob':
    case 'Grep':
      return input?.pattern;
    case 'TodoWrite':
      return `${input?.todos?.length} todo`;
    case 'KillBash':
    case 'BashOutput':
      return input?.shell_id;
    case 'SSHConnection':
      if (input?.connection_id) return input.connection_id;
      if (input?.target?.type === 'config') return input.target.name;
      if (input?.target?.type === 'direct') {
        return `${input.target.username ? `${input.target.username}@` : ''}${input.target.host}:${input.target.port ?? 22}`;
      }
      return input?.action;
    case 'SSHInput':
    case 'SSHOutput':
    case 'SSHTransfer':
      return input?.connection_id;
    case 'GenerateImage':
    case 'EditImage':
      return input?.prompt ?? '';
    case 'WebSearch':
      return input?.query;
    case 'WebFetch':
      return input?.url;
    case 'Extract':
      return input?.file_path_or_url;
    case 'RemoveBackground':
      return input?.file_path_or_url;
    case 'SpeechToText':
      return input?.source;
    case 'TextToSpeech':
      return input?.text;
    case 'TaskUpdate':
      return '#' + input?.taskId;
    case 'Vision':
      return input?.prompt;
    case 'LibSQLListTable':
    case 'LibSQLDatabaseInfo':
      return input?.scope;
    case 'LibSQLDescribeTable':
      return input?.table;
    case 'LibSQLRun':
      return input?.sql;
    case 'KnowledgeBaseSearch':
      return input?.query;
    case 'Message':
      return input?.data?.message;
    default:
      return input?.description;
  }
};
