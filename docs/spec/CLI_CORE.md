# CLI Core Module Spec

**Canonical copy:** This spec lives in the `@finografic/genx` repository at **`docs/spec/CLI_CORE.md`**. Treat this path as the **authoritative** description of `src/core/` for every `@finografic` CLI project. Temporary bulk-work or staging folders elsewhere are **not** canonical; they may hold scratch notes during migrations but must not replace updates here.

**Companion material:** Agent-oriented checklists and patterns are in `.github/instructions/project/` (for example `core-module-patterns.instructions.md` and `cli-help-patterns.instructions.md`). Those files stay short; this document carries the full module inventory, export tables, and TypeScript rules for `core/`.

**Applies to:** All `@finografic` CLI tool projects (`@finografic-genx`, `@finografic-gli`, and any new CLI projects scaffolded by genx).

---

## What is `src/core/`?

`src/core/` is the **portable infrastructure layer** of a `@finografic` CLI project. It contains modules that are:

- **Identical across all `@finografic` CLI projects** — any module in `core/` should be copyable verbatim into a new project and work without modification
- **Self-contained** — no imports from repo-specific path aliases (e.g. no `utils/*`, `config/*`, `commands/*`). Only `node:*` built-ins and `node_modules` packages
- **Infrastructure, not application logic** — `core/` holds the framework that application code builds on top of, not the application itself

Think of `src/core/` as the equivalent of a shared internal package — except it is kept in sync by convention rather than by a package manager.

> **AVOID EDITING `src/core/` FILES DIRECTLY** unless you intend to propagate the same change to all repos that share the module. Treat a `core/` edit the same way you would treat an edit to a shared dependency.

---

## Module Structure

Each module in `core/` is a **self-contained folder**:

```
src/core/
  {module-name}/
    {module-name}.utils.ts    # Implementation (optional — some modules are types-only)
    {module-name}.types.ts    # Types (optional — may live inline if small)
    index.ts                  # Barrel — the only public API surface
    {module-name}.test.ts     # Co-located tests (if applicable)
```

### Rules for module files

- **`index.ts` is required.** All external imports must go through the barrel. Never import directly from internal files of another module (e.g. `core/flow/flow.utils.js` from outside `core/flow/`).
- **Types co-located with implementation.** Do not put `core/` types in `src/types/`. If a type belongs to a `core/` module, it lives in that module's folder.
- **One responsibility per module.** A module exports one cohesive capability. If a module starts needing its own sub-modules, consider splitting.
- **No side effects on import.** `core/` files must not execute code at module load time beyond `const` value initialization.

### Naming conventions

- Folder name: `kebab-case` (e.g. `render-help`, `flow`)
- Implementation files: `{module-name}.utils.ts` for logic, `{module-name}.types.ts` for types if separated
- Barrel: `index.ts` (always, no exceptions)

---

## TypeScript Standards for `core/`

These standards apply specifically to `core/` files. They extend (and in some cases tighten) the project-wide TypeScript conventions.

### Function declarations, not arrow constants

Top-level functions must use the `function` keyword, not `const`:

```ts
// correct
export function renderHelp(config: HelpConfig): void { ... }

// wrong
export const renderHelp = (config: HelpConfig): void => { ... }
```

This applies to all exported and unexported module-level functions. Inline callbacks and object methods are exempt.

### Explicit return types

All exported functions must have explicit return types. Internal helpers should also have explicit return types.

### Named exports only

No default exports. All exports are named. The barrel `index.ts` re-exports using named export syntax.

### No repo-specific alias imports

`core/` files may only import from:

- `node:*` built-in modules
- Third-party packages from `node_modules` (e.g. `picocolors`, `@clack/prompts`)
- Other files within the same `core/` module (using relative `./` paths)

Never import from project aliases like `utils/*`, `config/*`, `commands/*`, `types/*`.

### Relative imports within a module use `.js` extension

```ts
// correct (within core/render-help/)
import type { HelpConfig } from './help.types.js';

// wrong
import type { HelpConfig } from './help.types';
```

### Picocolors

Import picocolors as a default import:

```ts
import pc from 'picocolors';
```

Never use the `utils/picocolors` ESM interop wrapper from within `core/`.

---

## Consuming `core/` from Application Code

Projects must add the `core/*` path alias to `tsconfig.json`:

```json
"paths": {
  "core/*": ["./src/core/*"]
}
```

External imports always go through the barrel:

```ts
// correct
import { renderHelp } from 'core/render-help';
import type { HelpConfig } from 'core/render-help';
import { createFlowContext } from 'core/flow';

// wrong — bypasses the barrel
import { renderHelp } from 'core/render-help/render-help.utils';
```

In projects that use `.js` extensions on imports (e.g. `moduleResolution: "bundler"` with explicit extensions):

```ts
import { renderHelp } from 'core/render-help/index.js';
import type { HelpConfig } from 'core/render-help/index.js';
```

---

## Current Modules

### `core/flow/`

**Purpose:** Typed adapter layer over `@clack/prompts`. Provides flag parsing and interactive prompts with a consistent resolution chain: flag value → yes-mode default → interactive prompt.

