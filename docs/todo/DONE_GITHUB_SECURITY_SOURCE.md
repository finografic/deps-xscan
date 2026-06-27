# DONE — GitHub Security Source

> **Completed:** 2026-06-27 — GitHub Advisory Database (default on) and optional Dependabot alerts shipped in v0.4.x.

## Goal

Add GitHub as a third dependency-security source in `deps-xscan`, consolidated with OSV.dev and Node.js security blog findings.

This should cover two distinct GitHub security data surfaces:

- **GitHub Advisory Database** — public advisory data for npm packages, CVEs, GHSAs, vulnerable ranges, patched versions, CVSS, CWEs, and EPSS.
- **Dependabot alerts** — repository-specific alerts from GitHub's dependency graph, including affected manifest path, alert state, scope, and GitHub's suggested upgrade target.

## Source Model

### Source 1 — GitHub Advisory Database

Use this as the primary GitHub source because it can work without repository authentication.

- Endpoint: `GET /advisories`
- Base URL: `https://api.github.com`
- Filters:
  - `ecosystem=npm`
  - `affects=<package>@<version>`
  - `type=reviewed`
  - optionally `is_withdrawn=false`
- Batch strategy:
  - GitHub supports up to 1000 `affects` entries, but URLs can exceed client/server limits.
  - Chunk by URL length first, count second.
  - Start with conservative chunks of 50 to 100 package-version entries.
- Output value:
  - Independent GitHub-reviewed advisory source.
  - Better GHSA/CVE metadata, CVSS, CWEs, EPSS, and references.
  - Useful dedupe/enrichment for OSV findings.

### Source 2 — Dependabot Alerts

Use this as an optional repository-aware source because it requires GitHub repository context and permissions.

- Endpoint: `GET /repos/{owner}/{repo}/dependabot/alerts`
- Required auth:
  - Fine-grained token with repository **Dependabot alerts: read**, or
  - classic PAT with `security_events`; `public_repo` can be enough for public repositories.
- Default query:
  - `state=open`
  - `ecosystem=npm`
  - `per_page=100`
- Pagination:
  - Use cursor pagination with `before`/`after` plus `per_page`.
  - Do not implement new code around offset-style `page`, `first`, or `last` parameters.
- Optional query:
  - `scope=runtime|development`
  - `severity=low,medium,high,critical`
  - `manifest=<lockfile path>`
- Output value:
  - Confirms GitHub sees this specific repository as affected.
  - Adds manifest file path, alert URL, alert state, Dependabot scope, fixed-at/dismissed-at state, and upgrade target.

### Deferred GitHub Surfaces

Do not include these in the first implementation:

- Repository security advisories: useful for maintainers publishing advisories about their own package, not primarily for scanning dependency trees.
- Code scanning alerts: source-code findings, not dependency findings.
- Secret scanning alerts: secret exposure findings, not dependency findings.

These can become separate scanner modes later.

## Constants And Configuration

Centralize endpoints and source metadata under `src/constants/`.

Suggested files:

- `src/constants/security-sources.constants.ts`
  - source IDs: `osv`, `node-blog`, `github-advisory`, `github-dependabot`
  - display names
  - report colors/labels if needed
- `src/constants/source-endpoints.constants.ts`
  - `OSV_API_BASE`
  - `NODE_BLOG_VULN_FEED`
  - `GITHUB_API_BASE`
  - GitHub REST API version header
  - GitHub media type header
- `src/constants/source-limits.constants.ts`
  - OSV batch size
  - GitHub advisory chunk size
  - GitHub page size
  - URL length soft limit

Keep source-specific parsing in `src/lib/*.utils.ts`; constants only hold stable configuration.

## CLI Design

Add flags to `scan`:

- `--no-github`
  - disables GitHub Advisory Database checks.
- `--dependabot`
  - enables Dependabot alert lookup.
- `--github-repo <owner/repo>`
  - explicit repository for Dependabot alerts.
- `--github-alert-states <states>`
  - default `open`; supports GitHub states such as `open`, `fixed`, `dismissed`, `auto_dismissed`.
