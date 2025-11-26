import React, {
  ComponentProps,
  ForwardedRef,
  ReactNode,
  useMemo,
  useState,
} from 'react';
import { Badge } from '../../ui/badge';
import { cn } from '@/renderer/lib/utils';
import { ToolUIPart } from 'ai-v5';
import {
  CheckCircleIcon,
  CheckIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { AskUserQuestionMessage } from './ask-user-question-message';
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '../../ai-elements/confirmation';
import { TodoWriteMessage } from './todo-write-message';
import { WriteMessage } from './write-message';

export interface ToolMessageRef {}

export type ToolMessageProps = ComponentProps<typeof Badge> & {
  part?: ToolUIPart;
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

    const [toolName, setToolName] = useState<string>(
      title ?? part?.type?.split('-').slice(1).join('-'),
    );
    const state = useMemo(() => {
      setToolName(part?.type?.split('-').slice(1).join('-'));
      return part?.state === 'output-available' &&
        part?.output?.code === 'TOOL_EXECUTION_FAILED'
        ? 'output-error'
        : part?.state;
    }, [part?.state, part?.output?.code, part?.type]);

    const renderExtendContent = () => {
      if (toolName === 'AskUserQuestion') {
        return <AskUserQuestionMessage part={part} />;
      } else if (toolName === 'TodoWrite') {
        return <TodoWriteMessage part={part}></TodoWriteMessage>;
      } else if (toolName === 'Write') {
        return <WriteMessage part={part}></WriteMessage>;
      }
      return null;
    };

    const getDescription = () => {
      switch (toolName) {
        case 'Skill':
          return part?.input?.skill;
        case 'Read':
        case 'Write':
        case 'Edit':
          return part?.input?.file_path;
        case 'Glob':
        case 'Grep':
          return part?.input?.pattern;
        case 'TodoWrite':
          return part?.input?.todos?.length + ' todo';
        case 'KillBash':
        case 'BashOutput':
          return part?.input?.shell_id;

        default:
          return part?.input?.description;
      }
    };

    return (
      <div className="flex flex-col">
        <Badge
          variant="secondary"
          className={cn(
            'not-prose mb-4 border cursor-pointer items-center flex flex-row',
            className,
          )}
          {...rest}
        >
          {getStatusBadge(state)}
          <span className="font-medium text-sm">{toolName}</span>
          {part?.input && (
            <span className=" ml-1 text-xs text-muted-foreground truncate max-w-[300px] block">
              {getDescription()}
            </span>
          )}
        </Badge>

        {renderExtendContent()}
      </div>
    );
  },
);
