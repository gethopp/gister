import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, saveGistFiles, type GistFileContent, type GistRecord } from '../lib/db';
import { fetchGistFiles, resolveEndpoints } from '../lib/github';

export interface GistFilesState {
  /** Cached file contents. undefined until the first fetch resolves. */
  files: GistFileContent[] | undefined;
  /** True when there is nothing cached yet to show. */
  isLoading: boolean;
  /** True when cached content is shown while a newer revision loads in the background. */
  isRefreshing: boolean;
  /** A refresh failure. Cached content (if any) is still shown alongside it. */
  error: string | null;
}

/**
 * Cache-first gist file loading. Reads contents from Dexie so opening a gist is
 * instant, and only calls GitHub in the background when the gist's `updatedAt`
 * indicates the cached copy is stale (or nothing is cached yet). Runs only when
 * a gist is explicitly opened — i.e. whenever `gist` changes.
 */
export function useGistFiles(gist: GistRecord | null): GistFilesState {
  const gistId = gist?.id ?? null;
  const updatedAt = gist?.updatedAt ?? null;

  const cached = useLiveQuery(() => (gistId ? db.gistContents.get(gistId) : undefined), [gistId]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gistId || !updatedAt) return;
    let isCancelled = false;
    setError(null);

    void (async () => {
      const existing = await db.gistContents.get(gistId);
      // Fresh cache for this exact revision → open instantly, no network call.
      // Always clear the spinner here: switching to an already-cached gist while
      // a previous gist's fetch is still in flight would otherwise leave the
      // stale "Updating…" state stuck on (the cancelled fetch skips its reset).
      if (existing && existing.updatedAt === updatedAt) {
        if (!isCancelled) setIsRefreshing(false);
        return;
      }

      if (!isCancelled) setIsRefreshing(true);
      try {
        const token = await getSetting('accessToken');
        if (!token) throw new Error('Not signed in.');
        const endpoints = resolveEndpoints(await getSetting('enterpriseHost'));
        const files = await fetchGistFiles(endpoints, token, gistId);
        if (isCancelled) return;
        await saveGistFiles(gistId, files, updatedAt);
      } catch (e) {
        if (!isCancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!isCancelled) setIsRefreshing(false);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [gistId, updatedAt]);

  const files = cached?.files;
  return {
    files,
    isLoading: files === undefined && error === null,
    isRefreshing: isRefreshing && files !== undefined,
    error,
  };
}
