# @finografic/deps-xscan

> Dependency-tree security scanner that analyses your real dependency graph against OSV, Node.js advisories, and GitHub security data to surface actual runtime risk.

## Installation

```bash
pnpm add -g @finografic/deps-xscan
```

## Usage

```bash
xscan                               # scan current directory
xscan --project ./my-app            # scan a specific project
xscan --verbose                     # show per-stage progress
xscan --no-cache                    # force fresh fetch of all data sources
xscan --format json --json-out report.json
xscan --dependabot                 # include Dependabot alerts (reads .env automatically)
xscan --github-repo owner/repo --dependabot
xscan --no-github                 # skip GitHub Advisory Database
```

## What it does

Unlike `npm audit`, `xscan` cross-references your resolved lockfile against multiple sources:

- **OSV.dev** — open vulnerability database, queried per resolved dep version
- **GitHub Advisory Database** — reviewed npm advisories (GHSA/CVE, CVSS, EPSS, CWE); enabled by default
- **Dependabot alerts** — optional repository-specific alerts with manifest path, scope, and fix target (`--dependabot`)
- **Node.js security blog** — recent release posts parsed for runtime CVEs matched against your engine version
- **Your actual dep tree** — distinguishes direct, transitive, and peer dependencies so you know what you can actually fix

## Options

```
--project <path>      Project root (default: cwd)
--cache-ttl <hours>   Cache TTL in hours (default: 24)
--no-cache            Disable caching
--format <type>       terminal | json | both (default: both)
--node-posts <n>      Number of Node.js security posts to check (default: 5)
--json-out <path>     JSON report output path
--verbose, -v         Detailed progress output
--no-github           Disable GitHub Advisory Database checks
--dependabot           Fetch Dependabot alerts for the repository
--github-repo <repo>  GitHub owner/repo for Dependabot (auto-detected from git remote)
--github-alert-states Comma-separated Dependabot states (default: open)
--github-token-env    Env var name(s) for GitHub token, comma-separated
```

`pnpm scan` in this repo is a dev shortcut — the globally linked **`xscan`** binary runs the same command.

### GitHub token

Token lookup is designed to work across projects without per-run `export`:

1. **Load `.env` / `.env.local`** from the scanned project root (`--project`, default: cwd). Existing shell env always wins — nothing in `.env` overrides an already-exported variable.
2. **Auto-detect** (when `--github-token-env` is omitted): `NPM_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN`.
3. **Explicit override**: `--github-token-env MY_PAT` or `--github-token-env VAR1,VAR2` for ordered fallbacks.
4. **File fallback**: set `GITHUB_TOKEN_FILE=/path/to/token` (useful in CI or secret managers).

Example `.env` in the project you are scanning:

```bash
NPM_TOKEN=ghp_...
```

Then:

```bash
xscan --project ~/repos/cv-justin-rankin-v1 --dependabot --verbose
```

No `export` prefix needed when the token lives in that project's `.env`.

- **GitHub Advisory Database** works without a token (rate limits apply); a token increases limits.
- **Dependabot alerts** require a token with **Dependabot alerts: read** (fine-grained) or `repo` / `security_events` (classic PAT).

### Cache

API responses are cached as hashed JSON files under `~/.config/finografic/deps-xscan/cache/` (XDG; honors `XDG_CONFIG_HOME`). Default TTL is 24 hours (`--cache-ttl`, `--no-cache` to bypass). This is separate from the scan **report** (`deps-xscan-report.json` in the project directory by default).

## Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | No Critical or High findings                           |
| `1`  | Critical or High findings found — useful for CI gating |
| `2`  | Fatal error (missing lockfile, network failure, etc.)  |

**Note:** Git hooks are automatically configured on `pnpm install`. See [docs/DEVELOPER_WORKFLOW.md](./docs/DEVELOPER_WORKFLOW.md) for the complete workflow.

## License

MIT © Justin
