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
    default:
      return input?.description;
  }
};
