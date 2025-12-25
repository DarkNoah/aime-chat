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
  CircleQuestionMark,
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
import { TaskMessage } from './task-message';

export type ToolSuspended = {
  toolName: string;
  toolCallId: string;
  suspendPayload: Record<string, any>;
  type: 'suspended';
  runId: string;
};

export interface ToolMessageRef {}

export type ToolMessageProps = ComponentProps<typeof Badge> & {
  part?: ToolUIPart;
  title?: string;
  isSuspended?: boolean;
  suspendedData?: ToolSuspended;
  onResume?: (resumeData: Record<string, any>) => void;
};

export type ToolApproval = {
  toolName: string;
  args: Record<string, any>;
  type: 'approval';
  runId: string;
};

const getStatusBadge = (part: ToolUIPart, isSuspended: boolean) => {
  const icons: Record<
    | ToolUIPart['state']
    | 'approval-requested'
    | 'approval-responded'
    | 'output-denied',
    ReactNode
  > = {
    'input-streaming': <CircleIcon className="size-4" />,
    'input-available': <ClockIcon className="size-4 animate-pulse" />,
    'approval-requested': (
      <CircleQuestionMark className="size-4 text-yellow-600 animate-pulse" />
    ),
    'approval-responded': <CheckCircleIcon className="size-4 text-blue-600" />,
    'output-available': <CheckCircleIcon className="size-4 text-green-600" />,
    'output-error': <XCircleIcon className="size-4 text-red-600" />,
    'output-denied': <XCircleIcon className="size-4 text-orange-600" />,
  };
  if (
    part?.state === 'output-available' &&
    part?.output?.code === 'TOOL_EXECUTION_FAILED'
  ) {
    return icons['output-error'];
  }
  if (part.output === 'Tool call was not approved by the user') {
    return icons['output-denied'];
  }
  if (isSuspended === true) {
    return icons['approval-requested'];
  }

  return (
    <>
      {icons[part?.state]}
      {/* {labels[status]} */}
    </>
  );
};

export const ToolMessage = React.forwardRef<ToolMessageRef, ToolMessageProps>(
  (props: ToolMessageProps, ref: ForwardedRef<ToolMessageRef>) => {
    const {
      className,
      part,
      title,
      isSuspended,
      suspendedData,
      onResume,
      ...rest
    } = props;

    const [toolName, setToolName] = useState<string>(
      title ?? part?.type?.split('-').slice(1).join('-'),
    );
    // const state = useMemo(() => {
    //   setToolName(part?.type?.split('-').slice(1).join('-'));
    //   return part?.state === 'output-available' &&
    //     part?.output?.code === 'TOOL_EXECUTION_FAILED'
    //     ? 'output-error'
    //     : part?.state;
    // }, [part?.state, part?.output?.code, part?.type]);

    const renderExtendContent = () => {
      if (toolName === 'AskUserQuestion' && part?.state === 'input-available') {
        return (
          <AskUserQuestionMessage
            part={part}
            suspendedData={suspendedData}
            onResume={onResume}
          />
        );
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
          {getStatusBadge(part, isSuspended)}
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
          {t('tools.approval_description')}
        </ConfirmationRequest>
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
