import type { ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';

export interface MarkdownViewProps {
  content: string;
}

/**
 * Renders untrusted gist markdown as formatted output. Uses react-markdown,
 * which builds a React element tree (no `dangerouslySetInnerHTML`, no raw HTML)
 * and sanitizes URL schemes by default, so gist content is safe to render.
 * `remark-gfm` adds GitHub-Flavored Markdown: tables, task lists, strikethrough
 * and autolinks.
 */
export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <div className="gist-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Open links in the OS browser instead of navigating the Tauri webview. */
function MarkdownLink({ href, children, ...rest }: ComponentProps<'a'>) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        if (!href) return;
        event.preventDefault();
        void openUrl(href);
      }}
    >
      {children}
    </a>
  );
}
