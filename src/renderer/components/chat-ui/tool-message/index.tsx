import React, {
  ComponentProps,
  ForwardedRef,
  ReactNode,
  useMemo,
  useState,
} from 'react';
import { Badge } from '../../ui/badge';
import { cn } from '@/renderer/lib/utils';
import { ToolUIPart } from 'ai';
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
import { Button } from '../../ui/button';
import { useTranslation } from 'react-i18next';

export interface ToolMessageRef {}

export type ToolMessageProps = ComponentProps<typeof Badge> & {
  part?: ToolUIPart;
  title?: string;
  isApprovalRequested?: boolean;
};

type ToolApproval = {
  toolName: string;
  args: Record<string, any>;
  type: 'approval';
  runId: string;
};

const getStatusBadge = (
  status: ToolUIPart['state'],
  isApprovalRequested: boolean,
) => {
  const icons: Record<
    ToolUIPart['state'] | 'approval-requested' | 'approval-responded',
    ReactNode
  > = {
    'input-streaming': <CircleIcon className="size-4" />,
    'input-available': <ClockIcon className="size-4 animate-pulse" />,
    'approval-requested': <ClockIcon className="size-4 text-yellow-600" />,
    'approval-responded': <CheckCircleIcon className="size-4 text-blue-600" />,
    'output-available': <CheckCircleIcon className="size-4 text-green-600" />,
    'output-error': <XCircleIcon className="size-4 text-red-600" />,
    'output-denied': <XCircleIcon className="size-4 text-orange-600" />,
  };

  if (isApprovalRequested === true) {
    return icons['approval-requested'];
  }
  return (
    <>
      {icons[status]}
      {/* {labels[status]} */}
    </>
  );
};

export const ToolMessage = React.forwardRef<ToolMessageRef, ToolMessageProps>(
  (props: ToolMessageProps, ref: ForwardedRef<ToolMessageRef>) => {
    const { className, part, title, isApprovalRequested, ...rest } = props;

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
          return `${part?.input?.todos?.length} todo`;
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
          {getStatusBadge(state, isApprovalRequested)}
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

export const ToolMessageApproval = ({
  approval,
  onReject,
  onAccept,
}: {
  approval?: ToolApproval;
  onReject?: (approval: ToolApproval) => void;
  onAccept?: (approval: ToolApproval) => void;
}) => {
  const { t } = useTranslation();
  return (
    <Confirmation
      approval={{ id: approval?.runId, approved: true }}
      state="approval-requested"
      className="w-fit"
    >
      <ConfirmationTitle>
        <ConfirmationRequest>
          This tool will execute a query on the production database.
        </ConfirmationRequest>
        <ConfirmationAccepted>
          <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
          <span>Accepted</span>
        </ConfirmationAccepted>
        <ConfirmationRejected>
          <XIcon className="size-4 text-destructive" />
          <span>Rejected</span>
        </ConfirmationRejected>
      </ConfirmationTitle>
      <ConfirmationActions>
        <ConfirmationAction
          onClick={() => {
            onReject?.(approval);
          }}
          variant="outline"
        >
          {t('common.reject')}
        </ConfirmationAction>
        <ConfirmationAction
          onClick={() => {
            onAccept?.(approval);
          }}
          variant="default"
        >
          {t('common.accept')}
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  );
};
