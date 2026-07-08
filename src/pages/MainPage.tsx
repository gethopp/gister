import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Center } from '@astryxdesign/core/Center';
import { Spinner } from '@astryxdesign/core/Spinner';
import { CreateGistView } from '../components/CreateGistView';
import { EditGistView } from '../components/EditGistView';
import { GistCommandPalette } from '../components/GistCommandPalette';
import { GistDetail } from '../components/GistDetail';
import { GistListPanel } from '../components/GistListPanel';
import type { AccountFooterProps } from '../components/AccountFooter';
import { db, deleteGistLocal, getSetting, saveGistWithFiles, type GistRecord } from '../lib/db';
import {
  createGist,
  deleteGist,
  resolveEndpoints,
  updateGist,
  type NewGistInput,
  type UpdateGistInput,
} from '../lib/github';
import { useGistFiles } from '../hooks/useGistFiles';
import { useAppStore } from '../lib/store';
import { useUpdater } from '../lib/updater';

type MainView = 'detail' | 'create' | 'edit';

export interface MainScreenProps extends Omit<AccountFooterProps, 'onOpenSearch'> {
  /** undefined while Dexie is still answering the first query. */
  gists: GistRecord[] | undefined;
  /** Latest sync failure message, if any. */
  syncError: string | null;
  /** Renders the detail column for the selected gist (or the empty state). */
  renderDetail: (gist: GistRecord | null, opts: { onEdit: () => void }) => ReactNode;
  /**
   * Renders the create-gist column. `onClose` returns to the detail view; pass
   * the new gist's id to open it once created.
   */
  renderCreate: (opts: { onClose: (newGistId?: string) => void }) => ReactNode;
  /** Renders the edit column for a gist. `onClose` returns to the detail view. */
  renderEdit: (gist: GistRecord, opts: { onClose: () => void }) => ReactNode;
}

/**
 * Presentational main screen: two columns — the gist list (with the account
 * block pinned to its bottom) and the working area, which shows the selected
 * gist's detail, the create-gist form, or the edit form. Owns only view state
 * (selection + which view); data loading and writes are delegated to the
 * `render*` props.
 */
export function MainScreen({ gists, syncError, renderDetail, renderCreate, renderEdit, ...account }: MainScreenProps) {
  const [selectedGistId, setSelectedGistId] = useState<string | null>(null);
  const [view, setView] = useState<MainView>('detail');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const selectedGist = useMemo(() => gists?.find((g) => g.id === selectedGistId) ?? null, [gists, selectedGistId]);

  const handleSelectGist = (id: string) => {
    setView('detail');
    setSelectedGistId(id);
  };

  const handleCloseCreate = (newGistId?: string) => {
    setView('detail');
    if (newGistId) setSelectedGistId(newGistId);
  };

  let workingArea: ReactNode;
  if (view === 'create') {
    workingArea = renderCreate({ onClose: handleCloseCreate });
  } else if (view === 'edit' && selectedGist) {
    workingArea = renderEdit(selectedGist, { onClose: () => setView('detail') });
  } else {
    workingArea = renderDetail(selectedGist, {
      onEdit: () => {
        if (selectedGist) setView('edit');
      },
    });
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <GistListPanel
        gists={gists}
        selectedGistId={view === 'create' ? null : selectedGistId}
        onSelectGist={handleSelectGist}
        onNewGist={() => setView('create')}
        onOpenSearch={() => setIsPaletteOpen(true)}
        syncError={syncError}
        {...account}
      />
      <main style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{workingArea}</main>
      <GistCommandPalette
        gists={gists}
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        onSelectGist={(id) => {
          setIsPaletteOpen(false);
          handleSelectGist(id);
        }}
        onNewGist={() => setView('create')}
        onSync={account.onRefresh}
      />
    </div>
  );
}

/**
 * Connects a gist to its cache-first file loader. Opening a gist renders instantly
 * from the local cache; a newer revision is only fetched in the background when
 * the gist's `updatedAt` shows the cache is stale.
 */
