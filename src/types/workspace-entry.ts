export type WorkspaceEntryAction =
  | 'create-file'
  | 'create-directory'
  | 'rename'
  | 'delete';

export type WorkspaceEntryOperation = {
  workspace: string;
  path: string;
  action: WorkspaceEntryAction;
  name?: string;
  /** Initial UTF-8 content, only used by create-file. */
  content?: string;
};
