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

## Status

Pipeline runnable via `pnpm scan` (dev) or `xscan` after build/link. All four vulnerability sources on by default; use `--skip-*` to exclude. Dependabot needs a token and remote repo (or git origin).

Completed: `docs/todo/DONE_GITHUB_SECURITY_SOURCE.md` (2026-06-27).

Pending validation: manual scan of `cv-justin-rankin-v1` — see `docs/todo/NEXT_STEPS.md`.
