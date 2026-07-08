import { useEffect, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Fuse, { type FuseResultMatch } from 'fuse.js';
import { CommandPalette } from '@astryxdesign/core/CommandPalette';
import { CommandPaletteFooter } from '@astryxdesign/core/CommandPalette';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Text } from '@astryxdesign/core/Text';
import type { SearchableItem, SearchSource } from '@astryxdesign/core/Typeahead';
import { db, gistTitle, type GistContentRecord, type GistRecord } from '../lib/db';

/** Sentinel ids for the non-gist action rows. */
const NEW_GIST_ID = '__gister:new-gist';
const SYNC_GISTS_ID = '__gister:sync-gists';

/** Group headings; insertion order controls the on-screen section order. */
const GROUP_ACTIONS = 'Actions';
const GROUP_GISTS = 'Gists';

/** Cap indexed content per gist so the in-memory Fuse index stays bounded. */
const MAX_CONTENT_CHARS = 8_000;
/** Cap the number of gist matches shown so the palette stays fast and scannable. */
const MAX_RESULTS = 40;

type PaletteItem = SearchableItem<{
  group: string;
  kind: 'gist' | 'action';
  /** Secondary line shown under the label (gists). */
  detail?: string;
  /** Kbd shortcut string shown on the right (actions). */
  shortcut?: string;
}>;

interface GistDoc {
  id: string;
  title: string;
  description: string;
  filenames: string;
  content: string;
  fileCount: number;
}

/** A human label for which field a Fuse match landed in. */
function matchedFieldLabel(key: string | undefined): string | null {
  switch (key) {
    case 'content':
      return 'matched in file content';
    case 'filenames':
      return 'matched in filename';
    case 'description':
    case 'title':
      return 'matched in description';
    default:
      return null;
  }
}

/** The secondary line for a gist row: file count plus where the query matched. */
function gistDetail(doc: GistDoc, matches: readonly FuseResultMatch[] | undefined): string {
  const files = `${doc.fileCount} file${doc.fileCount === 1 ? '' : 's'}`;
  const where = matchedFieldLabel(matches?.[0]?.key);
  return where ? `${files} · ${where}` : files;
}

/**
 * Build a fuzzy search source over the user's gists. Every gist is searchable by
 * its description and filenames; file content is included only where it has
 * already been cached locally (opening a gist caches it), so content search
 * degrades gracefully without any extra network requests.
 */
function createGistSearchSource(gists: GistRecord[], contents: GistContentRecord[]): SearchSource<PaletteItem> {
  const contentById = new Map<string, string>();
  for (const record of contents) {
    const joined = record.files
      .map((f) => `${f.filename}\n${f.content}`)
      .join('\n\n')
      .slice(0, MAX_CONTENT_CHARS);
    contentById.set(record.id, joined);
  }

  const docs: GistDoc[] = gists.map((gist) => ({
    id: gist.id,
    title: gistTitle(gist),
    description: gist.description,
    filenames: gist.files.map((f) => f.filename).join(' '),
    content: contentById.get(gist.id) ?? '',
    fileCount: gist.files.length,
  }));

  const docById = new Map(docs.map((d) => [d.id, d]));

  const fuse = new Fuse(docs, {
    includeMatches: true,
    ignoreLocation: true,
    threshold: 0.4,
    minMatchCharLength: 2,
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'description', weight: 0.4 },
      { name: 'filenames', weight: 0.3 },
      { name: 'content', weight: 0.2 },
    ],
  });

  const actions: Array<{ item: PaletteItem; keywords: string[] }> = [
    {
      item: {
        id: NEW_GIST_ID,
        label: 'Create new gist',
        auxiliaryData: { group: GROUP_ACTIONS, kind: 'action', shortcut: 'mod+n' },
      },
      keywords: ['new', 'create', 'add', 'gist'],
    },
    {
      item: {
        id: SYNC_GISTS_ID,
        label: 'Sync gists',
        auxiliaryData: { group: GROUP_ACTIONS, kind: 'action', shortcut: 'mod+s' },
      },
      keywords: ['sync', 'refresh', 'reload', 'fetch', 'pull', 'update'],
    },
  ];
  const actionItems = actions.map((a) => a.item);

  const toGistItem = (doc: GistDoc, matches?: readonly FuseResultMatch[]): PaletteItem => ({
    id: doc.id,
    label: doc.title,
    auxiliaryData: {
      group: GROUP_GISTS,
      kind: 'gist',
      detail: gistDetail(doc, matches),
    },
  });

  return {
    bootstrap() {
      const recent = gists.slice(0, MAX_RESULTS).map((gist) => {
        const doc = docById.get(gist.id);
        return doc ? toGistItem(doc) : null;
      });
      return [...actionItems, ...recent.filter((item): item is PaletteItem => item !== null)];
    },
    search(query) {
      const trimmed = query.trim();
      if (!trimmed) return this.bootstrap();

      const results = fuse
        .search(trimmed, { limit: MAX_RESULTS })
        .map((result) => toGistItem(result.item, result.matches));

      // Keep an action reachable while searching whenever the query looks like
      // that intent (e.g. "new", "sync"), so it stays usable without leaving.
      const lower = trimmed.toLowerCase();
      const matchedActions = actions
        .filter(
          ({ item, keywords }) =>
            item.label.toLowerCase().includes(lower) || keywords.some((kw) => kw.includes(lower) || lower.includes(kw)),
        )
        .map(({ item }) => item);

      return [...matchedActions, ...results];
    },
  };
}