**Exports:**

| Export                                      | Kind     | Description                                             |
| ------------------------------------------- | -------- | ------------------------------------------------------- |
| `createFlowContext(argv, flagDefs)`         | function | Parse CLI argv into typed flags + yesMode               |
| `promptSelect(flow, opts)`                  | function | Single-selection prompt                                 |
| `promptText(flow, opts)`                    | function | Text input prompt                                       |
| `promptConfirm(flow, opts)`                 | function | Yes/no confirmation prompt                              |
| `promptMultiSelect(flow, opts)`             | function | Multi-selection prompt                                  |
| `promptAutocompleteMultiSelect(flow, opts)` | function | Autocomplete multi-select prompt                        |
| `FlowContext<F>`                            | type     | Result of `createFlowContext` — carries flags + yesMode |
| `PromptSelectOpts<T>`                       | type     | Options for `promptSelect`                              |
| `PromptTextOpts`                            | type     | Options for `promptText`                                |
| `PromptConfirmOpts`                         | type     | Options for `promptConfirm`                             |
| `PromptMultiSelectOpts<T>`                  | type     | Options for `promptMultiSelect`                         |
| `PromptAutocompleteMultiSelectOpts<T>`      | type     | Options for `promptAutocompleteMultiSelect`             |

**Resolution chain (all prompts):**

1. If an explicit flag matches (`flagKey`), resolve from it (optionally via `fromFlag`)
2. If `yesMode` is active (`-y`/`--yes`) and prompt is not `required`, use `default`
3. Otherwise, show the interactive prompt

**Usage pattern:**

```ts
import { createFlowContext, promptSelect, promptText } from 'core/flow';

const flow = createFlowContext(argv, {
  y: { type: 'boolean' },
  type: { type: 'string' },
  name: { type: 'string' },
});

const packageType = await promptSelect(flow, {
  flagKey: 'type',
  message: 'Select package type',
  options: PACKAGE_TYPES.map((t) => ({ value: t, label: t.label })),
});
```

**Dependencies:** `@clack/prompts`

---

### `core/render-help/`

**Purpose:** Typed CLI help system. Defines the `HelpConfig` data shape and renders it as formatted terminal output.

**Exports:**

| Export                      | Kind      | Description                                             |
| --------------------------- | --------- | ------------------------------------------------------- |
| `renderHelp(config)`        | function  | Render a `HelpConfig` to stdout with color              |
| `renderCommandHelp(config)` | function  | Render a `CommandHelpConfig` to stdout with color       |
| `HelpConfig`                | interface | Root type for a root-level help definition              |
| `HelpNote`                  | interface | A titled section with a label/description list          |
| `HelpNoteOptions`           | interface | Column width options for a `HelpNote`                   |
| `HelpMainNote`              | interface | The `main` header block                                 |
| `HelpNoteReturn`            | type      | Internal render tuple (rarely used externally)          |
| `CommandHelpConfig`         | interface | Root type for a per-command help definition             |
| `CommandHelpSection`        | interface | A custom section with a title and pre-formatted content |

**`HelpConfig` structure (root help):**

```ts
interface HelpConfig {
  main: {
    bin: string; // CLI binary name, e.g. 'gli'
    args?: string; // Optional args hint, e.g. '<command> [options]'
  };
  commands?: HelpNote; // Command listing section
  examples?: HelpNote; // Examples section
  footer?: HelpNote; // "Show help" / footer section
  minWidth?: number; // Minimum column width for alignment
}

interface HelpNote {
  title: string;
  list: Array<{ label: string; description: string }>;
  options?: HelpNoteOptions;
}
```

**`examples` section convention (root help):** `label` is the human-readable comment, `description` is the actual command string. They render as:

```
  gli live         # Start live PR dashboard
  gli status       # Snapshot of PR status (exits)
```

**`footer` section convention:** `label` is the text displayed (supports `<placeholder>` tokens rendered in dim cyan). `description` is an optional dim comment.

**Root help usage pattern:**

```ts
// src/cli.help.ts
import type { HelpConfig } from 'core/render-help';

export const cliHelp: HelpConfig = {
  main: { bin: 'gli', args: '<command> [options]' },
  commands: {
    title: 'Commands',
    list: [
      { label: 'live', description: 'Live-updating PR status dashboard' },
      { label: 'status', description: 'Show merge status of your open PRs' },
    ],
  },
  examples: {
    title: 'Examples',
    list: [{ label: 'Start live PR dashboard', description: 'gli live' }],
  },
  footer: {
    title: 'Show Help',
    list: [{ label: 'gli <command> --help', description: '' }],
  },
};

// src/cli.ts
import { renderHelp } from 'core/render-help';
import { cliHelp } from './cli.help.js';

renderHelp(cliHelp);
```

---

**`CommandHelpConfig` structure (per-command help):**

