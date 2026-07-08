import { fetch } from '@tauri-apps/plugin-http';
import type { GistFileContent, GistRecord, UserProfile } from './db';

const DEVICE_FLOW_SCOPES = 'gist read:user user:email';

export interface GitHubEndpoints {
  /** e.g. https://github.com or https://ghe.example.com */
  oauthBase: URL;
  /** e.g. https://api.github.com or https://ghe.example.com/api/v3 */
  apiBase: URL;
}

/**
 * Derive OAuth and REST endpoints. `enterpriseHost` is user input: it is parsed
 * with the URL API and only its hostname is kept (https enforced, paths and
 * dangerous schemes discarded).
 */
export function resolveEndpoints(enterpriseHost?: string): GitHubEndpoints {
  const trimmed = enterpriseHost?.trim();
  if (!trimmed) {
    return {
      oauthBase: new URL('https://github.com'),
      apiBase: new URL('https://api.github.com'),
    };
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (!parsed.hostname) {
    throw new Error(`Invalid GitHub Enterprise host: ${enterpriseHost}`);
  }
  const origin = new URL(`https://${parsed.host}`);
  return {
    oauthBase: origin,
    apiBase: new URL('/api/v3/', origin),
  };
}

function apiUrl(endpoints: GitHubEndpoints, path: string): URL {
  // Relative resolution against apiBase keeps the /api/v3 prefix on Enterprise.
  return new URL(path.replace(/^\//, ''), endpoints.apiBase);
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function requestDeviceCode(endpoints: GitHubEndpoints, clientId: string): Promise<DeviceCodeResponse> {
  const url = new URL('/login/device/code', endpoints.oauthBase);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: DEVICE_FLOW_SCOPES }),
  });
  if (!response.ok) {
    throw new Error(`Device code request failed (HTTP ${response.status})`);
  }
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description ?? data.error);
  }
  return data as DeviceCodeResponse;
}

export type PollResult =
  | { status: 'success'; accessToken: string }
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'expired' }
  | { status: 'denied' };

export async function pollForAccessToken(
  endpoints: GitHubEndpoints,
  clientId: string,
  deviceCode: string,
): Promise<PollResult> {
  const url = new URL('/login/oauth/access_token', endpoints.oauthBase);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = await response.json();
  if (data.access_token) {
    return { status: 'success', accessToken: data.access_token as string };
  }
  switch (data.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'slow_down', interval: Number(data.interval) || 10 };
    case 'expired_token':
      return { status: 'expired' };
    case 'access_denied':
      return { status: 'denied' };
    default:
      throw new Error(data.error_description ?? data.error ?? 'Unknown OAuth error');
  }
}

/**
 * Single entry point for authenticated REST calls. Sends the standard GitHub
 * headers and throws on any non-2xx status. A `body` is JSON-encoded and adds
 * the matching Content-Type; omit it for GET/DELETE.
 */