function GistRow({ item, isSelected }: { item: PaletteItem; isSelected: boolean }) {
  const detail = item.auxiliaryData?.detail;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Text type="label" color={isSelected ? 'accent' : 'primary'} maxLines={1} as="span">
        {item.label}
      </Text>
      {detail && (
        <Text type="supporting" color="secondary" maxLines={1} as="span">
          {detail}
        </Text>
      )}
    </div>
  );
}

function ActionRow({ item }: { item: PaletteItem }) {
  const shortcut = item.auxiliaryData?.shortcut;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <Text type="label" as="span">
        {item.label}
      </Text>
      {shortcut && (
        <span style={{ marginLeft: 'auto' }}>
          <Kbd keys={shortcut} />
        </span>
      )}
    </div>
  );
}

function renderItem(item: PaletteItem, isSelected: boolean): ReactNode {
  return item.auxiliaryData?.kind === 'action' ? (
    <ActionRow item={item} />
  ) : (
    <GistRow item={item} isSelected={isSelected} />
  );
}

function PaletteFooter() {
  return (
    <CommandPaletteFooter>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Kbd keys="up" />
        <Kbd keys="down" />
        Navigate
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Kbd keys="enter" />
        Open
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Kbd keys="mod+n" />
        New gist
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Kbd keys="mod+s" />
        Sync
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Kbd keys="escape" />
        Close
      </span>
    </CommandPaletteFooter>
  );
}

export interface GistCommandPaletteProps {
  /** All gists, newest first. undefined while Dexie's first query is pending. */
  gists: GistRecord[] | undefined;
  /** Whether the palette is open (controlled). */
  isOpen: boolean;
  /** Notified whenever the palette wants to open or close. */
  onOpenChange: (isOpen: boolean) => void;
  /** Open the selected gist in the detail column. */
  onSelectGist: (id: string) => void;
  /** Open the create-gist screen. */
  onNewGist: () => void;
  /** Trigger a sync of the gist list with GitHub. */
  onSync: () => void;
}

/**
 * A ⌘K launcher for jumping to a gist or creating a new one. Search is fuzzy
 * (fuse.js) over each gist's description, filenames, and — where cached — its
 * file content. ⌘N creates a new gist from anywhere, ⌘S syncs, and ⌘K toggles
 * the palette.
 */
export function GistCommandPalette({
  gists,
  isOpen,
  onOpenChange,
  onSelectGist,
  onNewGist,
  onSync,
}: GistCommandPaletteProps) {
  const contents = useLiveQuery(() => db.gistContents.toArray(), []);

  const source = useMemo(() => createGistSearchSource(gists ?? [], contents ?? []), [gists, contents]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        onOpenChange(!isOpen);
      } else if (key === 'n') {
        e.preventDefault();
        onOpenChange(false);
        onNewGist();
      } else if (key === 's') {
        e.preventDefault();
        onOpenChange(false);
        onSync();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [isOpen, onOpenChange, onNewGist, onSync]);

  const handleValueChange = (id: string) => {
    if (id === NEW_GIST_ID) {
      onNewGist();
    } else if (id === SYNC_GISTS_ID) {
      onSync();
    } else if (id) {
      onSelectGist(id);
    }
  };

  return (
    <CommandPalette<PaletteItem>
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      searchSource={source}
      onValueChange={handleValueChange}
      renderItem={renderItem}
      label="Search gists"
      emptyBootstrapText="Search your gists…"
      emptySearchText="No matching gists"
      footer={<PaletteFooter />}
    />
  );
}
