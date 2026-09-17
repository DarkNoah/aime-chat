/* eslint-disable no-void -- UI handlers explicitly discard handled promises. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  IconArrowLeft,
  IconArrowRight,
  IconPlus,
  IconReload,
  IconWorldWww,
  IconX,
  IconPlayerStop,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { cn } from '@/renderer/lib/utils';
import { ThreadBrowserChannel } from '@/types/thread-browser';
import type {
  ThreadBrowserAction,
  ThreadBrowserState,
} from '@/types/thread-browser';

export function ThreadBrowserPreview({
  threadId,
  active,
  request,
}: {
  threadId: string;
  active: boolean;
  request?: { threadId: string; url: string };
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ThreadBrowserState>({
    threadId,
    tabs: [],
    busy: false,
  });
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const ownerId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const tab = state.tabs.find((item) => item.id === state.selectedTabId);
  const api = window.electron?.browser;
  const visibleTabId = tab?.id;

  useEffect(() => {
    mounted.current = true;
    if (!api) return undefined;
    let revision = 0;
    const unsubscribe = window.electron.ipcRenderer.on(
      ThreadBrowserChannel.Changed,
      (value) => {
        const next = value as ThreadBrowserState;
        if (next.threadId !== threadId) return;
        revision += 1;
        setState(next);
      },
    );
    void api
      .state(threadId)
      .then((next) => {
        if (mounted.current && revision === 0) setState(next);
        return undefined;
      })
      .catch((reason) => {
        if (mounted.current) setError(String(reason));
      });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [api, threadId]);

  useEffect(() => {
    setAddress(tab?.url === 'about:blank' ? '' : (tab?.url ?? ''));
  }, [tab?.id, tab?.url]);

  const act = useCallback(
    async (
      action: ThreadBrowserAction['action'],
      tabId?: string,
      url?: string,
    ) => {
      if (!api) return;
      setError(undefined);
      setPending(true);
      try {
        await api.action({ threadId, action, tabId, url });
      } catch (reason) {
        if (mounted.current)
          setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [api, threadId],
  );

  useEffect(() => {
    if (!request || request.threadId !== threadId || !api) return undefined;
    let cancelled = false;
    void api
      .state(threadId)
      .then(async (current) => {
        if (cancelled) return undefined;
        const existing = current.tabs.find((item) => item.url === request.url);
        await act(existing ? 'select' : 'new', existing?.id, request.url);
        return undefined;
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [request, threadId, api, act]);

  useEffect(() => {
    if (!api || !surface.current) return undefined;
    const element = surface.current;
    const owner = ownerId.current;
    let frame = 0;
    let last = '';
    const update = () => {
      frame = 0;
      const bounds = element.getBoundingClientRect();
      // Native views sit above DOM portals. Check the actual popper content:
      // a hidden sidebar tooltip can still leave an empty wrapper in the layout.
      const covered = [
        ...document.querySelectorAll(
          '[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper] > *',
        ),
      ].some((node) => {
        const rect = node.getBoundingClientRect();
        if (
          !node.getClientRects().length ||
          rect.width <= 0 ||
          rect.height <= 0
        )
          return false;
        const style = window.getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse'
        )
          return false;
        // Keep modal protection even when the dialog itself is beside the page.
        // Radix popovers also use role="dialog", but only cover their own bounds.
        const modal =
          node.getAttribute('aria-modal') === 'true' ||
          (node.matches('[role="dialog"], [role="alertdialog"]') &&
            node.getAttribute('aria-modal') !== 'false' &&
            !node.closest('[data-radix-popper-content-wrapper]'));
        return (
          modal ||
          (rect.left < bounds.right &&
            rect.right > bounds.left &&
            rect.top < bounds.bottom &&
            rect.bottom > bounds.top)
        );
      });
      const visible =
        active &&
        !!visibleTabId &&
        !covered &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        document.visibilityState !== 'hidden';
      const input = {
        threadId,
        ownerId: owner,
        visible,
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      };
      const key = JSON.stringify(input);
      if (last === key) return;
      last = key;
      void api.present(input).catch((reason) => {
        if (mounted.current) setError(String(reason));
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    const overlays = new MutationObserver(schedule);
    overlays.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'style', 'class', 'hidden'],
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      overlays.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('visibilitychange', schedule);
      void api
        .present({ threadId, ownerId: owner, visible: false })
        .catch(() => undefined);
    };
  }, [active, api, threadId, visibleTabId]);

  const button = (
    label: string,
    icon: ReactNode,
    action: () => void,
    disabled = false,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={action}
    >
      {icon}
    </Button>
  );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex min-w-0 items-center gap-1 border-b bg-muted/40 px-1 pt-1">
        <div
          role="tablist"
          aria-label={t('browser.tabs')}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {state.tabs.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex max-w-52 shrink-0 items-center rounded-t-md',
                item.id === tab?.id ? 'bg-background' : 'hover:bg-muted',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={item.id === tab?.id}
                aria-controls={`browser-panel-${ownerId.current}`}
                className="flex min-w-0 items-center gap-2 px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`${item.id} · ${item.title || item.url}`}
                onClick={() => void act('select', item.id)}
              >
                <IconWorldWww className="size-3.5 shrink-0" />
                <span className="truncate">
                  {item.title ||
                    (item.url === 'about:blank'
                      ? t('browser.new_tab')
                      : item.url)}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {item.id}
                </span>
              </button>
              {button(
                t('browser.close_tab', { name: item.title || item.id }),
                <IconX className="size-3" />,
                () => void act('close', item.id),
              )}
            </div>
          ))}
        </div>
        {button(
          t('browser.new_tab'),
          <IconPlus className="size-4" />,
          () => void act('new'),
          !api || pending,
        )}
      </div>
      <form
        className="flex items-center gap-1 border-b p-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (address.trim())
            void act(tab ? 'navigate' : 'new', tab?.id, address);
        }}
      >
        {button(
          t('browser.back'),
          <IconArrowLeft className="size-4" />,
          () => void act('back', tab?.id),
          !tab?.canGoBack || pending,
        )}
        {button(
          t('browser.forward'),
          <IconArrowRight className="size-4" />,
          () => void act('forward', tab?.id),
          !tab?.canGoForward || pending,
        )}
        {button(
          tab?.loading ? t('browser.stop') : t('browser.reload'),
          tab?.loading ? (
            <IconPlayerStop className="size-4" />
          ) : (
            <IconReload className="size-4" />
          ),
          () => void act(tab?.loading ? 'stop' : 'reload', tab?.id),
          !tab,
        )}
        <Input
          aria-label={t('browser.address')}
          placeholder={t('browser.address_placeholder')}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="h-8 min-w-0 flex-1 text-xs"
          disabled={!api}
        />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={!address.trim() || pending || !api}
        >
          {t('browser.go')}
        </Button>
      </form>
      {state.busy && state.runningTabId && (
        <div
          role="status"
          className="flex items-center justify-between border-b px-3 py-1 text-xs"
        >
          <span>{t('browser.running', { tab: state.runningTabId })}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void act('stop', state.runningTabId)}
          >
            {t('browser.stop')}
          </Button>
        </div>
      )}
      {(error || tab?.error) && (
        <div
          role="alert"
          className="border-b px-3 py-2 text-xs text-destructive"
        >
          {error || tab?.error}
        </div>
      )}
      <div
        ref={surface}
        role="tabpanel"
        id={`browser-panel-${ownerId.current}`}
        className="relative min-h-0 flex-1"
      >
        {!tab && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
            <IconWorldWww className="size-7" />
            <p>{api ? t('browser.empty') : t('browser.restart')}</p>
            <Button
              variant="outline"
              onClick={() => void act('new')}
              disabled={!api || pending}
            >
              {t('browser.new_tab')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
