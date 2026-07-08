# [AGENTS.md](http://AGENTS.md)

Gister is a local-first GitHub Gist manager: a Tauri desktop app whose UI renders instantly from a local IndexedDB database (Dexie) and syncs with GitHub in the background via OAuth Device Flow. See `README.md` for architecture details.

## 1. System & Tech Stack

- **Language:** TypeScript ~6.0 (strict), ES modules (`"type": "module"`).
- **UI:** React 19 with Vite 8 (`@vitejs/plugin-react`).
- **App shell:** Tauri 2 in `src-tauri/`. Plugins: `tauri-plugin-http`, `tauri-plugin-opener`, `tauri-plugin-log`.
- **Local database:** Dexie 4 (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`). Dexie is the source of truth for persisted data.
- **Global state:** Zustand 5 (`src/store.ts`) — mirrors Dexie for synchronous access and holds runtime-only sync state.
- **Editor:** CodeMirror 6 via `@uiw/react-codemirror` (pinned exact at 4.25.10 together with its `@uiw/codemirror-`* companions — keep these versions in lockstep).
- **Design system:** Astryx (`@astryxdesign/core` + `@astryxdesign/theme-neutral`). Prefer Astryx components over hand-rolled UI.
- **Search:** fuse.js.
- **Icons:** react-icons.
- **Package manager:** pnpm ONLY. Never use npm or yarn. Consult .nvmrc for Node version to run.

## 2. Development & Build Commands

```bash
pnpm install --ignore-scripts   # install deps; lifecycle scripts are disabled on purpose
pnpm run dev                    # Vite dev server (browser only, no Tauri/Rust needed)
pnpm run tauri dev              # full desktop app (requires Rust toolchain)
pnpm run build                  # type-check (tsc -b) + production bundle (vite build)
pnpm run tauri build            # desktop binaries/installers
pnpm run lint                   # ESLint over the whole repo
```

- `pnpm run tauri dev` is sufficient for most UI work; use the preview gallery (below) instead of logging in.
- GitHub login needs `VITE_GITHUB_CLIENT_ID`: copy `.env.example` to `.env` and fill it in (or enter it on the login page).

## 3. Testing Workflow

There is **no automated test suite yet**. Do not invent test commands. Verification workflow for every change:

1. `pnpm run lint` — must pass with no new warnings.
2. `pnpm run build` — must pass; this is the type-check gate (`tsc -b`).
3. Manual check via the dev-only preview gallery (mock data, no GitHub, no real DB):

```bash
pnpm run dev
# open http://localhost:5173/#/preview
```

Routes: `#/preview/login`, `#/preview/login-code`, `#/preview/main`, `#/preview/main-syncing`, `#/preview/main-empty`, `#/preview/gist-detail`, `#/preview/gist-create`, `#/preview/gist-edit`, `#/preview/sidebar`. When you add a screen or a significant UI state, add it to `src/dev/PreviewGallery.tsx` (excluded from production builds).

If you introduce automated tests, use Vitest (native Vite integration), colocate files as `*.test.ts(x)` next to the source, mock GitHub at the `src/github.ts` boundary, and use `fake-indexeddb` for Dexie. Add a `test` script to `package.json` in the same PR.

## 4. Code Quality & Style Conventions

- **Formatting (Prettier,** `.prettierrc`**):** 120-char lines, 2-space indent, single quotes.
- **Naming (ESLint-enforced):** boolean variables must be prefixed `is`/`should`/`has`/`can`/`did`/`will` (e.g. `isSyncing`, `hasToken`). Components in PascalCase files (`GistDetail.tsx`); hooks/utilities in camelCase files (`useGistFiles.ts`, `codeLanguage.ts`).
- **Architecture:**
  - Presentational components (`src/components/`) render purely from props. Thin containers/pages (`src/pages/`) wire in the Zustand store and Dexie live queries.
  - Data flow: Dexie (`src/db.ts`) is the source of truth → Zustand (`src/store.ts`) mirrors it → components read via hooks. After any GitHub write, update the local Dexie cache immediately (see `saveCreatedGist`/`saveUpdatedGist`/`deleteGistLocal`) so the UI reflects changes before the next background sync.
  - All GitHub API calls live in `src/github.ts`; list sync logic in `src/sync.ts`. Do not call GitHub from components.
- **HTTP:** always use `fetch` from `@tauri-apps/plugin-http`, never the browser `fetch`, for GitHub traffic (device-flow endpoints lack CORS headers).
- **URLs:** construct with `new URL()` / `URLSearchParams`; never string concatenation. Enterprise host input is sanitized in `resolveEndpoints()` — follow that pattern for any user-supplied URL.
- **Dexie schema:** never edit an existing `db.version(n).stores(...)` block; add a new `db.version(n + 1)` with an upgrade path.
- **Comments/docs:** JSDoc on exported functions and non-obvious invariants only; no narration comments.
- **ESLint scope:** `dist`, `node_modules`, and `src-tauri` are ignored; React hooks and react-refresh rules are enforced.

## 5. Security & Constraints (Boundaries)

- **Never commit secrets.** `.env` is gitignored; only `.env.example` (with empty values) may be edited. The device-flow client ID is not a secret, but treat it as config, not code.
- **Token handling:** the GitHub OAuth token is stored in the Dexie `settings` table only. Never log it, never write it to disk or files, never embed it in URLs.
- **OAuth:** Device Flow only — there is deliberately no client secret in the binary. Do not introduce flows that require one.
- **Install safety:** always pass `--ignore-scripts` to `pnpm install`/`pnpm add`. `pnpm-workspace.yaml` enforces a minimum package release age — do not weaken it or extend `minimumReleaseAgeExclude` without explicit permission.
- **Do NOT modify or delete without explicit permission:**
  - `pnpm-lock.yaml` (only via pnpm commands, never by hand)
  - `src-tauri/Cargo.lock`, `src-tauri/gen/`, `src-tauri/capabilities/`
  - `.env`, `dist/`
  - Existing Dexie schema versions in `src/db.ts` (append-only, see above)
- **Rendering untrusted content:** gist contents are untrusted user data. Render via React bindings or CodeMirror only; never `dangerouslySetInnerHTML` or `innerHTML`. If raw HTML rendering ever becomes necessary, sanitize with DOMPurify first.

## 6. Git, Commit, and PR Guidelines

- **Branches:** `feat/<short-topic>`, `fix/<short-topic>`, `chore/<short-topic>` (kebab-case).
- **Commits:** Conventional Commits — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Imperative mood, subject <= 72 chars, body explains _why_ when non-obvious. One logical change per commit.
- **Pull requests:**
  - Title follows the same Conventional Commit format.
  - Description: short summary of what/why, plus a test plan (lint + build + which preview routes were checked).
  - Include screenshots for UI changes (the preview gallery makes this easy).
  - Keep PRs small and focused; update `README.md` when behavior or setup changes.
- Never force-push shared branches; never commit directly generated artifacts (`dist/`, Tauri bundles).

## 7. Opening PRs

If you are opening a PR, please add in the description of the PR as a first line the following text:

```
[AI Assisted PR - 🤖]
```

This will help with prioritizing the PR in the backlog and a faster review.
