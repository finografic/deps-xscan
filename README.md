# 🔒 @finografic/deps-xscan

> Dependency security xscan for Node.js projects.
> Scans your resolved lockfile dependency tree against:
>
> - OSV.dev
> - Node.js runtime advisories
> - GitHub Advisory Database
> - optional Dependabot alerts

![deps-xscan](./docs/deps-xscan.gif)

`xscan` is built for the gap between “this package exists somewhere in my tree” and “what should I actually do about it?”
It reports findings against the versions you have resolved, labels direct/runtime vs development/transitive exposure, deduplicates advisory sources, and emits CI-friendly exit codes.

## Features

- Parses the resolved dependency tree from `pnpm-lock.yaml` or `package-lock.json`.
- Queries **OSV.dev** for each resolved npm package version.
- Queries the **GitHub Advisory Database** by default.
- Optionally imports repository-specific **Dependabot alerts**.
- Checks recent **Node.js security release posts** against your project engine/runtime.
- Shows direct, transitive, peer, runtime, and development dependency context.
- Merges duplicate OSV/GitHub/Dependabot findings by GHSA/CVE identity.
- Produces terminal and JSON reports.
- Uses source-level spinners for long network fetches.
- Exits non-zero when Critical or High findings are present.

## Installation

This package is published to GitHub Packages.

```bash
pnpm add -g @finografic/deps-xscan
```

If your npm client is not already configured for the GitHub Packages registry,
add the registry and an auth token with package read access:

```ini
@finografic:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

The installed binary is:

```bash
xscan
```

## Quick Start

```bash
xscan                         # scan current directory
xscan scan                    # explicit scan command
xscan --project ./my-app      # scan another project
xscan --format terminal       # terminal report only
xscan --format json           # JSON report only
xscan --no-cache              # bypass API cache
```

## Security Sources

| Source                       | Enabled by default | Requires token | Purpose                                                                |
| ---------------------------- | ------------------ | -------------- | ---------------------------------------------------------------------- |
| OSV.dev                      | Yes                | No             | Open vulnerability database queried by resolved package version        |
| GitHub Advisory Database     | Yes                | No             | GitHub-reviewed npm advisories with GHSA/CVE, CVSS, EPSS, and CWE data |
| Dependabot alerts            | No                 | Yes            | Repository-specific alert state, manifest path, scope, and fix target  |
| Node.js security release log | Yes                | No             | Runtime advisories checked against the project Node.js version         |

GitHub Advisory Database checks work without authentication, though a token can
increase rate limits. Dependabot alerts require repository access.

## Usage Examples

Scan the current project with the default terminal and JSON output:

```bash
xscan
```

Write JSON to a custom path:

```bash
xscan --format json --json-out ./security/deps-xscan-report.json
```

Include Dependabot alerts for the current repository:

```bash
xscan --dependabot
```

Scan another repository and explicitly provide the GitHub owner/name:

```bash
xscan --project ~/repos/my-app --dependabot --github-repo owner/repo
```

Force fresh data and show verbose source logs:

```bash
xscan --no-cache --verbose
```

Disable GitHub Advisory Database checks:

```bash
xscan --no-github
```

## Options

| Option                           | Description                                                       |
| -------------------------------- | ----------------------------------------------------------------- |
| `--project <path>`               | Project root to scan. Defaults to the current working directory.  |
| `--cache-ttl <hours>`            | API cache TTL in hours. Defaults to `24`.                         |
| `--no-cache`                     | Disable cache reads/writes for this run.                          |
| `--format <type>`                | Output format: `terminal`, `json`, or `both`. Defaults to `both`. |
| `--node-posts <n>`               | Number of Node.js security posts to inspect. Defaults to `5`.     |
| `--json-out <path>`              | JSON report output path. Defaults to `deps-xscan-report.json`.    |
| `-v`, `--verbose`                | Show detailed per-source progress logs.                           |
| `--no-github`                    | Disable GitHub Advisory Database checks.                          |
| `--dependabot`                   | Fetch Dependabot alerts for the repository. Requires token.       |
| `--github-repo <owner/repo>`     | Repository for Dependabot alerts. Auto-detected from git origin.  |
| `--github-alert-states <states>` | Comma-separated Dependabot states. Defaults to `open`.            |
| `--github-token-env <names>`     | Comma-separated token env var names, checked in order.            |
| `-h`, `--help`                   | Show command help.                                                |

## GitHub Authentication

Token lookup is designed for local and CI usage without requiring an inline
`export` before every command.

Lookup order:

1. Load `.env` and `.env.local` from the scanned project root.
2. Use explicit names from `--github-token-env`, if provided.
3. Otherwise try `NPM_TOKEN`, then `GH_TOKEN`, then `GITHUB_TOKEN`.
4. If set, read a token from `GITHUB_TOKEN_FILE`.

Example `.env`:

```bash
NPM_TOKEN=ghp_...
```

Example scan:

```bash
xscan --project ~/repos/my-app --dependabot
```

Dependabot alerts require a token with one of:

- Fine-grained token: repository **Dependabot alerts: read**
- Classic token: `repo` or `security_events`, depending on repository visibility

The token value is never printed in reports.

## Reports

The terminal report groups findings by severity:

- `Critical`
- `High`
- `Medium`
- `Low`
- `Unknown`

Each finding includes the affected package, installed version, source IDs,
dependency path, fix version when known, advisory reference, and practical action
guidance. When GitHub enriches a finding, the report can also show EPSS, CWE,
manifest path, scope, and Dependabot alert URL.

The JSON report contains the same finding data plus the generated action summary.
By default it is written to:

```text
deps-xscan-report.json
```

## Exit Codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | No Critical or High findings                           |
| `1`  | Critical or High findings found, suitable for CI gates |
| `2`  | Fatal scan error                                       |

## Caching

API responses are cached as hashed JSON under:

```text
~/.config/finografic/deps-xscan/cache/
```

`XDG_CONFIG_HOME` is respected. The old `~/.deps-xscan-cache` location is
migrated on first write.

Use these flags to control cache behavior:

```bash
xscan --cache-ttl 6
xscan --no-cache
```

## Supported Projects

Current lockfile support:

- pnpm: `pnpm-lock.yaml`
- npm: `package-lock.json`

Node.js version detection checks, in order:

- `package.json` `engines.node`
- `.nvmrc`
- `.node-version`
- current runtime fallback

## Development

```bash
pnpm install
pnpm scan
pnpm typecheck
pnpm lint:ci
pnpm test:run
pnpm build
```

Useful dev shortcuts:

```bash
pnpm scan:verbose
pnpm scan:json
pnpm scan:no-cache
```

See [Developer Workflow](./docs/process/DEVELOPER_WORKFLOW.md) and
[Release Process](./docs/process/RELEASE_PROCESS.md) for project maintenance
details.

---

## License

MIT © [Justin Rankin](https://github.com/finografic)
