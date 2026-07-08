import { db, getSetting, saveGistFiles, setSetting, type GistRecord } from './db';
import { fetchAllGists, fetchGistFiles, resolveEndpoints, type GitHubEndpoints } from './github';

/** How many gist bodies to fetch in parallel during a full sync. */
const BODY_FETCH_CONCURRENCY = 6;

let syncInFlight: Promise<void> | null = null;

/**
 * Pull the full gist list from GitHub into Dexie (upsert + prune deleted), then
 * backfill file bodies for any new or changed gists. The UI never awaits this;
 * it renders live from Dexie while this runs.
 */
export function syncGists(): Promise<void> {
  syncInFlight ??= doSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doSync(): Promise<void> {
  const token = await getSetting('accessToken');
  if (!token) return;
  const endpoints = resolveEndpoints(await getSetting('enterpriseHost'));

  const remote = await fetchAllGists(endpoints, token);
  const remoteIds = new Set(remote.map((g) => g.id));

  await db.transaction('rw', db.gists, db.gistContents, async () => {
    const localIds = await db.gists.toCollection().primaryKeys();
    const deleted = localIds.filter((id) => !remoteIds.has(id));
    if (deleted.length) {
      await db.gists.bulkDelete(deleted);
      // Drop cached contents for gists that no longer exist remotely.
      await db.gistContents.bulkDelete(deleted);
    }
    await db.gists.bulkPut(remote);
  });

  await syncBodies(endpoints, token, remote);

  await setSetting('lastSyncAt', new Date().toISOString());
}

/**
 * Fetch and cache file bodies for gists whose cached copy is missing or matches
 * an older revision. Reuses the same `updatedAt` staleness check as
 * `useGistFiles`, so after the initial backfill a sync only fetches the handful
 * of gists that actually changed. Per-gist failures are swallowed: the lazy
 * loader will retry when the gist is opened.
 */
async function syncBodies(endpoints: GitHubEndpoints, token: string, remote: GistRecord[]): Promise<void> {
  const cached = await db.gistContents.bulkGet(remote.map((g) => g.id));
  const stale = remote.filter((gist, i) => cached[i]?.updatedAt !== gist.updatedAt);
  if (!stale.length) return;

  let next = 0;
  const worker = async () => {
    while (next < stale.length) {
      const gist = stale[next++];
      try {
        const files = await fetchGistFiles(endpoints, token, gist.id);
        await saveGistFiles(gist.id, files, gist.updatedAt);
      } catch {
        // Best effort: `useGistFiles` fetches on open if this gist is missed.
      }
    }
  };

  const workers = Array.from({ length: Math.min(BODY_FETCH_CONCURRENCY, stale.length) }, worker);
  await Promise.all(workers);
}
