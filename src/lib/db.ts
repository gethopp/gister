import Dexie, { type EntityTable } from "dexie";

export interface GistFileMeta {
  filename: string;
  language: string | null;
  size: number;
}

/** A gist file with its full text content, fetched on demand from GitHub. */
export interface GistFileContent {
  filename: string;
  language: string | null;
  content: string;
}

export interface GistRecord {
  id: string;
  description: string;
  files: GistFileMeta[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

/**
 * Locally cached file contents for a gist. Kept in its own table (the list sync
 * only knows file metadata, so it must not clobber content). `updatedAt` records
 * the gist revision these files were fetched for, so a background refresh only
 * hits GitHub when the list shows a newer revision.
 */
export interface GistContentRecord {
  id: string;
  files: GistFileContent[];
  updatedAt: string;
  fetchedAt: string;
}

export interface UserProfile {
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
}

export interface SettingsValues {
  accessToken: string;
  enterpriseHost: string;
  clientId: string;
  profile: UserProfile;
  lastSyncAt: string;
}

interface SettingRecord {
  key: string;
  value: unknown;
}

export const db = new Dexie("gister") as Dexie & {
  gists: EntityTable<GistRecord, "id">;
  settings: EntityTable<SettingRecord, "key">;
  gistContents: EntityTable<GistContentRecord, "id">;
};

db.version(1).stores({
  gists: "id, updatedAt",
  settings: "key",
});

db.version(2).stores({
  gists: "id, updatedAt",
  settings: "key",
  gistContents: "id",
});

export async function getSetting<K extends keyof SettingsValues>(
  key: K,
): Promise<SettingsValues[K] | undefined> {
  const record = await db.settings.get(key);
  return record?.value as SettingsValues[K] | undefined;
}

export async function setSetting<K extends keyof SettingsValues>(
  key: K,
  value: SettingsValues[K],
): Promise<void> {
  await db.settings.put({ key, value });
}

/** The gist title shown in lists: description, falling back to the first filename. */
export function gistTitle(gist: GistRecord): string {
  const description = gist.description.trim();
  if (description) return description;
  return gist.files[0]?.filename ?? "Untitled gist";
}

/**
 * Persist a gist together with its file contents in one transaction, so it
 * appears in the list and opens instantly without waiting for the next
 * background sync. Used after both creating and updating a gist on GitHub. On
 * update, renamed/removed files are replaced wholesale (the content cache is
 * keyed by gist id, and `files` is the full new set).
 */
export async function saveGistWithFiles(
  record: GistRecord,
  files: GistFileContent[],
): Promise<void> {
  await db.transaction('rw', db.gists, db.gistContents, async () => {
    await db.gists.put(record);
    await db.gistContents.put({
      id: record.id,
      files,
      updatedAt: record.updatedAt,
      fetchedAt: new Date().toISOString(),
    });
  });
}

/** Remove a gist and its cached contents locally (e.g. after deleting on GitHub). */
export async function deleteGistLocal(id: string): Promise<void> {
  await db.transaction('rw', db.gists, db.gistContents, async () => {
    await db.gists.delete(id);
    await db.gistContents.delete(id);
  });
}

/** Read cached file contents for a gist, if any have been fetched. */
export function getCachedGistFiles(id: string): Promise<GistContentRecord | undefined> {
  return db.gistContents.get(id);
}

/** Store freshly fetched file contents, tagged with the gist revision they match. */
export async function saveGistFiles(
  id: string,
  files: GistFileContent[],
  updatedAt: string,
): Promise<void> {
  await db.gistContents.put({ id, files, updatedAt, fetchedAt: new Date().toISOString() });
}

export async function clearAllData(): Promise<void> {
  await db.transaction("rw", db.gists, db.settings, db.gistContents, async () => {
    await db.gists.clear();
    await db.settings.clear();
    await db.gistContents.clear();
  });
}
