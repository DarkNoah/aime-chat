import React, { ComponentProps, ForwardedRef, ReactNode, useMemo } from 'react';
import { Badge } from '../../ui/badge';
import { cn } from '@/renderer/lib/utils';
import { ToolUIPart } from 'ai';
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react';

export interface ToolMessageRef {}

export type ToolMessageProps = ComponentProps<typeof Badge> & {
  part: ToolUIPart;
  title?: string;
};

const getStatusBadge = (status: ToolUIPart['state']) => {
  const labels: Record<ToolUIPart['state'], string> = {
    'input-streaming': 'Pending',
    'input-available': 'Running',
    'approval-requested': 'Awaiting Approval',
    'approval-responded': 'Responded',
    'output-available': 'Completed',
    'output-error': 'Error',
    'output-denied': 'Denied',
  };

  const icons: Record<ToolUIPart['state'], ReactNode> = {
    'input-streaming': <CircleIcon className="size-4" />,
    'input-available': <ClockIcon className="size-4 animate-pulse" />,
    'approval-requested': <ClockIcon className="size-4 text-yellow-600" />,
    'approval-responded': <CheckCircleIcon className="size-4 text-blue-600" />,
    'output-available': <CheckCircleIcon className="size-4 text-green-600" />,
    'output-error': <XCircleIcon className="size-4 text-red-600" />,
    'output-denied': <XCircleIcon className="size-4 text-orange-600" />,
  };

  return (
    <>
      {icons[status]}
      {/* {labels[status]} */}
    </>
  );
};

export const ToolMessage = React.forwardRef<ToolMessageRef, ToolMessageProps>(
  (props: ToolMessageProps, ref: ForwardedRef<ToolMessageRef>) => {
    const { className, part, title, ...rest } = props;

    const state = useMemo(() => {
      return part?.state === 'output-available' &&
        part?.output?.code === 'TOOL_EXECUTION_FAILED'
        ? 'output-error'
        : part?.state;
    }, [part?.state, part?.output?.code]);
    return (
      <Badge
        variant="secondary"
        className={cn('not-prose mb-4 border cursor-pointer', className)}
        {...rest}
      >
        <WrenchIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">
          {title ?? part?.type?.split('-').slice(1).join('-')}
        </span>
        {getStatusBadge(state)}
      </Badge>
    );
  },
);
