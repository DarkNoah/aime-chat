import { createContext, memo, useContext, type ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import { cn } from '@/renderer/lib/utils';
import { eventBus } from '@/renderer/lib/event-bus';
import { getMarkdownFilePath } from './local-file-link';

type LinkProps = ComponentProps<'a'> & ExtraProps;

export const MarkdownLinkContext = createContext<{
  workspace?: string;
  threadId?: string;
}>({});

export const MarkdownLink = memo(
  ({
    children,
    className,
    href,
    node,
    onClick,
    onAuxClick,
    ...props
  }: LinkProps) => {
    const { threadId } = useContext(MarkdownLinkContext);
    const isIncomplete = href === 'streamdown:incomplete-link';
    const opensInBrowser = Boolean(
      threadId && href && /^https?:\/\//i.test(href),
    );
    const openBrowser = () => {
      eventBus.emit(`chat:onEvent:${threadId}`, {
        event: 'web_preview',
        data: { url: href },
      });
    };

    return (
      <a
        className={cn(
          'wrap-anywhere font-medium text-primary underline',
          className,
        )}
        data-incomplete={isIncomplete}
        data-streamdown="link"
        href={isIncomplete ? undefined : href}
        rel="noopener noreferrer"
        target="_blank"
        {...props}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && opensInBrowser) {
            event.preventDefault();
            openBrowser();
          }
        }}
        onAuxClick={(event) => {
          onAuxClick?.(event);
          if (!event.defaultPrevented && event.button === 1 && opensInBrowser) {
            event.preventDefault();
            openBrowser();
          }
        }}
      >
        {children}
      </a>
    );
  },
);
MarkdownLink.displayName = 'MarkdownLink';

export const MarkdownFileLink = memo(
  ({ href, children, onClick, ...props }: LinkProps) => {
    const { workspace } = useContext(MarkdownLinkContext);
    const filePath = getMarkdownFilePath(href, workspace);
    // Raw HTML can contain this custom tag too; validate it before rendering.
    if (!filePath) return <span>{children}</span>;

    return (
      <MarkdownLink
        {...props}
        href={href}
        onClick={(event) => {
          event.preventDefault();
          window.electron.app.openPath(filePath);
        }}
        onAuxClick={(event) => event.preventDefault()}
      >
        {children}
      </MarkdownLink>
    );
  },
);
MarkdownFileLink.displayName = 'MarkdownFileLink';
