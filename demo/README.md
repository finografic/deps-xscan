# xscan browser demo

Standalone browser demo for `@finografic/deps-xscan`. Duplicated from `monorepo-starter/apps/demo-xscan` and decoupled from portfolio auth/layout.

## Layout

```
demo/
├── api/       # Minimal Node HTTP service (no auth)
├── app/       # Vite + React UI (src/)
├── shared/    # Types and scan-source toggles
└── scripts/   # ensure-xscan-build.mjs
```

The demo API fetches public GitHub lockfiles, materializes a temp project, and spawns the local `xscan` build from the parent repo (`../dist/index.mjs`).

## Prerequisites

- Node.js ≥ 24
- `pnpm` at repo root (builds xscan automatically on first `pnpm dev`)
- Optional: `NPM_TOKEN` in repo root `.env` for GitHub API rate limits and Dependabot

## Development

From repo root:

```bash
pnpm demo:dev
```

Or from `demo/`:

```bash
pnpm install
pnpm dev
```

This starts:

- **API** on `http://127.0.0.1:4001` (`DEMO_API_PORT`)
- **Vite app** on `http://localhost:5173` (proxies `/api` → API)

## Environment

| Variable                                  | Default     | Purpose                              |
| ----------------------------------------- | ----------- | ------------------------------------ |
| `DEMO_API_PORT`                           | `4001`      | Scan API listen port                 |
| `DEMO_API_HOST`                           | `127.0.0.1` | Scan API bind address                |
| `VITE_API_BASE_URL`                       | _(empty)_   | Remote API origin for static deploys |
| `VITE_BASE_PATH`                          | `/`         | Asset base path (GitHub Pages)       |
| `DEMO_XSCAN_USE_CACHE`                    | off         | Set `true` to allow xscan disk cache |
| `NPM_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` | —           | GitHub API + Dependabot              |

## Production split

| Artifact                    | Host                              |
| --------------------------- | --------------------------------- |
| `pnpm build` → `demo/dist/` | Static (GitHub Pages, CDN)        |
| `pnpm start:api`            | Node host with `node-pty` support |

Set `VITE_API_BASE_URL` to the deployed API origin when the UI and API are on different hosts.

## API routes

- `GET /api/health` — liveness
- `GET /api/github-repo?repoUrl=…` — repository metadata
- `GET /api/scan?repoUrl=…` — SSE stream of xscan terminal output

## Next steps

Once stable here, publish `@finografic/xscan-demo` and replace `monorepo-starter/apps/demo-xscan` with a thin portfolio wrapper.
