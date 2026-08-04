import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type EditorState,
  type LexicalEditor,
} from 'lexical';
import {
  $createBeautifulMentionNode,
  $isBeautifulMentionNode,
  BeautifulMentionsPlugin,
  type BeautifulMentionComponentProps,
  type BeautifulMentionsItem,
  type BeautifulMentionsItemData,
  type BeautifulMentionsMenuItemProps,
  type BeautifulMentionsMenuProps,
  createBeautifulMentionNode,
} from 'lexical-beautiful-mentions';
import {
  Children,
  type ClipboardEvent,
  type ComponentProps,
  type DragEvent,
  type ForwardedRef,
  Fragment,
  type KeyboardEvent,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CommandIcon, FileIcon, FolderIcon, SparklesIcon } from 'lucide-react';
import { FileInfo } from '@/types/common';
import {
  getChatFileReferenceDragData,
  getFilePathsFromUriList,
  getFileReferenceName,
  getPlainTextPathCandidate,
  type ChatFileReference,
} from '@/renderer/lib/chat-file-reference';
import { cn } from '@/renderer/lib/utils';
import {
  findInstantSlashItem,
  findMatchingSkillSlashItem,
  type PromptInputSlashItem,
} from './prompt-input-slash-items';

type ComposerMentionData = Record<string, BeautifulMentionsItemData> & {
  displayLabel: string;
  description: string;
  instant: boolean;
  mentionKind: 'command' | 'skill' | 'file' | 'directory';
  sourcePath: string;
};

function toSlashMentionData(item: PromptInputSlashItem): ComposerMentionData {
  return {
    displayLabel: item.label,
    description: item.description ?? '',
    instant: item.instant === true,
    mentionKind: item.group === 'skills' ? 'skill' : 'command',
    sourcePath: '',
  };
}

function toFileMentionData(reference: ChatFileReference): ComposerMentionData {
  return {
    displayLabel: getFileReferenceName(reference.name || reference.sourcePath),
    description: reference.sourcePath,
    instant: false,
    mentionKind: reference.kind,
    sourcePath: reference.sourcePath,
  };
}

function getTransferredFiles(dataTransfer: DataTransfer): File[] {
  const directFiles = Array.from(dataTransfer.files ?? []);
  if (directFiles.length > 0) {
    return directFiles;
  }

  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

async function resolveTransferredFileReferences(
  files: File[],
): Promise<ChatFileReference[]> {
  return Promise.all(
    files.map(async (file) => {
      const path = window.electron.app.getPathForFile(file);
      let info: FileInfo | undefined;
      try {
        info = await window.electron.app.getFileInfo(path);
      } catch {
        info = undefined;
      }
      const sourcePath = info?.path || path;
      return {
        serializedPath: `'${sourcePath}'`,
        sourcePath,
        name: getFileReferenceName(info?.name || file.name || sourcePath),
        kind: info?.isFile === false ? 'directory' : 'file',
      };
    }),
  );
}

async function resolveUriFileReferences(
  paths: string[],
): Promise<ChatFileReference[]> {
  const references = await Promise.all(
    paths.map(async (path) => {
      try {
        const info = await window.electron.app.getFileInfo(path);
        if (!info.isExist) {
          return undefined;
        }
        const sourcePath = info.path || path;
        const kind: ChatFileReference['kind'] =
          info.isFile === false ? 'directory' : 'file';
        return {
          serializedPath: `'${sourcePath}'`,
          sourcePath,
          name: getFileReferenceName(info.name || sourcePath),
          kind,
        };
      } catch {
        return undefined;
      }
    }),
  );

  return references.filter((reference): reference is ChatFileReference =>
    Boolean(reference),
  );
}

function appendPlainText(
  text: string,
  paragraph: ReturnType<typeof $createParagraphNode>,
) {
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      paragraph.append($createLineBreakNode());
    }
    if (line) {
      paragraph.append($createTextNode(line));
    }
  });
}

