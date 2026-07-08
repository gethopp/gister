import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { githubLight } from '@uiw/codemirror-theme-github';
import { duotoneDark } from '@uiw/codemirror-theme-duotone';
import { languageForFilename } from './codeLanguage';
import { usePrefersDark } from '../hooks/usePrefersDark';

export interface CodeViewProps {
  filename: string;
  content: string;
}

/** Read-only CodeMirror view, syntax-highlighted by the file's extension. */
export function CodeView({ filename, content }: CodeViewProps) {
  const isDarkMode = usePrefersDark();
  const extensions = useMemo(() => {
    const lang = languageForFilename(filename);
    return [EditorView.lineWrapping, ...(lang ? [lang] : [])];
  }, [filename]);

  return (
    <CodeMirror
      value={content}
      theme={isDarkMode ? duotoneDark : githubLight}
      extensions={extensions}
      editable={false}
      readOnly
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
      style={{ fontSize: 13 }}
    />
  );
}
