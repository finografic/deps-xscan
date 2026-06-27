---
name: dep-tree-scanner
description: >
  Skill for the `deps-xscan` CLI tool (@finografic/deps-xscan). Performs deep dependency
  security analysis by cross-referencing a project's actual lockfile dependency tree
  against Node.js security advisory blog posts, OSV.dev, and optionally Snyk. Goes far
  beyond `npm audit` by scraping the last N Node.js security release posts, extracting
  CVEs, categorizing them by type and severity, and matching them against every dep and
  peerDep in the lockfile — plus checking the project's Node.js engine version itself.

  Trigger this skill whenever the user wants to: run deps-xscan, audit dependencies for
  security issues, scan a lockfile for vulnerabilities, check if their Node.js version
  has unpatched CVEs, cross-reference deps against real-world advisories, or get a
  security posture report for a JS/TS project. Also trigger on: "dep scan", "dependency
  audit", "lockfile security", "Node.js CVEs", "vulnerability scan", or similar.
---

# dep-tree-scanner

Skill for `deps-xscan` — a published CLI tool (`@finografic/deps-xscan`) that performs deep
dependency security analysis by combining data sources that typical tools check in isolation.

## Package identity

```
package:   @finografic/deps-xscan
bin:       xscan
repo:      @finografic/deps-xscan
skill:     .github/skills/dep-tree-scanner/
```

## Repo structure (for reference)

```
deps-xscan/
├── src/
│   ├── cli.ts                        # CLI entry — routes commands via cli-kit
│   ├── cli.help.ts                   # Root HelpConfig (cli-kit render-help)
│   ├── commands/scan/                # Scan command (flow flags + pipeline)
│   └── lib/                          # Pipeline stages (lockfile, osv, correlate, …)
├── scripts/                          # Thin dev runners only (dev-*.ts)
└── docs/spec/
    └── severity-taxonomy.md          # Vuln categorization guide
```

## How to invoke

The tool is used as a global or project-local CLI bin:

```bash
# Global install
pnpm add -g @finografic/deps-xscan

# Run against a project
deps-xscan                                      # scans cwd
deps-xscan --project ./path/to/app              # specific project
deps-xscan --format json --json-out report.json # JSON only
deps-xscan --no-cache --verbose                 # fresh fetch, full logging
deps-xscan --node-posts 10                      # check last 10 Node.js security posts
```

## CLI flags

```
--project <path>      Project root — where the lockfile lives (default: cwd)
--cache-ttl <hours>   Cache TTL in hours (default: 24)
--no-cache            Disable caching entirely (forces fresh OSV + blog fetches)
--format <type>       Output: terminal | json | both (default: both)
--node-posts <n>      Number of Node.js security posts to scan (default: 5)
--json-out <path>     File path for JSON report output
--verbose, -v         Show per-stage progress
```

Cached API responses: hashed JSON under `~/.config/finografic/deps-xscan/cache/` (`XDG_CONFIG_HOME` respected). Default TTL 24h.

## Pipeline stages

### Stage 1 — Parse lockfile (`parse-lockfile.ts`)

Auto-detects `package-lock.json` (npm v2/v3) or `pnpm-lock.yaml`. Extracts every resolved
dependency including peerDeps as `{ name, version, isDirect, isPeer }`.

### Stage 2 — Detect Node.js version

Reads `.nvmrc`, `.node-version`, `package.json#engines.node`, or falls back to the
runtime's `node --version`.

### Stage 3 — Scrape Node.js security posts (`scrape-node-posts.ts`)

Fetches the last N posts from the Node.js vulnerability blog. Cached under `~/.config/finografic/deps-xscan/cache/` (hashed JSON files; TTL default 24h).
with a 24h TTL. Extracts CVEs, severity, affected version ranges, and vuln type.

**LLM integration point:** blog posts use inconsistent formatting across releases. Use the
LLM to parse ambiguous HTML sections and extract structured data. See the prompt template
in `docs/spec/severity-taxonomy.md` inside the repo.

### Stage 4 — Query OSV.dev (`query-osv.ts`)

Batch-queries `api.osv.dev/v1/querybatch` for all resolved deps. Results cached with the
same TTL. Falls back to individual queries if batch fails.

### Stage 5 — Correlate (`correlate.ts`)

Merges all sources: matches Node.js blog CVEs against the project Node version, matches
OSV results against resolved dep versions, deduplicates cross-source matches, categorizes
by severity and type.

### Stage 6 — Report (`report.ts`)

Outputs terminal (chalk-styled, grouped by severity, with upgrade paths) and/or JSON.
Exits with code `1` if any Critical or High findings — useful for CI gating.

## Orchestration instructions

When this skill is triggered:

1. Confirm the target project path (cwd is fine if the user is already in the project)
2. Check if `deps-xscan` is installed: `deps-xscan --version`
   - If not found: `pnpm add -g @finografic/deps-xscan`
3. Run the scan: `deps-xscan --project <path> --verbose`
4. If findings exist, parse the JSON report and synthesize a **risk summary**:
   - Lead with Critical and High, direct deps first
   - Note whether an upgrade path exists (`fixedIn` field)
   - Flag transitive vulns that require the direct dep to bump its own dependency
5. Offer to export JSON: `deps-xscan --format json --json-out deps-xscan-report.json`

## LLM integration points

Two stages benefit from LLM reasoning beyond the CLI itself:

1. **Blog post parsing** (Stage 3): when regex extraction yields incomplete results,
   the agent should pass the raw HTML excerpt to the LLM using the prompt template
   in `docs/spec/severity-taxonomy.md` inside the repo to extract structured vuln data.

2. **Risk prioritization** (after Stage 6): the CLI ranks by severity, but the LLM
   should add context — e.g. whether a transitive vuln is actually reachable given
   how the direct dep uses it, or whether the vulnerable code path is exercised in
   this project's usage pattern.
