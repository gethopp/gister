import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import type { GistFileContent, GistRecord, UserProfile } from '../lib/db';
import type { NewGistInput } from '../lib/github';
import { CreateGistView } from '../components/CreateGistView';
import { EditGistView } from '../components/EditGistView';
import { GistDetail } from '../components/GistDetail';
import { AccountFooter } from '../components/AccountFooter';
import { LoginPage } from '../pages/LoginPage';
import { MainScreen } from '../pages/MainPage';

/**
 * Dev-only screen gallery for design work. Open the app (or the Vite dev URL
 * in a browser) at `#/preview` and pick a screen. Every screen renders from
 * mock data; nothing touches GitHub or your real local database.
 */

const mockProfile: UserProfile = {
  login: 'octocat',
  name: 'Mona Lisa Octocat',
  email: 'octocat@github.com',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/** Mock files (with content) keyed by gist id, to exercise CodeMirror rendering. */
const mockFiles: Record<string, GistFileContent[]> = {
  'mock-0': [
    {
      filename: '.zshrc',
      language: 'Shell',
      content: 'export EDITOR=nvim\nalias gs="git status"\nalias ll="ls -alh"\n\neval "$(starship init zsh)"\n',
    },
    {
      filename: 'aliases.sh',
      language: 'Shell',
      content: '#!/usr/bin/env bash\nalias gc="git commit -m"\nalias gp="git push"\n',
    },
  ],
  'mock-1': [
    {
      filename: 'README.md',
      language: 'Markdown',
      content:
        '# useDebounce\n\nA tiny React hook that **debounces** a rapidly-changing value.\n\n## Features\n\n- Generic over the value type\n- Configurable `delay` (defaults to `300ms`)\n- ~~No dependencies~~ zero dependencies\n\n## Tasks\n\n- [x] Basic implementation\n- [x] TypeScript types\n- [ ] Unit tests\n\n## API\n\n| Param | Type | Description |\n| ----- | ------ | ------------------------- |\n| value | `T` | The value to debounce |\n| delay | number | Debounce delay in ms |\n\n## Example\n\n```ts\nconst debounced = useDebounce(query, 500);\n```\n\nSee the [React docs](https://react.dev) for more on effects.\n',
    },
    {
      filename: 'useDebounce.ts',
      language: 'TypeScript',
      content:
        "import { useEffect, useState } from 'react';\n\nexport function useDebounce<T>(value: T, delay = 300): T {\n  const [debounced, setDebounced] = useState(value);\n  useEffect(() => {\n    const id = setTimeout(() => setDebounced(value), delay);\n    return () => clearTimeout(id);\n  }, [value, delay]);\n  return debounced;\n}\n",
    },
  ],
  'mock-3': [
    {
      filename: 'window-functions.sql',
      language: 'SQL',
      content:
        'SELECT\n  user_id,\n  amount,\n  SUM(amount) OVER (PARTITION BY user_id ORDER BY created_at) AS running_total\nFROM payments\nORDER BY user_id, created_at;\n',
    },
  ],
};

function filesForGist(gist: GistRecord): GistFileContent[] {
  return (
    mockFiles[gist.id] ??
    gist.files.map((f) => ({
      filename: f.filename,
      language: f.language,
      content: `# ${gist.description || f.filename}\n\nMock preview content for ${f.filename}.\n`,
    }))
  );
}

const initialGists: GistRecord[] = [
  { description: 'Dotfiles: zshrc + aliases', files: ['.zshrc', 'aliases.sh'] },
  { description: 'React useDebounce hook', files: ['useDebounce.ts'] },
  { description: 'Kubernetes cheatsheet #k8s #ops', files: ['k8s.md'] },
  { description: 'SQL window functions examples', files: ['window-functions.sql'] },
  { description: 'Tauri IPC notes', files: ['notes.md'] },
  { description: 'Advent of Code 2025 day 14', files: ['day14.py'] },
  { description: '', files: ['untitled.txt'] }, // exercises the filename fallback
  { description: 'Git worktree workflow #git', files: ['worktree.md'] },
].map(({ description, files }, i) => ({
  id: `mock-${i}`,
  description,
  files: files.map((filename) => ({ filename, language: null, size: 512 })),
  isPublic: i % 2 === 0,
  createdAt: hoursAgo(200 + i * 24),
  updatedAt: hoursAgo(i * 7 + 1),
  htmlUrl: 'https://gist.github.com/mock',
}));

const mockDevice = {
  device_code: 'mock-device-code',
  user_code: 'ABCD-1234',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
};

const noop = () => {};

/**
 * Preview stand-in for the connected detail: mimics cache-first loading. The
 * first time a gist is opened it "fetches" with a short delay; re-opening a
 * cached gist is instant, just like the real Dexie-backed `useGistFiles`.
 */
function PreviewGistDetail({
  gist,
  onDelete = noop,
  onEdit = noop,
}: {
  gist: GistRecord | null;
  onDelete?: (gist: GistRecord) => void;
  onEdit?: () => void;
}) {
  const cache = useRef<Record<string, GistFileContent[]>>({});
  const [files, setFiles] = useState<GistFileContent[] | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const gistId = gist?.id ?? null;
  useEffect(() => {
    if (!gist) {
      setFiles(undefined);
      return;
    }
    const cached = cache.current[gist.id];
    setFiles(cached);
    if (cached) return;
    let isCancelled = false;
    setIsRefreshing(true);
    const timer = setTimeout(() => {
      if (isCancelled) return;
      const loaded = filesForGist(gist);
      cache.current[gist.id] = loaded;
      setFiles(loaded);
      setIsRefreshing(false);
    }, 350);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gistId]);

  return (
    <GistDetail
      gist={gist}
      files={files}
      isLoading={files === undefined}
      isRefreshing={isRefreshing && files !== undefined}
      error={null}
      onEdit={() => onEdit()}
      onDelete={onDelete}
    />
  );
}

/** Build a mock gist record from create-form input, for the preview only. */
function mockGistFromInput(input: NewGistInput): GistRecord {
  const now = new Date().toISOString();
  return {
    id: `mock-new-${Date.now()}`,
    description: input.description,
    files: input.files.map((f) => ({ filename: f.filename, language: null, size: f.content.length })),
    isPublic: input.isPublic,
    createdAt: now,
    updatedAt: now,
    htmlUrl: 'https://gist.github.com/mock',
  };
}

/**
 * Interactive Main preview: keeps the gist list in local state so creating a
 * gist (with its chosen visibility) reflects immediately in the list.
 */
function MainPreview({ gists: initial, isSyncing }: { gists: GistRecord[]; isSyncing: boolean }) {
  const [gists, setGists] = useState(initial);
  return (
    <MainScreen
      profile={mockProfile}
      gists={gists}
      isSyncing={isSyncing}
      syncError={null}
      lastSyncAt={hoursAgo(2)}
      onRefresh={noop}
      onLogout={noop}
      renderDetail={(gist, { onEdit }) => (
        <PreviewGistDetail
          gist={gist}
          onEdit={onEdit}
          onDelete={(g) => setGists((prev) => prev.filter((x) => x.id !== g.id))}
        />
      )}
      renderCreate={({ onClose }) => (
        <CreateGistView
          onSubmit={async (input) => {
            const record = mockGistFromInput(input);
            setGists((prev) => [record, ...prev]);
            onClose(record.id);
          }}
          onCancel={() => onClose()}
        />
      )}
      renderEdit={(gist, { onClose }) => (
        <EditGistView
          gist={gist}
          files={filesForGist(gist)}
          onCancel={onClose}
          onSubmit={async (input) => {
            // Preview only: reflect the description change in local mock state.
            setGists((prev) => prev.map((g) => (g.id === gist.id ? { ...g, description: input.description } : g)));
            onClose();
          }}
        />
      )}
    />
  );
}

const screens: Record<string, { label: string; render: () => ReactNode }> = {
  login: {
    label: 'Login',
    render: () => <LoginPage />,
  },
  'login-code': {
    label: 'Login: device code',
    render: () => <LoginPage initialPhase={{ name: 'awaiting-approval', device: mockDevice }} />,
  },
  main: {
    label: 'Main',
    render: () => <MainPreview gists={initialGists} isSyncing={false} />,
  },
  'main-syncing': {
    label: 'Main: syncing',
    render: () => <MainPreview gists={initialGists.slice(0, 3)} isSyncing={true} />,
  },
  'main-empty': {
    label: 'Main: empty',
    render: () => (
      <MainScreen
        profile={mockProfile}
        gists={[]}
        isSyncing={false}
        syncError="API rate limit exceeded"
        lastSyncAt={hoursAgo(30)}
        onRefresh={noop}
        onLogout={noop}
        renderDetail={(gist, { onEdit }) => <PreviewGistDetail gist={gist} onEdit={onEdit} />}
        renderCreate={({ onClose }) => <CreateGistView onSubmit={async () => onClose()} onCancel={() => onClose()} />}
        renderEdit={(gist, { onClose }) => (
          <EditGistView gist={gist} files={filesForGist(gist)} onSubmit={async () => onClose()} onCancel={onClose} />
        )}
      />
    ),
  },
  'gist-detail': {
    label: 'Gist detail',
    render: () => (
      <div style={{ height: '100%' }}>
        <GistDetail
          gist={initialGists[1]}
          files={filesForGist(initialGists[1])}
          isLoading={false}
          isRefreshing={false}
          error={null}
          onEdit={noop}
          onDelete={noop}
        />
      </div>
    ),
  },
  'gist-create': {
    label: 'Create gist',
    render: () => (
      <div style={{ height: '100%' }}>
        <CreateGistView
          onSubmit={async (input) => {
            // Preview only: log the payload instead of hitting GitHub.
            console.log('Would create gist:', input);
          }}
          onCancel={noop}
        />
      </div>
    ),
  },
  'gist-edit': {
    label: 'Edit gist',
    render: () => (
      <div style={{ height: '100%' }}>
        <EditGistView
          gist={initialGists[0]}
          files={filesForGist(initialGists[0])}
          onSubmit={async (input) => {
            // Preview only: log the patch instead of hitting GitHub.
            console.log('Would update gist:', input);
          }}
          onCancel={noop}
        />
      </div>
    ),
  },
  'account-footer': {
    label: 'Account footer',
    render: () => (
      <div style={{ display: 'flex', height: '100%', alignItems: 'flex-end' }}>
        <div style={{ width: 260, borderRight: '1px solid var(--color-border)' }}>
          <AccountFooter
            profile={mockProfile}
            lastSyncAt={hoursAgo(1)}
            isSyncing={false}
            onRefresh={noop}
            onLogout={noop}
            onOpenSearch={noop}
            isUpdateAvailable
            onUpdate={noop}
          />
        </div>
      </div>
    ),
  },
};

export function PreviewGallery({ screen }: { screen: string }) {
  const current = screen in screens ? screen : 'login';
  const setCurrent = (id: string) => {
    window.location.hash = `#/preview/${id}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-background-surface)',
          flexShrink: 0,
        }}
      >
        <Text type="label" as="div">
          Preview
        </Text>
        <SegmentedControl label="Screen" size="sm" value={current} onChange={setCurrent}>
          {Object.entries(screens).map(([id, s]) => (
            <SegmentedControlItem key={id} value={id} label={s.label} />
          ))}
        </SegmentedControl>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{screens[current].render()}</div>
    </div>
  );
}