function replaceEditorText(
  value: string,
  slashItems: PromptInputSlashItem[],
  selectEnd = true,
) {
  const root = $getRoot();
  const paragraph = $createParagraphNode();
  const matchedSkill = findMatchingSkillSlashItem(value, slashItems);

  if (matchedSkill) {
    paragraph.append(
      $createBeautifulMentionNode(
        '/',
        matchedSkill.id,
        toSlashMentionData(matchedSkill),
      ),
    );
    appendPlainText(value.slice(matchedSkill.id.length + 1), paragraph);
  } else {
    appendPlainText(value, paragraph);
  }

  root.clear().append(paragraph);
  if (selectEnd) {
    paragraph.selectEnd();
  }
}

function ComposerMentionComponent(
  {
    trigger,
    value,
    data,
    className,
    children: _children,
    description: _description,
    displayLabel: _displayLabel,
    instant: _instant,
    mentionKind: _mentionKind,
    sourcePath: _sourcePath,
    ...props
  }: BeautifulMentionComponentProps<ComposerMentionData>,
  ref: ForwardedRef<HTMLSpanElement>,
) {
  const displayLabel = data?.displayLabel || value;
  const isSkill = data?.mentionKind === 'skill';
  const isDirectory = data?.mentionKind === 'directory';
  const isFileReference = isDirectory || data?.mentionKind === 'file';
  const fileReferenceType = isDirectory ? 'Folder' : 'File';
  let mentionClassName = className;
  let mentionTitle: string | undefined;

  if (isFileReference) {
    mentionClassName = cn(
      'mx-0.5 inline-flex max-w-64 cursor-default items-center gap-1 rounded-md border bg-muted/70 px-1.5 py-0.5 align-baseline font-medium leading-none text-foreground',
      'selection:bg-accent',
      className,
    );
    mentionTitle = data?.sourcePath || value;
  } else if (isSkill) {
    mentionClassName = cn(
      'mx-0.5 inline-flex max-w-full cursor-default items-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 align-baseline font-medium text-primary leading-none',
      'selection:bg-primary/20',
      className,
    );
    mentionTitle = data?.description || `${trigger}${value}`;
  }

  return (
    <span
      {...props}
      ref={ref}
      aria-label={
        isFileReference
          ? `${fileReferenceType} ${displayLabel}`
          : `${trigger}${displayLabel}`
      }
      data-file-reference={isFileReference ? data?.sourcePath : undefined}
      className={mentionClassName}
      title={mentionTitle}
    >
      {isFileReference ? (
        <>
          {isDirectory ? (
            <FolderIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-amber-500"
            />
          ) : (
            <FileIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          <span className="truncate">{displayLabel}</span>
        </>
      ) : (
        <>
          {trigger}
          {displayLabel}
        </>
      )}
    </span>
  );
}

const ComposerMentionNodeComponent = forwardRef(ComposerMentionComponent);
const SLASH_MENTION_NODES = createBeautifulMentionNode(
  ComposerMentionNodeComponent,
);

type SlashMentionMenuItemInternalProps = BeautifulMentionsMenuItemProps &
  Partial<ComposerMentionData>;

const SLASH_MENTION_GROUPS = [
  { kind: 'command', label: '常用' },
  { kind: 'skill', label: 'Skills' },
] as const;

export const SlashMentionMenu = forwardRef<
  HTMLUListElement,
  BeautifulMentionsMenuProps
>(({ loading, className, children, ...props }, ref) => {
  const menuItems = Children.toArray(children);
  const groupedItems = SLASH_MENTION_GROUPS.map((group) => ({
    ...group,
    items: menuItems.filter(
      (child) =>
        isValidElement<SlashMentionMenuItemInternalProps>(child) &&
        child.props.item.data?.mentionKind === group.kind,
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <ul
      {...props}
      ref={ref}
      className={cn(
        'absolute bottom-full left-0 z-50 m-0 mb-2 max-h-72 w-[320px] list-none overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className,
      )}
    >
      {groupedItems.map((group, index) => (
        <Fragment key={group.kind}>
          <li
            role="presentation"
            className={cn(
              'px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground',
              index > 0 && 'mt-1 border-t pt-2',
            )}
          >
            {group.label}
          </li>
          {group.items}
        </Fragment>
      ))}
      {loading ? (
        <li className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</li>
      ) : null}
    </ul>
  );
});
SlashMentionMenu.displayName = 'SlashMentionMenu';

export const SlashMentionMenuItem = forwardRef<
  HTMLLIElement,
  SlashMentionMenuItemInternalProps
>(
  (
    {
      selected,
      item,
      className,
      children: _children,
      label: _label,
      itemValue: _itemValue,
      displayLabel: _displayLabel,
      description: _description,
      instant: _instant,
      mentionKind: _mentionKind,
      sourcePath: _sourcePath,
      ...props
    },
    ref,
  ) => {
    const displayLabel = String(item.data?.displayLabel || item.value);
    const description = String(item.data?.description || '');
    const isSkill = item.data?.mentionKind === 'skill';

    return (
      <li
        {...props}
        ref={ref}
        className={cn(
          'relative flex cursor-pointer select-none items-start gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
          selected && 'bg-accent text-accent-foreground',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground',
            isSkill && 'text-primary',
          )}
        >
          {isSkill ? (
            <SparklesIcon className="size-3.5" />
          ) : (
            <CommandIcon className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">/{displayLabel}</span>
          {description ? (
            <span className="block truncate text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </li>
    );
  },
);
SlashMentionMenuItem.displayName = 'SlashMentionMenuItem';

type ComposerInserters = {
  insertLineBreak: () => void;
  insertText: (text: string) => void;
  insertFileReferences: (references: ChatFileReference[]) => void;
};

function RegisterComposerInsertersPlugin({
  register,
  registerTextInserter,
  registerFileReferenceInserter,
}: {
  register: (inserters: ComposerInserters | null) => void;
  registerTextInserter?: (insertText: ((text: string) => void) | null) => void;
  registerFileReferenceInserter?: (
    insertFileReferences: ((references: ChatFileReference[]) => void) | null,
  ) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const insertLineBreak = () => {
      editor.update(() => {
        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          $getRoot().selectEnd();
          selection = $getSelection();
        }
        if ($isRangeSelection(selection)) {
          selection.insertNodes([$createLineBreakNode()]);
        }
      });
      editor.focus();
    };
    const insertText = (text: string) => {
      editor.update(() => {
        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          $getRoot().selectEnd();
          selection = $getSelection();
        }
        if ($isRangeSelection(selection)) {
          selection.insertRawText(text);
        }
      });
      editor.focus();
    };
    const insertFileReferences = (references: ChatFileReference[]) => {
      if (references.length === 0) {
        return;
      }

      editor.update(() => {
        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          $getRoot().selectEnd();
          selection = $getSelection();
        }
        if (!$isRangeSelection(selection)) {
          return;
        }

        const nodes = references.flatMap((reference, index) => [
          ...(index > 0 ? [$createTextNode(' ')] : []),
          $createBeautifulMentionNode(
            '',
            reference.serializedPath,
            toFileMentionData(reference),
          ),
        ]);
        selection.insertNodes(nodes);
      });
      editor.focus();
    };
    const inserters = { insertLineBreak, insertText, insertFileReferences };

    register(inserters);
    registerTextInserter?.(insertText);
    registerFileReferenceInserter?.(insertFileReferences);

    return () => {
      register(null);
      registerTextInserter?.(null);
      registerFileReferenceInserter?.(null);
    };
  }, [editor, register, registerFileReferenceInserter, registerTextInserter]);

  return null;
}

function ControlledPromptInputPlugin({
  value,
  slashItems,
}: {
  value: string;
  slashItems: PromptInputSlashItem[];
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(
      () => {
        const root = $getRoot();
        const currentValue = root.getTextContent();
        const matchedSkill = findMatchingSkillSlashItem(value, slashItems);
        const firstNode = root.getFirstDescendant();
        const hasMatchingMention =
          matchedSkill &&
          $isBeautifulMentionNode(firstNode) &&
          firstNode.getTrigger() === '/' &&
          firstNode.getValue() === matchedSkill.id;
        const hasStaleSkillMention =
          $isBeautifulMentionNode(firstNode) &&
          firstNode.getData()?.mentionKind === 'skill' &&
          !matchedSkill;

        if (
          currentValue === value &&
          (!matchedSkill || hasMatchingMention) &&
          !hasStaleSkillMention
        ) {
          return;
        }

        replaceEditorText(value, slashItems);
      },
      { tag: 'prompt-input-controlled-value' },
    );
  }, [editor, slashItems, value]);

  return null;
}

export type LexicalPromptInputTextareaProps = Omit<
  ComponentProps<typeof ContentEditable>,
  'placeholder'
> & {
  value: string;
  onValueChange: (value: string) => void;
  insertText?: (text: string) => void;
  registerTextInserter?: (insertText: ((text: string) => void) | null) => void;
  registerFileReferenceInserter?: (
    insertFileReferences: ((references: ChatFileReference[]) => void) | null,
  ) => void;
  placeholder?: string;
  slashItems?: PromptInputSlashItem[];
  onSlashMenuOpen?: () => void | Promise<void>;
  onSlashItemSelect?: (item: PromptInputSlashItem) => void;
};

export const LexicalPromptInputTextarea = ({
  value,
  onValueChange,
  insertText,
  registerTextInserter,
  registerFileReferenceInserter,
  className,
  placeholder = 'What would you like to know?',
  slashItems = [],
  onSlashMenuOpen,
  onSlashItemSelect,
  onKeyDown,
  onPaste,
  onDrop,
  ...props
}: LexicalPromptInputTextareaProps) => {
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const composerInsertersRef = useRef<ComposerInserters | null>(null);

  const registerComposerInserters = useCallback(
    (inserters: ComposerInserters | null) => {
      composerInsertersRef.current = inserters;
    },
    [],
  );

  const insertPlainText = useCallback(
    (text: string) => {
      if (composerInsertersRef.current) {
        composerInsertersRef.current.insertText(text);
        return;
      }
      insertText?.(text);
    },
    [insertText],
  );

  const insertFileReferences = useCallback(
    (references: ChatFileReference[]) => {
      composerInsertersRef.current?.insertFileReferences(references);
    },
    [],
  );

  const mentionItems = useMemo<BeautifulMentionsItem[]>(
    () =>
      slashItems.map((item) => ({
        value: item.id,
        ...toSlashMentionData(item),
      })),
    [slashItems],
  );

  const initialConfig = useMemo(
    () => ({
      namespace: 'AimeChatPromptInput',
      nodes: SLASH_MENTION_NODES,
      editorState: () => replaceEditorText(value, slashItems, false),
      onError: (error: Error, editor: LexicalEditor) => {
        // eslint-disable-next-line no-console
        console.error('Chat input editor error:', error, editor);
      },
    }),
    [slashItems, value],
  );

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const nextValue = editorState.read(() => $getRoot().getTextContent());
      if (nextValue !== value) {
        onValueChange(nextValue);
      }
    },
    [onValueChange, value],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLDivElement>) => {
      onPaste?.(event);
      if (event.defaultPrevented) {
        return;
      }

      const fileList = getTransferredFiles(event.clipboardData);

      if (fileList.length > 0) {
        event.preventDefault();
        insertFileReferences(await resolveTransferredFileReferences(fileList));
        return;
      }

      const clipboardText = event.clipboardData?.getData('text/plain') || '';
      const uriPaths = getFilePathsFromUriList(
        event.clipboardData?.getData('text/uri-list') || '',
      );
      if (uriPaths.length > 0) {
        event.preventDefault();
        const references = await resolveUriFileReferences(uriPaths);
        if (references.length > 0) {
          insertFileReferences(references);
        } else if (clipboardText) {
          insertPlainText(clipboardText);
        }
        return;
      }

      const nativeClipboardPaths =
        window.electron.app.getClipboardFilePaths?.() ?? [];
      if (nativeClipboardPaths.length > 0) {
        event.preventDefault();
        const references = await resolveUriFileReferences(nativeClipboardPaths);
        if (references.length > 0) {
          insertFileReferences(references);
        } else if (clipboardText) {
          insertPlainText(clipboardText);
        }
        return;
      }

      const pathCandidate = getPlainTextPathCandidate(clipboardText);
      if (!pathCandidate) {
        return;
      }

      event.preventDefault();
      try {
        const info = await window.electron.app.getFileInfo(
          pathCandidate.sourcePath,
        );
        if (!info.isExist) {
          insertPlainText(clipboardText);
          return;
        }

        insertFileReferences([
          {
            ...pathCandidate,
            name: info.name || getFileReferenceName(pathCandidate.sourcePath),
            kind: info.isFile === false ? 'directory' : 'file',
          },
        ]);
      } catch {
        insertPlainText(clipboardText);
      }
    },
    [insertFileReferences, insertPlainText, onPaste],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      onDrop?.(event);
      if (event.defaultPrevented) {
        return;
      }

      const reference = getChatFileReferenceDragData(event.dataTransfer);
      const files = getTransferredFiles(event.dataTransfer);
      if (!reference && files.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (reference) {
        insertFileReferences([reference]);
        return;
      }

      insertFileReferences(await resolveTransferredFileReferences(files));
    },
    [insertFileReferences, onDrop],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.key !== 'Enter') {
        return;
      }
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        composerInsertersRef.current?.insertLineBreak();
        return;
      }
      if (slashMenuOpen) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const form = event.currentTarget.closest('form');
      const submitButton = form?.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement | null;
      if (!submitButton?.disabled) {
        form?.requestSubmit();
      }
    },
    [onKeyDown, slashMenuOpen],
  );

  const handleSlashMenuOpen = useCallback(() => {
    setSlashMenuOpen(true);
    Promise.resolve(onSlashMenuOpen?.()).catch(() => undefined);
  }, [onSlashMenuOpen]);

  const handleSlashMenuClose = useCallback(() => {
    setSlashMenuOpen(false);
  }, []);

  const handleSlashItemSelect = useCallback(
    (selectedItem: { value: string }) => {
      const instantItem = findInstantSlashItem(selectedItem.value, slashItems);
      if (instantItem) {
        // BeautifulMentions inserts the selected item after this callback. Defer
        // clearing so instant commands never remain in the editor as message text.
        queueMicrotask(() => {
          onValueChange('');
          onSlashItemSelect?.(instantItem);
        });
        return;
      }

      const slashItem = slashItems.find(
        (item) => item.id === selectedItem.value,
      );
      if (slashItem && slashItem.group !== 'skills') {
        // Built-in commands stay editable plain text so the user can append
        // arguments such as the objective after `/goal `.
        queueMicrotask(() => onValueChange(`/${slashItem.id} `));
      }
    },
    [onSlashItemSelect, onValueChange, slashItems],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative min-h-16 w-full flex-1">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              {...props}
              aria-placeholder={undefined}
              data-slot="input-group-control"
              className={cn(
                'max-h-48 min-h-16 w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent px-3 py-3 text-sm outline-none',
                'whitespace-pre-wrap break-words focus-visible:ring-0 dark:bg-transparent',
                className,
              )}
              onKeyDownCapture={handleKeyDown}
              onPaste={handlePaste}
              onDrop={handleDrop}
              placeholder={null}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute inset-x-3 top-3 truncate text-sm text-muted-foreground">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
        <RegisterComposerInsertersPlugin
          register={registerComposerInserters}
          registerFileReferenceInserter={registerFileReferenceInserter}
          registerTextInserter={registerTextInserter}
        />
        <ControlledPromptInputPlugin value={value} slashItems={slashItems} />
        <BeautifulMentionsPlugin
          allowSpaces={false}
          autoSpace
          insertOnBlur={false}
          items={{ '/': mentionItems }}
          menuComponent={SlashMentionMenu}
          menuItemComponent={SlashMentionMenuItem}
          menuItemLimit={false}
          onMenuClose={handleSlashMenuClose}
          onMenuItemSelect={handleSlashItemSelect}
          onMenuOpen={handleSlashMenuOpen}
          punctuation=""
          showCurrentMentionsAsSuggestions={false}
        />
      </div>
    </LexicalComposer>
  );
};
