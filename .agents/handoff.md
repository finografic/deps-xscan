# deps-xscan — Handoff

## Project

`@finografic/deps-xscan` — Multi-source dependency security scanner CLI. Cross-references a project's full resolved lockfile tree against Node.js security blog posts, OSV.dev, and (planned) GitHub Advisory Database. Goes beyond `npm audit` by scanning the full dep tree, checking the Node.js runtime version itself, and aggregating findings from multiple advisory sources.

Phase: core scanning scripts implemented; CLI entry point scaffolded; formal `src/` command structure not yet built.

## Architecture

Five-stage pipeline in `scripts/orchestrator.ts`:

1. **Parse lockfile** (`scripts/parse-lockfile.ts`) — resolves all deps from pnpm/npm/yarn lockfile; detects Node.js version from `.nvmrc`, `engines`, or runtime
2. **Scrape Node.js security posts** (`scripts/scrape-node-posts.ts`) — fetches recent vulnerability posts from `nodejs.org/en/blog/vulnerability`, extracts CVEs with severity, type, and affected version ranges
3. **Query OSV.dev** (`scripts/query-osv.ts`) — batch queries `api.osv.dev/v1` for each resolved dep; returns `GHSA-*` and `CVE-*` IDs with severity and fix info
4. **Correlate** (`scripts/correlate.ts`) — matches CVEs across sources, deduplicates, applies severity taxonomy
5. **Report** (`scripts/report.ts`) — terminal output (coloured, boxed) and/or JSON; exits non-zero on critical/high hits (CI-safe)

Cache layer (`scripts/cache.ts`) — TTL-based disk cache in `~/.deps-xscan-cache`; configurable TTL (default 24h) or disabled via `--no-cache`.

## Stack

- TypeScript (strict, ESM)
- pnpm
- tsdown (build → `dist/`)
- `tsx` for running scripts directly during development
- picocolors for terminal output

## Schema / Types

| Type                | Location                       | Description                                                     |
| ------------------- | ------------------------------ | --------------------------------------------------------------- |
| `NodeVulnerability` | `scripts/scrape-node-posts.ts` | CVE extracted from Node.js blog post                            |
| `ScrapedPost`       | `scripts/scrape-node-posts.ts` | A single Node.js security release post with its vulnerabilities |
| `OsvVulnerability`  | `scripts/query-osv.ts`         | Vulnerability record from OSV.dev                               |
| `OsvQueryResult`    | `scripts/query-osv.ts`         | OSV results for a single package@version                        |
| `CorrelationResult` | `scripts/correlate.ts`         | Final merged findings across all sources                        |
| `Finding`           | `scripts/correlate.ts`         | A single correlated vulnerability finding                       |
| `CacheOptions`      | `scripts/cache.ts`             | TTL and disabled flag for the cache layer                       |
| `OutputFormat`      | `scripts/report.ts`            | `'terminal' \| 'json' \| 'both'`                                |

## CLI

Binary: `xscan`
Package: `@finografic/deps-xscan`

```
xscan [options]

  --project <path>      Project root (default: cwd)
  --cache-ttl <hours>   Cache TTL in hours (default: 24)
  --no-cache            Disable caching
  --format <type>       terminal | json | both (default: both)
  --node-posts <n>      Number of Node.js security posts to scan (default: 5)
  --json-out <path>     JSON output file path
  --verbose, -v         Detailed progress
```

## Decisions

1. CLI binary is `xscan` (not `deps-xscan`) for brevity at the command line (2026-06-27)
2. Package renamed from `@finografic/dep-scan` → `@finografic/deps-xscan` — fits `x` branding (genx), `deps-` prefix (deps-policy), and `x` alludes to x-ray / cross-source (2026-06-27)
3. Cache dir is `~/.deps-xscan-cache` (updated from old `.dep-tree-scanner-cache`) (2026-06-27)
4. Exit non-zero on critical/high findings — makes `xscan` CI-safe by default
5. Severity taxonomy defined in `docs/spec/severity-taxonomy.md` — CVSS-aligned, covers 25+ vulnerability types with keyword patterns for LLM extraction

## Open Questions

1. GitHub Advisory Database integration — third scanning source. Public REST API (`api.github.com/advisories`, no auth required for reads; token for higher rate limits) and GraphQL (`securityAdvisories` / `securityVulnerabilities`). Adds first-class GHSA coverage and richer metadata than OSV alone.

## Status

Core scanning pipeline is implemented and runnable via `pnpm scan`. CLI binary (`src/cli.ts`) and help screen (`src/dep-scan.help.ts`) scaffolded. Formal command structure in `src/` not yet built — scanner logic lives in `scripts/` for now.
