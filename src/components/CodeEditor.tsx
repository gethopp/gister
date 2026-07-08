import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { githubLight } from '@uiw/codemirror-theme-github';
import { duotoneDark } from '@uiw/codemirror-theme-duotone';
import { languageForFilename } from './codeLanguage';
import { usePrefersDark } from '../hooks/usePrefersDark';

export interface CodeEditorProps {
  /** Drives syntax highlighting. Highlighting updates as this changes. */
  filename: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name for the editor's textbox. */
  ariaLabel?: string;
  minHeight?: string;
}

/**
 * An editable CodeMirror editor whose syntax highlighting follows `filename`.
 * The sibling of the read-only `CodeView`; both resolve languages through the
 * shared `languageForFilename` helper, so an editor and a viewer of the same
 * file highlight identically. With no (or unknown) extension it falls back to
 * plain text.
 */
export function CodeEditor({
  filename,
  value,
  onChange,
  placeholder,
  ariaLabel,
  minHeight = '200px',
}: CodeEditorProps) {
  const isDarkMode = usePrefersDark();
  const extensions = useMemo(() => {
    const lang = filename.trim() ? languageForFilename(filename) : null;
    return [EditorView.lineWrapping, ...(lang ? [lang] : [])];
  }, [filename]);

  return (
    <CodeMirror
      value={value}
      theme={isDarkMode ? duotoneDark : githubLight}
      extensions={extensions}
      onChange={onChange}
      placeholder={placeholder}
      minHeight={minHeight}
      aria-label={ariaLabel}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: false,
      }}
      style={{ fontSize: 13 }}
    />
  );
}
