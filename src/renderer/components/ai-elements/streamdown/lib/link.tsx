import { memo, type ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import { cn } from '@/renderer/lib/utils';
import { getMarkdownFilePath } from './local-file-link';

type LinkProps = ComponentProps<'a'> & ExtraProps;

export const MarkdownLink = memo(
  ({ children, className, href, node, ...props }: LinkProps) => {
    const isIncomplete = href === 'streamdown:incomplete-link';

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
      >
        {children}
      </a>
    );
  },
);
MarkdownLink.displayName = 'MarkdownLink';

export const MarkdownFileLink = memo(
  ({ href, children, onClick, ...props }: LinkProps) => {
    const filePath = getMarkdownFilePath(href);
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