function ConnectedGistDetail({ gist, onEdit }: { gist: GistRecord | null; onEdit: () => void }) {
  const { files, isLoading, isRefreshing, error } = useGistFiles(gist);
  return (
    <GistDetail
      gist={gist}
      files={files}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      error={error}
      onEdit={() => onEdit()}
      onDelete={(g) => deleteGistFromGitHub(g.id)}
    />
  );
}

/**
 * Loads the gist's file contents (cache-first), then renders the edit form once
 * they're available. Editing needs the actual contents, so it waits on them
 * rather than opening an empty form.
 */
function ConnectedEditGist({ gist, onClose }: { gist: GistRecord; onClose: () => void }) {
  const { files } = useGistFiles(gist);
  if (files === undefined) {
    return (
      <Center axis="both" height="100%">
        <Spinner label="Loading files…" />
      </Center>
    );
  }
  return (
    <EditGistView
      gist={gist}
      files={files}
      onCancel={onClose}
      onSubmit={async (input) => {
        await updateGistOnGitHub(gist.id, input);
        onClose();
      }}
    />
  );
}

/** Create a gist on GitHub, then seed the local caches so it appears at once. */
async function createGistOnGitHub(input: NewGistInput): Promise<string> {
  const token = await getSetting('accessToken');
  if (!token) throw new Error('Not signed in.');
  const endpoints = resolveEndpoints(await getSetting('enterpriseHost'));
  const { record, files } = await createGist(endpoints, token, input);
  await saveGistWithFiles(record, files);
  return record.id;
}

/** Update a gist on GitHub, then refresh the local caches with the result. */
async function updateGistOnGitHub(id: string, input: UpdateGistInput): Promise<void> {
  const token = await getSetting('accessToken');
  if (!token) throw new Error('Not signed in.');
  const endpoints = resolveEndpoints(await getSetting('enterpriseHost'));
  const { record, files } = await updateGist(endpoints, token, id, input);
  await saveGistWithFiles(record, files);
}

/** Delete a gist on GitHub, then drop it from the local caches. */
async function deleteGistFromGitHub(id: string): Promise<void> {
  const token = await getSetting('accessToken');
  if (!token) throw new Error('Not signed in.');
  const endpoints = resolveEndpoints(await getSetting('enterpriseHost'));
  await deleteGist(endpoints, token, id);
  await deleteGistLocal(id);
}

/** Container: wires the global store and Dexie live queries into MainScreen. */
export function MainPage() {
  const profile = useAppStore((s) => s.profile);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const syncError = useAppStore((s) => s.syncError);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const runSync = useAppStore((s) => s.runSync);
  const logout = useAppStore((s) => s.logout);
  const { isUpdateAvailable, install: onUpdate } = useUpdater();

  const gists = useLiveQuery(() => db.gists.orderBy('updatedAt').reverse().toArray(), []);

  useEffect(() => {
    runSync();
  }, [runSync]);

  const renderDetail = useCallback(
    (gist: GistRecord | null, { onEdit }: { onEdit: () => void }) => (
      <ConnectedGistDetail gist={gist} onEdit={onEdit} />
    ),
    [],
  );

  const renderCreate = useCallback(
    ({ onClose }: { onClose: (newGistId?: string) => void }) => (
      <CreateGistView
        onSubmit={async (input) => {
          const id = await createGistOnGitHub(input);
          onClose(id);
        }}
        onCancel={() => onClose()}
      />
    ),
    [],
  );

  const renderEdit = useCallback(
    (gist: GistRecord, { onClose }: { onClose: () => void }) => <ConnectedEditGist gist={gist} onClose={onClose} />,
    [],
  );

  if (!profile) return null; // App only renders MainPage when logged in.

  return (
    <MainScreen
      profile={profile}
      gists={gists}
      isSyncing={isSyncing}
      syncError={syncError}
      lastSyncAt={lastSyncAt}
      onRefresh={runSync}
      onLogout={logout}
      isUpdateAvailable={isUpdateAvailable}
      onUpdate={onUpdate}
      renderDetail={renderDetail}
      renderCreate={renderCreate}
      renderEdit={renderEdit}
    />
  );
}
