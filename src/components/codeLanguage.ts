import { loadLanguage, type LanguageName } from '@uiw/codemirror-extensions-langs';

/**
 * Extension → CodeMirror language, for the handful of cases where the file
 * extension doesn't already match a `langs` key (see the langs map in
 * `@uiw/codemirror-extensions-langs`). Extensions that map 1:1 (ts, py, go,
 * json, css, …) are resolved directly and don't need an entry here.
 */
const EXTENSION_ALIASES: Record<string, LanguageName> = {
  mdx: 'markdown',
  markdown: 'markdown',
  htm: 'html',
  yaml: 'yaml',
  shell: 'sh',
  bash: 'sh',
  zsh: 'sh',
  jsonc: 'json',
  gyp: 'python',
  gitignore: 'properties',
  env: 'properties',
};

/** Filenames that carry no extension but have a well-known language. */
const FILENAME_LANGUAGES: Record<string, LanguageName> = {
  makefile: 'properties',
  '.gitignore': 'properties',
  '.env': 'properties',
};

/** Extensions rendered as formatted markdown in the read-only detail view. */
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx']);

/** True when the filename's extension is a markdown variant (md, markdown, mdx). */
export function isMarkdownFilename(filename: string) {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : lower;
  return MARKDOWN_EXTENSIONS.has(ext);
}

/**
 * Resolve a CodeMirror language extension for a filename, by its extension (or
 * well-known name). Returns null when no language matches. Shared by the
 * read-only `CodeView` and the editable `CodeEditor`.
 */
export function languageForFilename(filename: string) {
  const lower = filename.toLowerCase();
  const byName = FILENAME_LANGUAGES[lower];
  if (byName) return loadLanguage(byName);

  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : lower;
  const aliased = EXTENSION_ALIASES[ext];
  if (aliased) return loadLanguage(aliased);

  // The langs map is keyed by extension for most languages, so a direct lookup
  // covers the common cases (ts, tsx, py, go, rs, sql, …).
  return loadLanguage(ext as LanguageName);
}
