import { ToolUIPart } from 'ai';
import React, {
  ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import { Card } from '../../ui/card';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { subscribeToInteractiveHtmlMessages } from './interactive-html-message-bridge';

export const INTERACTIVE_HTML_MESSAGE_SOURCE = 'aime-chat:interactive-html';
export const INTERACTIVE_HTML_RESUME_MESSAGE = 'resume';
export const INTERACTIVE_HTML_RESIZE_MESSAGE = 'resize';
export const INTERACTIVE_HTML_ERROR_MESSAGE = 'error';

const MIN_FRAME_HEIGHT = 80;
const MAX_FRAME_HEIGHT = 720;
const DEFAULT_FRAME_HEIGHT = 160;

const INTERACTIVE_HTML_BOOTSTRAP = `(() => {
  const source = '${INTERACTIVE_HTML_MESSAGE_SOURCE}';
  const send = (type, payload = {}) => {
    window.parent.postMessage({ source, type, ...payload }, '*');
  };

  const reportError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    send('${INTERACTIVE_HTML_ERROR_MESSAGE}', { message });
  };

  const appendValue = (result, key, value) => {
    const normalizedValue = value instanceof File
      ? { name: value.name, size: value.size, type: value.type, lastModified: value.lastModified }
      : value;
    if (!(key in result)) {
      result[key] = normalizedValue;
    } else if (Array.isArray(result[key])) {
      result[key].push(normalizedValue);
    } else {
      result[key] = [result[key], normalizedValue];
    }
  };

  const getFormValues = (element) => {
    const form = element instanceof HTMLFormElement ? element : element.closest('form');
    if (!form) return {};
    const result = {};
    new FormData(form).forEach((value, key) => appendValue(result, key, value));
    return result;
  };

  const getDeclaredValues = (element) => {
    const value = element.getAttribute('data-aime-resume')?.trim();
    if (!value) return {};
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('data-aime-resume must contain a JSON object.');
    }
    return parsed;
  };

  const resume = (resumeData) => {
    if (!resumeData || typeof resumeData !== 'object' || Array.isArray(resumeData)) {
      reportError('resumeData must be an object.');
      return;
    }
    send('${INTERACTIVE_HTML_RESUME_MESSAGE}', { resumeData });
  };

  Object.defineProperty(window, 'aimeChat', {
    value: Object.freeze({ resume }),
    configurable: false,
    writable: false,
  });

  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element
      ? event.target.closest('a[href]')
      : null;
    if (anchor) event.preventDefault();

    const target = event.target instanceof Element
      ? event.target.closest('[data-aime-resume]')
      : null;
    if (!target || target instanceof HTMLFormElement || target.hasAttribute('disabled')) return;
    event.preventDefault();
    try {
      resume({ ...getFormValues(target), ...getDeclaredValues(target) });
    } catch (error) {
      reportError(error);
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target instanceof HTMLFormElement) event.preventDefault();
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-aime-resume')) return;
    try {
      resume({ ...getFormValues(form), ...getDeclaredValues(form) });
    } catch (error) {
      reportError(error);
    }
  });

  const reportHeight = () => {
    const height = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0,
    );
    send('${INTERACTIVE_HTML_RESIZE_MESSAGE}', { height });
  };

  window.addEventListener('error', (event) => reportError(event.message || 'Interactive HTML error.'));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
  window.addEventListener('DOMContentLoaded', reportHeight);
  window.addEventListener('load', reportHeight);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(reportHeight).observe(document.documentElement);
  }
})();`;

export const buildInteractiveHtmlDocument = (html: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; child-src 'none'; frame-src 'none'; font-src data:; form-action 'none'; img-src data: blob:; media-src data: blob:; navigate-to 'none'; object-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; worker-src 'none'" />
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-width: 0; background: transparent; }
      body { padding: 12px; color: CanvasText; overflow-wrap: anywhere; }
      button, input, select, textarea { font: inherit; }
    </style>
    <script>${INTERACTIVE_HTML_BOOTSTRAP}</script>
  </head>
  <body>${html}</body>
</html>`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeResumeData = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (!isRecord(value)) return undefined;
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    return isRecord(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
};

export type InteractiveHtmlMessageProps = Omit<
  ComponentProps<typeof Card>,
  'part'
> & {
  part: ToolUIPart;
  suspendedData?: { runId: string };
  onResume?: (resumeData: Record<string, unknown>) => void;
};

export const InteractiveHtmlMessage = ({
  className,
  part,
  suspendedData,
  onResume,
  ...rest
}: InteractiveHtmlMessageProps) => {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onResumeRef = useRef(onResume);
  const canResumeRef = useRef(false);
  const hasResumedRef = useRef(false);
  const [height, setHeight] = useState(DEFAULT_FRAME_HEIGHT);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<{ message?: string }>();

  const input = isRecord(part.input) ? part.input : undefined;
  const html = typeof input?.html === 'string' ? input.html : '';
  const tips = typeof input?.tips === 'string' ? input.tips.trim() : '';
  const srcDoc = useMemo(() => buildInteractiveHtmlDocument(html), [html]);
  const canResume =
    part.state === 'input-available' &&
    Boolean(suspendedData?.runId) &&
    Boolean(onResume) &&
    !submitted;
  const isReadOnly = submitted || part.state !== 'input-available';

  onResumeRef.current = onResume;
  canResumeRef.current = canResume;

  const handleMessage = useCallback((event: MessageEvent) => {

    if (
      event.source !== iframeRef.current?.contentWindow ||
      !isRecord(event.data)
    ) {
      return;
    }
    if (event.data.source !== INTERACTIVE_HTML_MESSAGE_SOURCE) return;

    if (
      event.data.type === INTERACTIVE_HTML_RESIZE_MESSAGE &&
      typeof event.data.height === 'number' &&
      Number.isFinite(event.data.height)
    ) {
      setHeight(
        Math.min(
          MAX_FRAME_HEIGHT,
          Math.max(MIN_FRAME_HEIGHT, event.data.height),
        ),
      );
      return;
    }

    if (event.data.type === INTERACTIVE_HTML_ERROR_MESSAGE) {
      setError({
        message:
          typeof event.data.message === 'string'
            ? event.data.message
            : undefined,
      });
      return;
    }

    if (
      event.data.type !== INTERACTIVE_HTML_RESUME_MESSAGE ||
      !canResumeRef.current ||
      hasResumedRef.current
    ) {
      return;
    }

    const resumeData = normalizeResumeData(event.data.resumeData);
    if (!resumeData) {
      setError({});
      return;
    }

    hasResumedRef.current = true;
    setSubmitted(true);
    setError(undefined);
    onResumeRef.current?.(resumeData);
  }, []);

  useEffect(
    () => subscribeToInteractiveHtmlMessages(handleMessage),
    [handleMessage],
  );

  if (!html || part.state === 'input-streaming') return null;

  return (
    <Card
      className={cn(
        'w-full max-w-3xl overflow-hidden bg-secondary/30 py-0 gap-0',
        className,
      )}
      {...rest}
    >
      {tips && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/5 text-amber-950 dark:text-amber-100">
          <Lightbulb />
          <AlertTitle>{t('tools.interactive_html_tips')}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap text-current/80">
            {tips}
          </AlertDescription>
        </Alert>
      )}
      <iframe
        ref={iframeRef}
        title={t('tools.interactive_html_title')}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        className={cn(
          'block w-full border-0 bg-transparent transition-opacity',
          isReadOnly && 'pointer-events-none opacity-70',
        )}
        style={{ height }}
      />
      {(submitted || part.state === 'output-available') && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {t('tools.interactive_html_submitted')}
        </div>
      )}
      {error && (
        <div className="border-t border-destructive/30 px-3 py-2 text-xs text-destructive">
          {t('tools.interactive_html_error', {
            error:
              error.message || t('tools.interactive_html_invalid_resume_data'),
          })}
        </div>
      )}
    </Card>
  );
};
