import React, { useMemo } from 'react';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { useTheme } from 'next-themes';

type CodeTextEditorProps = {
  fileName: string;
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
};

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
      className="h-full text-[13px] [&_.cm-editor]:h-full [&_.cm-editor]:bg-background! [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:leading-5 [&_.cm-content]:py-3 [&_.cm-line]:px-2 [&_.cm-gutters]:border-r [&_.cm-gutters]:border-border [&_.cm-gutters]:bg-muted/30! [&_.cm-activeLine]:bg-accent/50! [&_.cm-activeLineGutter]:bg-accent/70!"
    />
  );
};