- `--github-token-env <name>`
  - default `NPM_TOKEN`, then `GH_TOKEN`, then `GITHUB_TOKEN`; override via `--github-token-env` (comma-separated names).

Default behavior:

- GitHub Advisory Database: enabled by default once stable.
- Dependabot alerts: disabled unless `--dependabot` is set and a token is available.
- If `--dependabot` is set but no repo/token is available, print a warning and continue with other sources.

Repository detection:

- If `--github-repo` is absent, parse `git remote get-url origin`.
- Support `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git`.
- Do not fail the scan if repo detection fails unless `--dependabot` was explicitly requested.

## Data Types

Add `src/lib/github-source.utils.ts`.

Suggested public types:

```ts
export interface GithubSecuritySourceOptions {
  packages: Array<{ name: string; version: string }>;
  repository?: string;
  token?: string;
  includeDependabotAlerts: boolean;
  alertStates: string[];
  cacheOpts: Partial<CacheOptions>;
}

export interface GithubSecurityResult {
  advisoryResults: GithubAdvisoryResult[];
  dependabotAlerts: GithubDependabotAlert[];
}
```

Normalize both GitHub data surfaces before correlation.

Each normalized vulnerability should include:

- `id`
- `aliases`
- `packageName`
- `packageVersion`
- `severity`
- `title`
- `description`
- `affectedVersions`
- `fixedIn`
- `references`
- `published`
- `modified`
- `cvssScore`
- `cvssVector`
- `epssPercentage`
- `cwes`
- `githubAlertUrl`
- `manifestPath`
- `alertState`
- `scope`

## Pipeline Changes

Current pipeline:

1. Parse lockfile.
2. Scrape Node.js security posts.
3. Query OSV.dev.
4. Correlate findings.
5. Generate report.

Target pipeline:

1. Parse lockfile.
2. Scrape Node.js security posts.
3. Query OSV.dev.
4. Query GitHub Advisory Database.
5. Optionally query Dependabot alerts.
6. Correlate findings.
7. Generate report.

Implementation detail:

- Run OSV and GitHub Advisory Database queries in parallel after lockfile parsing.
- Keep Node.js blog fetch independent because it checks runtime CVEs.
- Keep failure isolation per source: if GitHub fails, warn and continue with OSV/Node data.

## Correlation And Dedupe

Extend `Finding['sources']` to include:

- `github-advisory`
- `github-dependabot`

Dedupe priority:

1. Same GHSA ID.
2. Same CVE alias.
3. Same `packageName@installedVersion` plus overlapping vulnerable range.

When sources overlap:

- Merge sources.
- Keep highest severity.
- Prefer populated fixed version.
- Merge references.
- Add GitHub-specific fields if present:
  - `githubAlertUrl`
  - `manifestPath`
  - `alertState`
  - `scope`
  - `epssPercentage`
  - `cwes`

Report wording:

- If `github-dependabot` is present, highlight it as repository-confirmed.
- If only `github-advisory` is present, show it as advisory-database evidence.
- Show `Source: OSV.dev, GitHub Advisory Database, Dependabot` when merged.

## Report Changes

Terminal report:

- Add GitHub source labels.
- Add optional fields:
  - `Manifest: pnpm-lock.yaml`
  - `Scope: runtime|development`
  - `GitHub: https://github.com/.../security/dependabot/...`
  - `EPSS: 0.42%`
  - `CWE: CWE-22`
- Keep the current compact style; do not turn each finding into a wall of metadata.

JSON report:

- Preserve existing fields.
- Add GitHub fields only when populated.
- Add source-level diagnostics:
  - fetched count
  - cached count
  - skipped reason, if any
  - auth status for Dependabot alerts, without exposing token values

Action summary:

- Treat Dependabot-confirmed alerts as stronger evidence than public advisory matches.
- If Dependabot says `scope=runtime`, count it as runtime even if local dependency-path inference is ambiguous.
- Include Dependabot alert URL in recommendation detail.

## Caching

Use existing `src/lib/cache.utils.ts`.

Cache keys:

