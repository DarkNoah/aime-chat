import React, { useCallback, useMemo } from 'react';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import CodeMirror, {
  EditorView,
  type EditorState,
  type Extension,
  type ViewUpdate,
} from '@uiw/react-codemirror';
import { useTheme } from 'next-themes';
import type { FileEditorSelection } from './file-selection-context-menu';

type CodeTextEditorProps = {
  fileName: string;
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: FileEditorSelection | null) => void;
};

export function getCodeEditorSelection(
  state: EditorState,
): FileEditorSelection | null {
  if (state.selection.ranges.length !== 1) return null;

  const { from, to } = state.selection.main;
  if (from === to) return null;

  const text = state.doc.sliceString(from, to);
  if (!text.trim()) return null;

  return {
    text,
    startLine: state.doc.lineAt(from).number,
    // CodeMirror ranges are end-exclusive. Avoid counting the untouched next
    // line when a selection stops exactly at its first character.
    endLine: state.doc.lineAt(to - 1).number,
  };
}

export function getLanguageExtension(fileName: string): Extension | null {
  const extension = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'js':
    case 'cjs':
    case 'mjs':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'ts':
    case 'cts':
    case 'mts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    case 'json':
    case 'jsonc':
      return json();
    case 'html':
    case 'htm':
      return html();
    case 'css':
    case 'less':
    case 'scss':
    case 'sass':
      return css();
    case 'md':
    case 'markdown':
      return markdown();
    case 'py':
    case 'pyw':
      return python();
    case 'sql':
      return sql();
    case 'yaml':
    case 'yml':
      return yaml();
    case 'svg':
    case 'xml':
      return xml();
    default:
      return null;
  }
}

export const CodeTextEditor: React.FC<CodeTextEditorProps> = ({
  fileName,
  value,
  ariaLabel,
  onChange,
  onSelectionChange,
}) => {
  const { resolvedTheme } = useTheme();
  const languageExtension = useMemo(
    () => getLanguageExtension(fileName),
    [fileName],
  );
  const accessibilityExtension = useMemo(
    () => EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
    [ariaLabel],
  );
  const syncSelection = useCallback(
    (state: EditorState) => {
      onSelectionChange?.(getCodeEditorSelection(state));
    },
    [onSelectionChange],
  );
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (update.selectionSet || update.docChanged) {
        syncSelection(update.state);
      }
    },
    [syncSelection],
  );

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      extensions={
        languageExtension
          ? [accessibilityExtension, languageExtension]
          : [accessibilityExtension]
      }
      basicSetup={{
        autocompletion: false,
        bracketMatching: true,
        closeBrackets: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        highlightSelectionMatches: true,
        lineNumbers: true,
      }}
      indentWithTab
      onChange={onChange}
      onCreateEditor={(_view, state) => syncSelection(state)}
      onUpdate={handleUpdate}
      className="h-full text-[13px] [&_.cm-editor]:h-full [&_.cm-editor]:bg-background! [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:leading-5 [&_.cm-content]:py-3 [&_.cm-line]:px-2 [&_.cm-gutters]:border-r [&_.cm-gutters]:border-border [&_.cm-gutters]:bg-muted/30! [&_.cm-activeLine]:bg-accent/50! [&_.cm-activeLineGutter]:bg-accent/70!"
    />
  );
};