async function apiRequest(
  endpoints: GitHubEndpoints,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const hasBody = body !== undefined;
  const response = await fetch(apiUrl(endpoints, path).toString(), {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed (HTTP ${response.status})`);
  }
  return response;
}

export async function fetchUserProfile(endpoints: GitHubEndpoints, token: string): Promise<UserProfile> {
  const user = await (await apiRequest(endpoints, token, 'GET', '/user')).json();
  let email: string | null = user.email ?? null;
  if (!email) {
    try {
      const emails: Array<{ email: string; primary: boolean }> = await (
        await apiRequest(endpoints, token, 'GET', '/user/emails')
      ).json();
      email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null;
    } catch {
      // Email stays null if the scope is missing or the endpoint fails.
    }
  }
  return {
    login: user.login,
    name: user.name ?? null,
    email,
    avatarUrl: user.avatar_url,
  };
}

interface ApiGist {
  id: string;
  description: string | null;
  public: boolean;
  created_at: string;
  updated_at: string;
  html_url: string;
  files: Record<string, { filename: string; language: string | null; size: number }>;
}

function toGistRecord(gist: ApiGist): GistRecord {
  return {
    id: gist.id,
    description: gist.description ?? '',
    files: Object.values(gist.files).map((f) => ({
      filename: f.filename,
      language: f.language,
      size: f.size,
    })),
    isPublic: gist.public,
    createdAt: gist.created_at,
    updatedAt: gist.updated_at,
    htmlUrl: gist.html_url,
  };
}

export async function fetchAllGists(endpoints: GitHubEndpoints, token: string): Promise<GistRecord[]> {
  const all: GistRecord[] = [];
  for (let page = 1; ; page++) {
    const response = await apiRequest(endpoints, token, 'GET', `/gists?per_page=100&page=${page}`);
    const batch: ApiGist[] = await response.json();
    all.push(...batch.map(toGistRecord));
    if (batch.length < 100) break;
  }
  return all;
}

interface ApiGistFile {
  filename: string;
  language: string | null;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

/**
 * Map the API's file map to our content shape, fetching the full body for any
 * file GitHub marked `truncated` (its inline `content` is clipped, so we pull
 * the whole thing from its raw URL). Shared by every endpoint that returns file
 * bodies: reading, creating, and updating a gist.
 */
function toFileContents(token: string, files: Record<string, ApiGistFile>): Promise<GistFileContent[]> {
  return Promise.all(
    Object.values(files).map(async (file) => ({
      filename: file.filename,
      language: file.language,
      content: file.truncated && file.raw_url ? await fetchRawContent(token, file.raw_url) : (file.content ?? ''),
    })),
  );
}

/**
 * Fetch a single gist's files, including their text content. The list endpoint
 * only returns file metadata, so this is called lazily when a gist is opened.
 */
export async function fetchGistFiles(
  endpoints: GitHubEndpoints,
  token: string,
  id: string,
): Promise<GistFileContent[]> {
  const gist: { files: Record<string, ApiGistFile> } = await (
    await apiRequest(endpoints, token, 'GET', `/gists/${encodeURIComponent(id)}`)
  ).json();
  return toFileContents(token, gist.files);
}

/** A single file to include in a new gist. */
export interface NewGistFile {
  filename: string;
  content: string;
}

/** The user-supplied data for creating a new gist. */
export interface NewGistInput {
  description: string;
  isPublic: boolean;
  files: NewGistFile[];
}

/**
 * Create a new gist on GitHub. Visibility is set here (`public`), since GitHub
 * only accepts it at creation time. Returns both the list-shaped record and the
 * file contents from the response, so the caller can seed the local caches
 * without an extra round-trip.
 */
export async function createGist(
  endpoints: GitHubEndpoints,
  token: string,
  input: NewGistInput,
): Promise<{ record: GistRecord; files: GistFileContent[] }> {
  const files: Record<string, { content: string }> = {};
  for (const file of input.files) {
    files[file.filename] = { content: file.content };
  }

  const created: ApiGist & { files: Record<string, ApiGistFile> } = await (
    await apiRequest(endpoints, token, 'POST', '/gists', {
      description: input.description,
      public: input.isPublic,
      files,
    })
  ).json();

  return { record: toGistRecord(created), files: await toFileContents(token, created.files) };
}

/**
 * A files patch for `updateGist`, keyed by the file's *current* name on GitHub.
 * An entry of `null` deletes that file; `{ filename }` renames it; `{ content }`
 * replaces its contents. A key not present on GitHub yet creates a new file.
 */
export type GistFilePatchEntry = { filename?: string; content?: string } | null;
export type GistFilePatch = Record<string, GistFilePatchEntry>;

export interface UpdateGistInput {
  description: string;
  files: GistFilePatch;
}

/**
 * Update an existing gist on GitHub (PATCH /gists/{id}). Returns the updated
 * record and file contents from the response, so the caller can refresh the
 * local caches without an extra round-trip. Note: visibility is intentionally
 * not sent — GitHub can't change it after creation.
 */
export async function updateGist(
  endpoints: GitHubEndpoints,
  token: string,
  id: string,
  input: UpdateGistInput,
): Promise<{ record: GistRecord; files: GistFileContent[] }> {
  const updated: ApiGist & { files: Record<string, ApiGistFile> } = await (
    await apiRequest(endpoints, token, 'PATCH', `/gists/${encodeURIComponent(id)}`, {
      description: input.description,
      files: input.files,
    })
  ).json();

  return { record: toGistRecord(updated), files: await toFileContents(token, updated.files) };
}

/** Permanently delete a gist on GitHub (DELETE /gists/{id}). */
export async function deleteGist(endpoints: GitHubEndpoints, token: string, id: string): Promise<void> {
  await apiRequest(endpoints, token, 'DELETE', `/gists/${encodeURIComponent(id)}`);
}

async function fetchRawContent(token: string, rawUrl: string): Promise<string> {
  const response = await fetch(rawUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch gist file content (HTTP ${response.status})`);
  }
  return response.text();
}
