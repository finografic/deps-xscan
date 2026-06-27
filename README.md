# @finografic/deps-xscan

> Dependency-tree security scanner that analyses your real dependency graph against OSV and Node.js advisories to surface actual runtime risk.

## Installation

```bash
pnpm add -g @finografic/deps-xscan
```

## Usage

```bash
deps-xscan                          # scan current directory
deps-xscan --project ./my-app       # scan a specific project
deps-xscan --verbose                # show per-stage progress
deps-xscan --no-cache               # force fresh fetch of all data sources
deps-xscan --format json --json-out report.json
```

## What it does

Unlike `npm audit`, `deps-xscan` cross-references your resolved lockfile against three sources:

- **OSV.dev** — open, comprehensive vulnerability database, queried per resolved dep version
- **Node.js security blog** — last N release posts scraped and parsed for CVEs, matched against your engine version
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
```

## Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | No Critical or High findings                           |
| `1`  | Critical or High findings found — useful for CI gating |
| `2`  | Fatal error (missing lockfile, network failure, etc.)  |

**Note:** Git hooks are automatically configured on `pnpm install`. See [docs/DEVELOPER_WORKFLOW.md](./docs/DEVELOPER_WORKFLOW.md) for the complete workflow.

## License

MIT © Justin
