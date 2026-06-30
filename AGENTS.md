# AGENTS.md — AI Assistant Guide

## Project Memory Model

- `docs/todo/ROADMAP.md` = milestone plan and completed history.
- `docs/todo/NEXT_STEPS.md` = near-term tasks and manual checks.
- `.agents/handoff.md` = stable current project state.
- `.agents/memory.md` = chronological session log.

Promote durable findings from memory → handoff, priorities → roadmap, and concrete follow-ups → next steps.

Reference: [`docs/process/PROJECT_MEMORY_MODEL.md`](./docs/process/PROJECT_MEMORY_MODEL.md)

---

## Roadmap and Planning Docs

- Check `ROADMAP.md` before proposing new initiatives.
- Use `NEXT_STEPS.md` for small follow-ups and manual validation.
- Keep detailed plans in `docs/todo/TODO_*.md`; graduate completed plans to `DONE_*.md`.
- Follow `.github/instructions/documentation/todo-done-docs.instructions.md`.

---

## Rules — Project-Specific

- Project-specific rules live in `.github/instructions/project/**/*.instructions.md`.
- Do not reference `@workspace/*` — all imports and deps must use published package names.

## Rules — Global

Rules are canonical in `.github/instructions/` — see `README.md` there for folder structure.
Shared across Claude Code, Cursor, and GitHub Copilot.

**General**

- General baseline: `.github/instructions/general.instructions.md`

**Code**

- TypeScript patterns: `.github/instructions/code/typescript-patterns.instructions.md`
- Modern TS patterns: `.github/instructions/code/modern-typescript-patterns.instructions.md`
- Oxlint & style: `.github/instructions/code/linting-code-style.instructions.md`
- Provider/context patterns: `.github/instructions/code/provider-context-patterns.instructions.md`
- Picocolors CLI styling: `.github/instructions/code/picocolors-cli-styling.instructions.md`

**Naming**

- File naming: `.github/instructions/naming/file-naming.instructions.md`
- Variable naming: `.github/instructions/naming/variable-naming.instructions.md`

**Documentation**

- Documentation: `.github/instructions/documentation/documentation.instructions.md`
- README standards: `.github/instructions/documentation/readme-standards.instructions.md`
- Agent-facing markdown: `.github/instructions/documentation/agent-facing-markdown.instructions.md`
- Feature design specs: `.github/instructions/documentation/feature-design-specs.instructions.md`
- TODO/DONE docs: `.github/instructions/documentation/todo-done-docs.instructions.md`

**Git**

- Git policy: `.github/instructions/git/git-policy.instructions.md`

---

## Rules — Markdown Tables

- Padded pipes: one space on each side of every `|`, including the separator row.
- **Do NOT manually align column widths or pad cells to equal width.** `oxfmt` (run automatically
  by lint-staged on commit and by `pnpm format:fix`) fixes table alignment automatically. Spending
  tokens counting characters and iterating on spacing is wasted effort — write the content, let the
  formatter handle alignment.

---

## Git Policy

- Do not include `Co-Authored-By` lines in commit messages.
- `.github/instructions/git/git-policy.instructions.md` (see Commits and Releases sections)

---

## Learned User Preferences

- Use `fix:` for runtime or behavior bugs only; use `chore:` for lint, typecheck, and tooling-only changes.
- Do not put implementation code in `index.ts`; reserve `index.ts` for barrel/index re-exports, with rare small folder/domain constants allowed when they belong to the public surface.
- Reserve `scripts/` for thin package.json runners (tsx); move application code into `src/` subfolders such as `lib/`, `commands/`, and `utils/`.
- Align Finografic CLIs with `@finografic/cli-kit` as the canonical pattern — do not vend local `src/core/` or follow stale CLI_CORE.md guidance.
- When oxlint flags intentional return-type-only generics, extend or suppress them rather than removing the type parameter.
- Store GitHub PATs as `NPM_TOKEN` in project `.env` files (not `GITHUB_TOKEN` — GitHub reserves that name).
- Summary badges with nested picocolors bg+fg need explicit ANSI via `summaryBadge()` — nesting resets fg before bg closes; `dim` does not dim backgrounds.
- Vulnerability sources use `--skip-{source}` flags only (not `--no-*`); all sources on by default. Avoid redundant CLI aliases; `--no-cache` is the sole cache opt-out.

## Learned Workspace Facts

- Scanner pipeline lives in `src/lib/` (five stages plus cache) and `src/commands/scan/`; CLI entry is `src/cli.ts` built to `dist/index.mjs` (`xscan`).
- Global binary is `xscan` (also `deps-xscan`); root `xscan` with no subcommand defaults to `scan`. `pnpm scan` is a dev shortcut in this repo only.
- CLI infrastructure uses `@finografic/cli-kit` subpaths (`flow`, `render-help`, `commands`) — not local `src/core/`; `@finografic/core` is unused (`CLI_CORE.md` removed).
- `demo/` is the in-repo standalone browser demo (Vite UI + unauthenticated `demo/api/` on :4001, `pnpm demo:dev`); spawns parent `dist/index.mjs`. Hosted two-host: GitHub Pages static UI (`.github/workflows/deploy-demo-pages.yml`, repo var `DEMO_API_BASE_URL` → `VITE_API_BASE_URL`) + Render scan API (`pnpm --dir demo start:api`, `PORT`, `NPM_TOKEN` only — not `VITE_*`). Pages first deploy needs one-time Settings → Pages → GitHub Actions (`configure-pages` `enablement: true` cannot create site via `GITHUB_TOKEN`).
- Demo GitHub suggestion repos must have a committed root `package-lock.json` or `pnpm-lock.yaml` for lockfile materialization.
- Dev-only stage runners live in `scripts/dev-*.ts` as thin wrappers around `src/lib/*`.
- All four vulnerability sources are on by default; use `--skip-osv`, `--skip-node-posts`, `--skip-github`, or `--skip-dependabot` to exclude one.
- Dependabot remote repository: `--remote-repo owner/repo` (auto-detected from git origin when omitted).
- GitHub token: load `.env`/`.env.local` from scanned project root; auto-detect `NPM_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN`; override via `--github-token-env` (comma-separated) or `GITHUB_TOKEN_FILE`.
- API cache: hashed JSON under `~/.config/finografic/deps-xscan/cache/` via `@finografic/cli-kit/xdg` `createXdgPaths()`; legacy `~/.deps-xscan-cache` migrates on first write. Finografic packages store config under `~/.config/finografic/` using subfolders when needed.
- Scan report (`deps-xscan-report.json` in scanned project, or `--json-out`) is distinct from API cache; exits non-zero when actionable findings exist (for CI/scripting).
- Lockfile anchors package/version resolution; findings merge OSV, GitHub Advisory, Node blog, and optional Dependabot. Supports pnpm/npm lockfiles only (not yarn yet).

---
