import React, { ForwardedRef, useImperativeHandle } from 'react';
import {
  PromptInputAttachment,
  PromptInputAttachments,
  usePromptInputAttachments,
} from '../ai-elements/prompt-input';

export interface ChatInputAttachmentProps {}

export interface ChatInputAttachmentRef {
  clear: () => void;
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  openFileDialog: () => void;
  screenCapture: () => void;
}

export const ChatInputAttachment = React.forwardRef(
  (
    props: ChatInputAttachmentProps,
    ref: ForwardedRef<ChatInputAttachmentRef>,
  ) => {
    const attachments = usePromptInputAttachments();

    useImperativeHandle(ref, () => ({
      clear: () => {
        attachments.clear();
      },
      add: (files: File[] | FileList) => {
        attachments.add(files);
      },
      remove: (id: string) => {
        attachments.remove(id);
      },
      openFileDialog: () => {
        attachments.openFileDialog();
      },
      screenCapture: () => {
        attachments.screenCapture();
      },
    }));

    return (
      <PromptInputAttachments>
        {(attachment) => <PromptInputAttachment data={attachment} />}
      </PromptInputAttachments>
    );
  },
);
