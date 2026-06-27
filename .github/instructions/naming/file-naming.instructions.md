# File Naming & Organization Rules

## Naming

- Kebab-case for files: `item-summary.ts`.
- PascalCase for exported types/interfaces when appropriate.

## Extensions

- `.ts` for utilities and types.
- `.types.ts` for type-only files.
- `.constants.ts` for constants.
- `.utils.ts` for helpers.
- `.generated.ts` for generated files.

## Structure

```sh
src/
  utils/
    core.utils.ts
    extensions.utils.ts
  examples/
    complete-store-example/
      TodoContext.ts
      TodoProvider.tsx
      TodoTypes.ts
```

## Imports/Exports

- Prefer named exports; use `index.ts` barrels to simplify imports.

## Generated Files

- Add `🤖 AUTO-GENERATED`, timestamp, and “DO NOT EDIT MANUALLY”.

## Config Files

- Keep configs in project root (e.g., `tsdown.config.ts`, `oxlint.config.ts`, `oxfmt.config.ts`).
