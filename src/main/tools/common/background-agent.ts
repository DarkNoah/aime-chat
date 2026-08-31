import {
  AgentSessionMessage,
  AgentSessionStatus,
  AgentSessionUpdate,
} from '@/types/chat';

export type BackgroundAgentSessionInput = {
  threadId?: string;
  resourceId?: string;
  sessionId: string;
  subagentThreadId: string;
  description: string;
  prompt: string;
  subagentType: string;
};

export type BackgroundAgentCompletion = BackgroundAgentSessionInput & {
  status: Exclude<AgentSessionStatus, 'running'>;
  result?: string;
  errorMessage?: string;
  startTime: string;
  finishedAt: string;
};

export type BackgroundAgentCompletedListener = (
  completion: BackgroundAgentCompletion,
) => void | Promise<void>;

export type BackgroundAgentUpdatedListener = (
  update: AgentSessionUpdate,
) => void | Promise<void>;

type BackgroundAgentSession = BackgroundAgentSessionInput & {
  abortController: AbortController;
  status: AgentSessionStatus;
  result?: string;
  errorMessage?: string;
  startTime: string;
  updatedAt: string;
};

export class BackgroundAgentManager {
  private sessions = new Map<string, BackgroundAgentSession>();

  private completedListeners = new Set<BackgroundAgentCompletedListener>();

  private updatedListeners = new Set<BackgroundAgentUpdatedListener>();

  onSessionCompleted(listener: BackgroundAgentCompletedListener) {
    this.completedListeners.add(listener);
    return () => this.completedListeners.delete(listener);
  }

  onSessionUpdated(listener: BackgroundAgentUpdatedListener) {
    this.updatedListeners.add(listener);
    return () => this.updatedListeners.delete(listener);
  }

  start(input: BackgroundAgentSessionInput) {
    const now = new Date().toISOString();
    const session: BackgroundAgentSession = {
      ...input,
      abortController: new AbortController(),
      status: 'running',
      startTime: now,
      updatedAt: now,
    };
    this.sessions.set(input.sessionId, session);
    this.emit(session, 'started');
    return session.abortController.signal;
  }

  appendMessage(sessionId: string, message: AgentSessionMessage) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return;
    session.updatedAt = new Date().toISOString();
    this.emit(session, 'message', { message });
  }

  complete(
    sessionId: string,
    completion: {
      status: Exclude<AgentSessionStatus, 'running'>;
      result?: string;
      errorMessage?: string;
    },
  ) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return;

    session.status = completion.status;
    session.result = completion.result;
    session.errorMessage = completion.errorMessage;
    session.updatedAt = new Date().toISOString();

    if (completion.errorMessage) {
      this.emit(session, 'error');
    }
    this.emit(session, 'exited');

    const completed: BackgroundAgentCompletion = {
      threadId: session.threadId,
      resourceId: session.resourceId,
      sessionId: session.sessionId,
      subagentThreadId: session.subagentThreadId,
      description: session.description,
      prompt: session.prompt,
      subagentType: session.subagentType,
      status: session.status as Exclude<AgentSessionStatus, 'running'>,
      result: session.result,
      errorMessage: session.errorMessage,
      startTime: session.startTime,
      finishedAt: session.updatedAt,
    };

    for (const listener of this.completedListeners) {
      try {
        Promise.resolve(listener(completed)).catch((error) => {
          // eslint-disable-next-line no-console
          console.error('background agent completion listener failed', error);
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('background agent completion listener failed', error);
      }
    }
  }

  kill(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return false;
    session.abortController.abort();
    return true;
  }

  private emit(
    session: BackgroundAgentSession,
    event: AgentSessionUpdate['event'],
    patch: Partial<AgentSessionUpdate> = {},
  ) {
    const update = {
      event,
      threadId: session.threadId,
      resourceId: session.resourceId,
      sessionId: session.sessionId,
      subagentThreadId: session.subagentThreadId,
      description: session.description,
      prompt: session.prompt,
      subagentType: session.subagentType,
      result: session.result,
      errorMessage: session.errorMessage,
      status: session.status,
      isExited: session.status !== 'running',
      startTime: session.startTime,
      updatedAt: session.updatedAt,
      ...patch,
    } satisfies AgentSessionUpdate;

    for (const listener of this.updatedListeners) {
      try {
        Promise.resolve(listener(update)).catch((error) => {
          // eslint-disable-next-line no-console
          console.error('background agent update listener failed', error);
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('background agent update listener failed', error);
      }
    }
  }
}

const backgroundAgentManager = new BackgroundAgentManager();

export default backgroundAgentManager;