```ts
interface CommandHelpConfig {
  command: string; // Command name as displayed in the header, e.g. 'gli config'
  description: string; // Brief one-line description
  usage: string; // Usage pattern, e.g. 'gli config <subcommand>'
  subcommands?: Array<{ name: string; description: string }>;
  options?: Array<{ flag: string; description: string }>;
  examples?: Array<{ command: string; description: string }>;
  requirements?: string[]; // Rendered as a bulleted list
  howItWorks?: string[]; // Rendered as a numbered list
  sections?: CommandHelpSection[];
}

interface CommandHelpSection {
  title: string;
  content: string; // Pre-formatted string; printed as-is
}
```

**`examples` section convention (command help):** `command` is the exact invocation, `description` is the human comment. They render as:

```
  gli config add      # Add current directory
  gli config list     # Show all repos
```

Note: the column width is computed dynamically from the longest `command` string — no hardcoded padding.

**Section render order:** USAGE → SUBCOMMANDS → OPTIONS → EXAMPLES → REQUIREMENTS → HOW IT WORKS → custom `sections`.

**Per-command help usage pattern:**

```ts
// inside a command file (e.g. src/commands/config/config.command.ts)
import { renderCommandHelp } from 'core/render-help/index.js';

function printHelp(): void {
  renderCommandHelp({
    command: 'gli config',
    description: 'Manage multi-repo configuration',
    usage: 'gli config <subcommand>',
    subcommands: [
      { name: 'add', description: 'Add a repository to the config' },
      { name: 'list', description: 'List all configured repositories' },
    ],
    examples: [
      { command: 'gli config add', description: 'Add current directory' },
      { command: 'gli config list', description: 'Show all repos' },
    ],
  });
}
```

**Dependencies:** `picocolors`

---

### `core/file-diff/`

**Purpose:** Per-file unified diff display and confirmation prompt. Before any write operation, shows a coloured unified diff (`+` green, `-` red, `@@` cyan, `---`/`+++` bold) and asks the user to confirm: yes / skip / yes-to-all. Tracks yes-to-all state across multiple files in a single run.

**Exports:**

| Export                                                  | Kind      | Description                                                     |
| ------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| `createDiffConfirmState()`                              | function  | Create a fresh `DiffConfirmState` for a command run             |
| `renderFileDiff(filePath, current, proposed)`           | function  | Render a coloured unified diff to stdout (no prompt)            |
| `confirmFileWrite(filePath, current, proposed, state?)` | function  | Show diff + prompt; returns `DiffAction`                        |
| `DiffAction`                                            | type      | `'write' \| 'skip' \| 'write-all'`                              |
| `DiffConfirmState`                                      | interface | `{ yesAll: boolean }` — mutable; pass the same instance per run |

**Usage pattern:**

```ts
import { confirmFileWrite, createDiffConfirmState } from 'core/file-diff';

const diffState = createDiffConfirmState();

// For each file that would be written:
const currentContent = await readFile(filePath, 'utf8');
const proposedContent = formatContent(data);
const action = await confirmFileWrite(filePath, currentContent, proposedContent, diffState);
if (action !== 'skip') {
  await writeFile(filePath, proposedContent, 'utf8');
}
```

**Behaviour:**

- Returns `'skip'` immediately (no prompt) when `currentContent === proposedContent`.
- Renders the diff and returns `'write'` immediately (no prompt) when `state.yesAll` is true.
- When the user picks `'write-all'`, sets `state.yesAll = true` for subsequent calls.
- Treats a cancelled prompt (Ctrl-C) as `'skip'`.

**Dependencies:** `diff` (jsdiff), `@clack/prompts`, `picocolors`

---

## Adding a New `core/` Module

Before adding a module to `core/`, verify it meets all of the following:

- [ ] The module is useful in more than one `@finografic` CLI project (not project-specific logic)
- [ ] The module has no imports from repo-specific aliases
- [ ] The module has no side effects on import
- [ ] The module has a single clear responsibility

Then:

1. Create `src/core/{module-name}/` with at minimum `{module-name}.utils.ts` and `index.ts`
2. Add the `core/*` path alias to `tsconfig.json` if not already present
3. Write the barrel `index.ts` — export only what external consumers need
4. Add `⚠️ AVOID EDITING THIS FILE DIRECTLY` header comment to implementation files
5. Add the module to **`docs/spec/CLI_CORE.md`** (this file) under **Current Modules**
6. Propagate the module to all other `@finografic` CLI repos that benefit from it
7. Consider creating a genx skill for scaffolding the module into new projects

---

## Relationship to genx Skills

`core/` modules are candidates for genx skill automation. A skill can scaffold a new `core/` consumer (e.g. a new `cli.help.ts` using the `HelpConfig` pattern) or scaffold the module itself into a new project.

The existing **`scaffold-feature`** skill (`.github/skills/scaffold-feature/SKILL.md` in this repo) demonstrates the pattern: a skill references an instruction file, then applies it procedurally. Skills stay **procedural**; they link here for the full spec rather than duplicating it.

Skills tied to `core/` in this repository:

- **`scaffold-cli-help`** (`.github/skills/scaffold-cli-help/SKILL.md`) — Maintain `src/cli.help.ts` using the `HelpConfig` + `renderHelp` pattern
- **`scaffold-core-module`** (`.github/skills/scaffold-core-module/SKILL.md`) — Add or change modules under `src/core/`
