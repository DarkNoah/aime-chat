import React, { type ReactElement, useRef, useState } from 'react';
import { MessageSquarePlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu';

export type FileEditorSelection = {
  text: string;
  startLine?: number;
  endLine?: number;
};

const getPlainTextLineAt = (value: string, offset: number) => {
  let prefixEnd = offset;
  if (value[offset] === '\n' && value[offset - 1] === '\r') {
    prefixEnd -= 1;
  }
  return value.slice(0, prefixEnd).split(/\r\n|\r|\n/).length;
};

export function getPlainTextEditorSelection(
  value: string,
  anchor: number,
  head: number,
): FileEditorSelection | null {
  const from = Math.max(0, Math.min(anchor, head, value.length));
  const to = Math.max(0, Math.min(Math.max(anchor, head), value.length));
  if (from === to) return null;

  const text = value.slice(from, to);
  if (!text.trim()) return null;

  return {
    text,
    startLine: getPlainTextLineAt(value, from),
    endLine: getPlainTextLineAt(value, to - 1),
  };
}

export function getDomEditorSelection(
  container: HTMLElement | null,
  selection: Selection | null = document.getSelection(),
): FileEditorSelection | null {
  if (
    !container ||
    !selection ||
    selection.isCollapsed ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !container.contains(selection.anchorNode) ||
    !container.contains(selection.focusNode)
  ) {
    return null;
  }

  const text = selection.toString();
  return text.trim() ? { text } : null;
}

type FileSelectionContextMenuProps = {
  children: ReactElement;
  selection: FileEditorSelection | null;
  onAddToChat?: (selection: FileEditorSelection) => void;
};

export function FileSelectionContextMenu({
  children,
  selection,
  onAddToChat,
}: FileSelectionContextMenuProps) {
  const { t } = useTranslation();
  const selectionRef = useRef<FileEditorSelection | null>(selection);
  const [openSelection, setOpenSelection] =
    useState<FileEditorSelection | null>(null);

  if (selection) {
    selectionRef.current = selection;
  }

  const activeSelection = openSelection ?? selection;
  const enabled = Boolean(selection && onAddToChat);

  return (
    <ContextMenu
      onOpenChange={(open) => {
        setOpenSelection(open ? selectionRef.current : null);
      }}
    >
      <ContextMenuTrigger asChild disabled={!enabled}>
        {children}
      </ContextMenuTrigger>
      {activeSelection ? (
        <ContextMenuContent className="min-w-40">
          <ContextMenuItem
            onSelect={() => {
              if (activeSelection) onAddToChat?.(activeSelection);
            }}
          >
            <MessageSquarePlusIcon className="size-4" />
            {t('chat.add_to_chat')}
          </ContextMenuItem>
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
}
