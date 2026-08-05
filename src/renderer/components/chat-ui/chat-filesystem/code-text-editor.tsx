import React, { useEffect, useMemo, useState } from 'react';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { useTheme } from 'next-themes';

type CodeTextEditorProps = {
  fileName: string;
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
};

export const CodeTextEditor: React.FC<CodeTextEditorProps> = ({
  fileName,
  value,
  ariaLabel,
  onChange,
}) => {
  const { resolvedTheme } = useTheme();
  const [languageExtension, setLanguageExtension] = useState<Extension | null>(
    null,
  );
  const accessibilityExtension = useMemo(
    () => EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
    [ariaLabel],
  );

  useEffect(() => {
    let active = true;
    setLanguageExtension(null);

    import('@codemirror/language-data')
      .then(async ({ languages }) => {
        const language = languages.find((candidate) => {
          if (candidate.filename?.test(fileName)) return true;
          const extension = fileName.split('.').pop()?.toLowerCase();
          return extension ? candidate.extensions.includes(extension) : false;
        });

        if (!language) return null;
        return language.load();
      })
      .then((extension) => {
        if (active && extension) setLanguageExtension(extension);
        return undefined;
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [fileName]);

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
