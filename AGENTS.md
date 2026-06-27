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
- Align column widths so all cells in the same column are equal width.

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

## Learned Workspace Facts

- Scanner pipeline lives in `src/lib/` (five stages plus cache) and `src/commands/scan/`; CLI entry is `src/cli.ts` built to `dist/index.mjs` (`xscan`).
- CLI infrastructure uses `@finografic/cli-kit` subpaths (`flow`, `render-help`, `commands`) — not local `src/core/`.
- `@finografic/core` is not used in this project; do not add it unless a specific utility need arises.
- `docs/spec/CLI_CORE.md` was removed as obsolete; the canonical CLI spec is `CLI_KIT.md` in the cli-kit repo.
- Dev-only stage runners live in `scripts/dev-*.ts` as thin wrappers around `src/lib/*`.

---
