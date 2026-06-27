# deps-xscan — Handoff

## Project

`@finografic/deps-xscan` — Multi-source dependency security scanner CLI. Cross-references a project's full resolved lockfile tree against Node.js security blog posts, OSV.dev, and (planned) GitHub Advisory Database. Goes beyond `npm audit` by scanning the full dep tree, checking the Node.js runtime version itself, and aggregating findings from multiple advisory sources.

Phase: core scanning pipeline implemented; CLI wired via `@finografic/cli-kit` (`src/cli.ts` + `src/commands/scan/`).

## Architecture

Five-stage pipeline in `src/commands/scan/scan.logic.ts`:

1. **Parse lockfile** (`src/lib/lockfile/`) — resolves all deps from pnpm/npm lockfile; detects Node.js version from `.nvmrc`, `engines`, or runtime
2. **Scrape Node.js security posts** (`src/lib/node-posts/`) — fetches recent vulnerability posts from `nodejs.org/en/blog/vulnerability`
3. **Query OSV.dev** (`src/lib/osv/`) — batch queries `api.osv.dev/v1` for each resolved dep
4. **Correlate** (`src/lib/correlate/`) — matches CVEs across sources, deduplicates, applies severity taxonomy
5. **Report** (`src/lib/report/`) — terminal output and/or JSON; exits non-zero on critical/high hits (CI-safe)

Cache layer (`src/lib/cache/`) — TTL-based disk cache in `~/.deps-xscan-cache`.

CLI infrastructure uses **`@finografic/cli-kit`** (`flow`, `render-help`, `commands` types) — not local `src/core/`.

## Stack

- TypeScript (strict, ESM)
- pnpm
- tsdown (build → `dist/index.mjs` from `src/cli.ts`)
- `@finografic/cli-kit` for CLI consistency
- `tsx` for dev execution and thin `scripts/dev-*.ts` runners
- picocolors for terminal output

## CLI

Binary: `xscan`
Package: `@finografic/deps-xscan`

```
xscan scan [options]     # explicit subcommand
xscan [options]          # bare flags imply scan (backward compatible)

  --project <path>      Project root (default: cwd)
  --cache-ttl <hours>   Cache TTL in hours (default: 24)
  --no-cache            Disable caching
  --format <type>       terminal | json | both (default: both)
  --node-posts <n>      Number of Node.js security posts to scan (default: 5)
  --json-out <path>     JSON output file path
  --verbose, -v         Detailed progress
```

## Status

Pipeline runnable via `pnpm scan` or `xscan` after build. Dev-only stage runners live in `scripts/dev-*.ts`.
