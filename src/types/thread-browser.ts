export const ThreadBrowserChannel = {
  State: 'thread-browser:state',
  Action: 'thread-browser:action',
  Present: 'thread-browser:present',
  Changed: 'thread-browser:changed',
  Requested: 'thread-browser:requested',
} as const;

export interface BrowserTabState {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}

export interface ThreadBrowserState {
  threadId: string;
  tabs: BrowserTabState[];
  selectedTabId?: string;
  automationTabId?: string;
  runningTabId?: string;
  busy: boolean;
}

export type ThreadBrowserAction = {
  threadId: string;
  action:
    | 'new'
    | 'select'
    | 'close'
    | 'navigate'
    | 'back'
    | 'forward'
    | 'reload'
    | 'stop';
  tabId?: string;
  url?: string;
};

export interface BrowserPresentation {
  threadId: string;
  ownerId: string;
  visible: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}