- `github-advisory-v1-${package}@${version}`
- `github-advisory-batch-v1-${hash(packages)}`
- `github-dependabot-alerts-v1-${owner}/${repo}-${states}-${scope}`

TTL:

- Use existing `--cache-ttl`.
- Respect `--no-cache`.

Avoid caching auth errors for long periods. Cache only successful responses and possibly short-lived rate-limit diagnostics.

## Auth And Rate Limits

Headers:

- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2022-11-28`
- `Authorization: Bearer <token>` when available

Token lookup:

1. Load `.env` / `.env.local` from scanned project root (`--project`).
2. Environment variable(s) from `--github-token-env` when set (comma-separated fallbacks).
3. Default auto-detect: `NPM_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN`.
4. Optional file: `GITHUB_TOKEN_FILE`.
5. No token required for public advisory database (rate limits apply).

Rate limit handling:

- If GitHub returns `403` or `429`, warn with source name and continue.
- Surface rate-limit status in verbose mode.
- Do not fail the entire scan unless GitHub is later made a strict mode.

## Tests

Add focused tests with mocked fetch:

- GitHub advisory parser maps GHSA, CVE, severity, ranges, fixed versions, CVSS, EPSS, CWE.
- Advisory Database chunking respects URL-length/count limits.
- Dependabot alert parser maps package, manifest, scope, alert state, fixed version, and alert URL.
- Correlation merges OSV and GitHub findings by GHSA.
- Correlation merges OSV and GitHub findings by CVE alias.
- GitHub failure returns empty source result and warning, without fatal scan exit.
- `--no-github` skips GitHub source.
- `--dependabot` without token warns and continues.

## Documentation

Update:

- `README.md`
  - list GitHub Advisory Database and optional Dependabot alerts as sources
  - document GitHub flags
  - document token requirements
- `docs/spec/severity-taxonomy.md`
  - note GitHub severity mapping and CVSS/EPSS fields
- `docs/todo/NEXT_STEPS.md`
  - add manual validation checklist after implementation

## Rollout Plan

### Phase 1 — Public GitHub Advisory Database

- [x] Add constants files (`security-sources`, `source-endpoints`, `source-limits`).
- [x] Add GitHub advisory client (`src/lib/github-source.utils.ts`).
- [x] Query by npm `package@version` (per-package; batch chunking deferred).
- [x] Normalize result.
- [x] Correlate with OSV (GHSA/CVE dedupe).
- [x] Add report source label.
- [x] Add tests.

### Phase 2 — Dependabot Alerts

- [x] Add GitHub repo detection.
- [x] Add token/env handling (`.env` from scanned project; `NPM_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN`).
- [x] Add `--dependabot`, `--github-repo`, `--github-alert-states`, `--github-token-env`.
- [x] Fetch open Dependabot alerts (cursor pagination).
- [x] Normalize and correlate alerts.
- [x] Add manifest/scope/alert URL to report.
- [x] Add tests.

### Phase 3 — Report Polish

- [ ] Add source diagnostics to JSON report (fetched/cached counts, auth status).
- [x] Improve action summary when Dependabot confirms runtime/dev scope.
- [x] Document token and flag usage in README.
- [x] Add manual validation checklist in `NEXT_STEPS.md`.

## Resolved Decisions

- GitHub Advisory Database: **enabled by default** (`--no-github` to disable).
- Dependabot alerts: **same exit-code rules** as other sources (non-zero on critical/high only).
- Dismissed alerts: **hidden by default** (`--github-alert-states` defaults to `open`).
- EPSS ordering: **not implemented**; severity bucket ordering unchanged.

## References

- [GitHub REST global security advisories](https://docs.github.com/en/rest/security-advisories/global-advisories)
- [GitHub REST Dependabot alerts](https://docs.github.com/en/rest/dependabot/alerts)
- [GitHub GraphQL security advisories](https://docs.github.com/en/graphql/reference/security-advisories)
- [GitHub Dependabot alerts overview](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts)
- [GitHub Dependabot alert pagination changelog](https://github.blog/changelog/2025-09-23-upcoming-changes-to-github-dependabot-alerts-rest-api-offset-based-pagination-parameters-page-first-and-last/)
