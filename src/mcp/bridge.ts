import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Fuse from 'fuse.js';
import {
  db,
  deleteGistLocal,
  getCachedGistFiles,
  getSetting,
  gistTitle,
  saveGistFiles,
  saveGistWithFiles,
  type GistFileContent,
  type GistRecord,
} from '../lib/db';
import {
  createGist,
  deleteGist,
  fetchGistFiles,
  resolveEndpoints,
  updateGist,
  type GistFilePatch,
  type GistFilePatchEntry,
  type GitHubEndpoints,
} from '../lib/github';
import { useAppStore } from '../lib/store';

/**
 * The Rust MCP server (src-tauri/src/mcp) emits
 * an `mcp:request` event per tool call; this dispatcher runs it against the
 * existing GitHub/Dexie logic and returns the result via the `mcp_respond`
 * command. All auth stays here: the token is read from Dexie, never sent to Rust side.
 */

interface McpRequestPayload {
  id: string;
  tool: string;
  args: unknown;
}

let isRegistered = false;

/** Register the single `mcp:request` listener. No-op outside Tauri or if already registered. */
export function registerMcpBridge(): void {
  if (isRegistered || !isTauri()) return;
  isRegistered = true;

  listen<McpRequestPayload>('mcp:request', async (event) => {
    const { id, tool, args } = event.payload;
    try {
      const data = await handleTool(tool, asRecord(args));
      await invoke('mcp_respond', { id, ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await invoke('mcp_respond', { id, ok: false, error: message });
    }
  });
}

async function handleTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
  switch (tool) {
    case 'list_gists':
      return listGists(args);
    case 'search_gists':
      return searchGists(args);
    case 'read_gist':
      return readGist(args);
    case 'create_gist':
      return createGistTool(args);
    case 'update_gist':
      return updateGistTool(args);
    case 'delete_gist':
      return deleteGistTool(args);
    case 'get_gist_url':
      return getGistUrl(args);
    case 'get_current_user':
      return getCurrentUser();
    case 'sync_gists':
      return syncGistsTool();
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

async function requireAuth(): Promise<{ endpoints: GitHubEndpoints; token: string }> {
  const token = await getSetting('accessToken');
  if (!token) {
    throw new Error('Not signed in to Gister. Open the app and sign in with GitHub first.');
  }
  const endpoints = resolveEndpoints(await getSetting('enterpriseHost'));
  return { endpoints, token };
}

/** List metadata shape returned to agents (no file contents). */
function summarize(gist: GistRecord) {
  return {
    id: gist.id,
    title: gistTitle(gist),
    description: gist.description,
    isPublic: gist.isPublic,
    files: gist.files.map((file) => ({
      filename: file.filename,
      language: file.language,
      size: file.size,
    })),
    createdAt: gist.createdAt,
    updatedAt: gist.updatedAt,
    htmlUrl: gist.htmlUrl,
  };
}

/** Detail shape: metadata plus full file contents. */
function detail(gist: GistRecord, files: GistFileContent[]) {
  return {
    id: gist.id,
    title: gistTitle(gist),
    description: gist.description,
    isPublic: gist.isPublic,
    createdAt: gist.createdAt,
    updatedAt: gist.updatedAt,
    htmlUrl: gist.htmlUrl,
    files: files.map((file) => ({
      filename: file.filename,
      language: file.language,
      content: file.content,
    })),
  };
}

/** Read cached file contents when fresh, otherwise fetch from GitHub and cache. */
async function loadFiles(gist: GistRecord): Promise<GistFileContent[]> {
  const cached = await getCachedGistFiles(gist.id);
  if (cached && cached.updatedAt === gist.updatedAt) return cached.files;
  const { endpoints, token } = await requireAuth();
  const files = await fetchGistFiles(endpoints, token, gist.id);
  await saveGistFiles(gist.id, files, gist.updatedAt);
  return files;
}

async function listGists(args: Record<string, unknown>): Promise<unknown> {
  const limit = toPositiveInt(args.limit);
  let gists = await db.gists.orderBy('updatedAt').reverse().toArray();
  if (limit) gists = gists.slice(0, limit);
  return { count: gists.length, gists: gists.map(summarize) };
}

async function searchGists(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args.query ?? '').trim();
  if (!query) throw new Error('`query` is required.');
  const limit = toPositiveInt(args.limit) ?? 20;
  const all = await db.gists.toArray();
  const fuse = new Fuse(all, {
    keys: ['description', 'files.filename'],
    threshold: 0.4,
  });
  const gists = fuse.search(query, { limit }).map((result) => summarize(result.item));
  return { count: gists.length, gists };
}

async function readGist(args: Record<string, unknown>): Promise<unknown> {
  const id = requireId(args);
  const gist = await db.gists.get(id);
  if (!gist) throw new Error(`Gist not found: ${id}`);
  const files = await loadFiles(gist);
  return detail(gist, files);
}

async function createGistTool(args: Record<string, unknown>): Promise<unknown> {
  const files = parseNewFiles(args.files);
  if (!files.length) {
    throw new Error('`files` must contain at least one file with a filename and content.');
  }
  const { endpoints, token } = await requireAuth();
  const { record, files: contents } = await createGist(endpoints, token, {
    description: String(args.description ?? ''),
    isPublic: args.isPublic === true,
    files,
  });
  await saveGistWithFiles(record, contents);
  return detail(record, contents);
}

async function updateGistTool(args: Record<string, unknown>): Promise<unknown> {
  const id = requireId(args);
  const existing = await db.gists.get(id);
  const description = args.description !== undefined ? String(args.description) : (existing?.description ?? '');

  const files: GistFilePatch = {};
  if (Array.isArray(args.files)) {
    for (const raw of args.files) {
      const file = asRecord(raw);
      const filename = String(file.filename ?? '').trim();
      if (!filename) continue;
      if (file.deleted === true) {
        files[filename] = null;
        continue;
      }
      const entry: Exclude<GistFilePatchEntry, null> = {};
      if (typeof file.newFilename === 'string' && file.newFilename.trim()) {
        entry.filename = file.newFilename;
      }
      if (typeof file.content === 'string') {
        entry.content = file.content;
      }
      files[filename] = entry;
    }
  }

  const { endpoints, token } = await requireAuth();
  const { record, files: contents } = await updateGist(endpoints, token, id, { description, files });
  await saveGistWithFiles(record, contents);
  return detail(record, contents);
}

async function deleteGistTool(args: Record<string, unknown>): Promise<unknown> {
  const id = requireId(args);
  const { endpoints, token } = await requireAuth();
  await deleteGist(endpoints, token, id);
  await deleteGistLocal(id);
  return { deleted: true, id };
}

async function getGistUrl(args: Record<string, unknown>): Promise<unknown> {
  const id = requireId(args);
  const gist = await db.gists.get(id);
  if (!gist) throw new Error(`Gist not found: ${id}`);
  return { id, htmlUrl: gist.htmlUrl };
}

async function getCurrentUser(): Promise<unknown> {
  const profile = await getSetting('profile');
  if (!profile) throw new Error('Not signed in to Gister.');
  return profile;
}

async function syncGistsTool(): Promise<unknown> {
  await useAppStore.getState().runSync();
  const { lastSyncAt, syncError } = useAppStore.getState();
  return { lastSyncAt, syncError };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function requireId(args: Record<string, unknown>): string {
  const id = String(args.id ?? '').trim();
  if (!id) throw new Error('`id` is required.');
  return id;
}

function toPositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function parseNewFiles(value: unknown): Array<{ filename: string; content: string }> {
  if (!Array.isArray(value)) return [];
  const files: Array<{ filename: string; content: string }> = [];
  for (const raw of value) {
    const file = asRecord(raw);
    const filename = String(file.filename ?? '').trim();
    if (!filename) continue;
    files.push({ filename, content: typeof file.content === 'string' ? file.content : '' });
  }
  return files;
}
