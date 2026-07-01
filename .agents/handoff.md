# deps-xscan — Handoff

## Project

`@finografic/deps-xscan` — Multi-source dependency security scanner CLI. Cross-references a project's full resolved lockfile tree against Node.js security blog posts, OSV.dev, GitHub Advisory Database, and (optionally) Dependabot alerts. Goes beyond `npm audit` by scanning the full dep tree, checking the Node.js runtime version itself, and aggregating findings from multiple advisory sources.

Phase: core scanning pipeline + GitHub sources shipped; CLI wired via `@finografic/cli-kit` (`src/cli.ts` + `src/commands/scan/`).

## Architecture

Six-stage pipeline in `src/commands/scan/scan.logic.ts`:

1. **Parse lockfile** (`src/lib/lockfile.utils.ts`) — resolves all deps from pnpm/npm/yarn lockfile; detects Node.js version from `.nvmrc`, `engines`, or runtime
2. **Scrape Node.js security posts** (`src/lib/node-posts.utils.ts`) — recent vulnerability posts from `nodejs.org/en/blog/vulnerability`
3. **Query OSV.dev + GitHub Advisory Database** (parallel) — `src/lib/osv.utils.ts`, `src/lib/github-source.utils.ts`
4. **Fetch Dependabot alerts** (on by default; `--skip-dependabot` to disable) — repository-specific alerts via GitHub REST API
5. **Correlate** (`src/lib/correlate.utils.ts`) — matches CVEs/GHSAs across sources, deduplicates, merges GitHub metadata
6. **Report** (`src/lib/report.utils.ts`, `src/lib/report-summary.utils.ts`) — terminal output and/or JSON; exits non-zero on critical/high hits (CI-safe)

Supporting modules:

- `src/lib/env.utils.ts` — loads `.env` / `.env.local` from scanned project root (shell env wins)
- `src/lib/cache.utils.ts` — TTL disk cache in `~/.config/finografic/deps-xscan/cache/` (XDG via `@finografic/cli-kit/xdg`)
- `src/constants/security-sources.constants.ts` — source IDs and display labels
- `src/constants/source-endpoints.constants.ts` — API bases, GitHub headers, token env fallbacks
- `src/constants/source-limits.constants.ts` — page/batch sizes

CLI infrastructure uses **`@finografic/cli-kit`** (`flow`, `render-help`, `commands` types) — not local `src/core/`.

## Stack

- TypeScript (strict, ESM)
- pnpm
- tsdown (build → `dist/index.mjs` from `src/cli.ts`)
- `@finografic/cli-kit` for CLI consistency
- `tsx` for dev execution and thin `scripts/dev-*.ts` runners
- picocolors for terminal output
- vitest for unit tests

## CLI

Binaries: `xscan` (primary), `deps-xscan` (alias)
Package: `@finografic/deps-xscan`

```
xscan scan [options]     # explicit subcommand
xscan [options]          # bare flags imply scan

  --project <path>           Project root (default: cwd)
  --cache-ttl <hours>        Cache TTL in hours (default: 24)
  --no-cache                 Disable caching
  --format <type>            terminal | json | both (default: both)
  --node-posts <n>             Node.js security posts to scan (default: 5)
  --json-out <path>            JSON output file path
  --verbose, -v                Detailed progress
  --skip-osv                   Skip OSV.dev (on by default)
  --skip-node-posts            Skip Node.js security posts (on by default)
  --skip-github                Skip GitHub Advisory Database (on by default)
  --skip-dependabot            Skip Dependabot alerts (on by default)
  --remote-repo <owner/repo>   Remote repo for Dependabot (auto-detected from git remote)
  --github-alert-states        Comma-separated states (default: open)
  --github-token-env           Env var name(s) for token, comma-separated
```

### GitHub token

Loaded from the **scanned project's** `.env` / `.env.local`. Auto-detect: `NPM_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN`. File fallback: `GITHUB_TOKEN_FILE`. See README for details.

## Browser demo (`demo/`)

Standalone package `@finografic/deps-xscan-demo` — no monorepo `@workspace/*` deps, no auth.

| Piece       | Path / command                                                     |
| ----------- | ------------------------------------------------------------------ |
| Vite UI     | `demo/src/` — `ScanPane`, xterm terminal                           |
| Scan API    | `demo/api/` — `/api/health`, `/api/github-repo`, `/api/scan` (SSE) |
| Shared data | `demo/shared/` — suggestion repos, source toggles                  |
| Dev         | `pnpm demo:dev` — API :4001 + Vite :5173 (`/api` proxied)          |
| Build       | `pnpm --dir demo build` → `demo/dist/`                             |

The API spawns parent **`dist/index.mjs`** (root `pnpm build` required). Suggestion repos in `demo/shared/repos.ts` must have a committed root lockfile (`package-lock.json` or `pnpm-lock.yaml`).

## Deployment

Split static UI and scan API (Pages cannot run `node-pty`).

| Artifact     | Host                | Notes                                     |
| ------------ | ------------------- | ----------------------------------------- |
| `demo/dist/` | GitHub Pages        | `.github/workflows/deploy-demo-pages.yml` |
| `demo/api/`  | Render (or similar) | `node-pty` + `NPM_TOKEN`                  |

**GitHub Pages workflow** — triggers on `demo/**` or workflow changes on `master`; also `workflow_dispatch`. Build env: `VITE_BASE_PATH=/<repo>/`, `VITE_API_BASE_URL` from repo variable `DEMO_API_BASE_URL`. Does **not** use `enablement: true` on `configure-pages` — `GITHUB_TOKEN` cannot create a Pages site; one-time **Settings → Pages → Source: GitHub Actions** required before first deploy.

**Render API** (example: `deps-xscan-api.onrender.com`):

- Build: `pnpm install --frozen-lockfile && pnpm build`
- Start: `pnpm --dir demo start:api`
- Env: `NPM_TOKEN` only (no `VITE_*` on API host)
- Health check: `/api/health`
- Server reads `PORT` (Render) or `DEMO_API_PORT` (local default `4001`); binds `0.0.0.0` when `PORT` is set

Repo variable `DEMO_API_BASE_URL` = scan API origin, no trailing slash (set on `finografic/deps-xscan`).

Published site URL pattern: `https://finografic.github.io/deps-xscan/`

## Package releases

The repo publishes two packages:

| Package                       | Version source      | Release command                                |
| ----------------------------- | ------------------- | ---------------------------------------------- |
| `@finografic/deps-xscan`      | root `package.json` | `pnpm release:github:{patch,minor,major}`      |
| `@finografic/deps-xscan-demo` | `demo/package.json` | `pnpm demo:release:github:{patch,minor,major}` |

Both workflows listen to standard `v*` tags. The demo workflow checks whether the current
`demo/package.json` version is already published to GitHub Packages and skips demo publish if so. If a workflow fix is
needed, commit and push the fix, then create a new patch tag; rerunning an old failed tag can reuse the old workflow
definition.

## Status

Pipeline runnable via `pnpm scan` (dev) or `xscan` after build/link. All four vulnerability sources on by default; use `--skip-*` to exclude. Dependabot needs a token and remote repo (or git origin).

Completed: `docs/todo/DONE_GITHUB_SECURITY_SOURCE.md` (2026-06-27). Standalone `demo/` package + Pages deploy workflow (2026-06-27).

Pending validation: manual scan of `cv-justin-rankin-v1` — see `docs/todo/NEXT_STEPS.md`. First Pages deploy after one-time Pages source enable + successful workflow run.
