# xscan browser demo

Standalone browser demo for `@finografic/deps-xscan`. Migrated from `monorepo-demo/apps/demo-xscan` and decoupled from portfolio auth/layout.

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

| Artifact                    | Host                                                     |
| --------------------------- | -------------------------------------------------------- |
| `pnpm build` → `demo/dist/` | GitHub Pages (`.github/workflows/deploy-demo-pages.yml`) |
| `pnpm --dir demo start:api` | Node host with `node-pty` (e.g. Render)                  |

### GitHub Pages

1. **One-time:** Repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (the workflow token cannot create the site automatically).
2. Repo **Settings → Secrets and variables → Actions → Variables**: set `DEMO_API_BASE_URL` to your scan API origin (no trailing slash), e.g. `https://deps-xscan-api.onrender.com`.
3. Push to `master` (or run **Deploy Demo Pages** manually). Site URL after deploy: `https://<org>.github.io/<repo>/`.

The workflow sets `VITE_BASE_PATH=/<repo>/` and bakes `VITE_API_BASE_URL` into the static build.

### Scan API (Render / other)

Set `NPM_TOKEN` on the API host. The API listens on `PORT` when provided (Render) or `DEMO_API_PORT` locally (default `4001`).

Set `VITE_API_BASE_URL` to the deployed API origin when the UI and API are on different hosts.

## API routes

- `GET /api/health` — liveness
- `GET /api/github-repo?repoUrl=…` — repository metadata
- `GET /api/scan?repoUrl=…` — SSE stream of xscan terminal output

## Package publishing

The embeddable React demo is published separately from the root CLI package:

- Root package: `@finografic/deps-xscan`
- Demo package: `@finografic/deps-xscan-demo`

Use the demo-specific scripts when the demo package itself changed:

```bash
pnpm demo:release:check
pnpm demo:release:github:patch
pnpm demo:release:github:minor
pnpm demo:release:github:major
```

The demo release scripts bump `demo/package.json`, commit that bump, create a standard `v*` tag, and push the commit
plus tag. The **Release Demo Package** workflow also listens to standard `v*` tags, but it checks GitHub Packages
before publishing. If the `demo/package.json` version already exists, the workflow skips the demo check and publish
steps instead of failing on a duplicate publish.

The demo package publishes to GitHub Packages and expects `NPM_TOKEN` / `NODE_AUTH_TOKEN` with `write:packages`
access.

After publishing, consumers can install:

```bash
pnpm add @finografic/deps-xscan-demo
```

Import the component and styles:

```tsx
import { DemoPage as XscanDemoPage } from '@finografic/deps-xscan-demo';
import '@finografic/deps-xscan-demo/app.css';
```

## Next steps

After publishing, replace the local `link:` dependency in `monorepo-demo/apps/demo-xscan` with the
published `@finografic/deps-xscan-demo` version.
