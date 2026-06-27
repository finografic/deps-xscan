---
name: scaffold-core-module
description: Extend @finografic/cli-kit (preferred) or migrate consumer CLIs off local src/core. Use when adding cli-kit subpaths or syncing portable CLI infrastructure across finografic CLIs.
trigger: User asks to add a core module, src/core, portable CLI infrastructure, flow, render-help, or sync core across finografic CLIs
tools: [file-read, file-edit, terminal]
---

# Scaffold / maintain portable CLI infrastructure

**Consumer CLIs (including deps-xscan):** use **`@finografic/cli-kit`** — do not add local `src/core/` copies. See **`@finografic/cli-kit/docs/spec/CLI_KIT.md`**.

This skill applies when **extending the cli-kit package itself** or migrating a legacy repo off vendored `src/core/`.

## Prerequisites

- The module is **useful in more than one** `@finografic` CLI project (not app-specific logic).
- No imports from repo aliases (`utils/*`, `config/*`, `commands/*`, `types/*`).
- No side effects on import (beyond `const` init).
- **Single** clear responsibility.

## Procedure — new module

1. **Choose a kebab-case folder name** under `src/core/{module-name}/`.

2. **Create files** (minimum pattern):
   - `{module-name}.utils.ts` — implementation (or types-only module if appropriate).
   - `index.ts` — **barrel only** public API; named re-exports, no default exports.

   Add `{module-name}.types.ts` and tests if needed per `docs/spec/CLI_CORE.md`.

3. **Implementation file header** (required on `*.utils.ts`):

   ```ts
   // ⚠️ AVOID EDITING THIS FILE DIRECTLY — changes must be propagated to all @finografic CLI repos
   ```

4. **TypeScript rules (core-only):**
   - Top-level functions: **`function` keyword**, not `const` arrow for exported module-level functions.
   - Explicit return types on exports (and internal helpers where practical).
   - **Named exports only** through the barrel.
   - Relative imports inside the module use **`.js` extensions** in import paths where the project uses that rule.
   - **Picocolors:** `import pc from 'picocolors'` — never `utils/picocolors` from `core/`.

5. **tsconfig:** ensure `"core/*": ["./src/core/*"]` exists under `compilerOptions.paths`.

6. **App code** imports only from barrels:

   ```ts
   import { createFlowContext } from 'core/flow';
   import type { HelpConfig } from 'core/render-help';
   ```

7. **Cross-repo workflow** (required for real `core/` changes):
   - Update **`docs/spec/CLI_CORE.md`** in genx (**Current Modules** / new section).
   - **Propagate** the same files (or a reviewed diff) to every `@finografic` CLI repo that ships that module.
   - Consider a **genx template** or feature so new scaffolds include the module if applicable.

## Procedure — edit existing module

- Assume changes may need **identical patches** in `genx`, `gli`, and any other consumer.
- Do not pull app-layer code into `core/` to “fix” a single repo.

## Related skills

- **scaffold-cli-help** — consumer of `core/render-help`; use when only changing `cli.help.ts` and not adding a new core package.

## Checklist (copy from `docs/spec/CLI_CORE.md`)

Before considering a module “done”:

- [ ] Useful across multiple CLI projects
- [ ] No repo-specific alias imports
- [ ] No import side effects
- [ ] Single responsibility
- [ ] Barrel `index.ts` present
- [ ] ⚠️ header on implementation files
- [ ] `core/*` path alias in `tsconfig.json`
- [ ] Documented in `docs/spec/CLI_CORE.md` (genx)
- [ ] Propagated to other repos as needed
