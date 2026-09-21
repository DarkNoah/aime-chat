import { useEffect, useState } from 'react';
import { IconWorld } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  ThreadBrowserChannel,
  type ThreadBrowserState,
} from '@/types/thread-browser';
import { Button } from '../ui/button';
import './chat-browser-toggle.css';

/** Stays mounted above the chat input even while the preview is closed. */
export function ChatBrowserToggle({
  threadId,
  open,
  onToggle,
}: {
  threadId?: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState({ threadId, tabCount: 0 });
  const api = window.electron?.browser;

  useEffect(() => {
    if (!api || !threadId) return undefined;
    let cancelled = false;
    let revision = 0;
    const update = (state: ThreadBrowserState) => {
      if (cancelled || state.threadId !== threadId) return;
      const tabCount = state.tabs.length;
      setStatus((previous) =>
        previous.threadId === threadId && previous.tabCount === tabCount
          ? previous
          : { threadId, tabCount },
      );
    };
    const unsubscribe = window.electron.ipcRenderer.on(
      ThreadBrowserChannel.Changed,
      (value) => {
        const state = value as ThreadBrowserState;
        if (state.threadId !== threadId) return;
        revision += 1;
        update(state);
      },
    );
    // A newer tab event must win over an in-flight initial snapshot.
    api
      .state(threadId)
      .then((state) => {
        if (revision === 0) update(state);
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [api, threadId]);

  const tabCount = status.threadId === threadId ? status.tabCount : 0;
  if (!threadId || !api || tabCount === 0) return null;
  const label = t(
    open ? 'browser.hide_running_preview' : 'browser.show_running_preview',
    {
      count: tabCount,
    },
  );

  return (
    <Button
      type="button"
      variant={open ? 'secondary' : 'outline'}
      size="sm"
      className="chat-browser-toggle-enter h-7 gap-1.5 px-2 text-xs"
      data-slot="chat-browser-toggle"
      aria-label={label}
      aria-expanded={open}
      title={label}
      onClick={onToggle}
    >
      <IconWorld aria-hidden="true" className="size-3.5" />
      <span className="tabular-nums" data-slot="chat-browser-tab-count">
        {tabCount}
      </span>
    </Button>
  );
}
