# TODO and DONE Documentation Conventions

Rules for creating, maintaining, and graduating planning documents in `docs/todo/`.

---

## File Naming

| State                   | Prefix  | Example                    |
| ----------------------- | ------- | -------------------------- |
| Active — work remaining | `TODO_` | `TODO_TERMINAL_PANEL.md`   |
| Partially done          | `TODO_` | `TODO_OXLINT_MIGRATION.md` |
| Fully complete          | `DONE_` | `DONE_AGENT_LOOP.md`       |

Never delete completed docs. Rename `TODO_` → `DONE_` when **all** tracked work is done.
Keep `DONE_` files in `docs/todo/` as a permanent record.

---

## Status Header

Every file must open with a blockquote status line immediately after the `#` heading.

### Active TODO

```markdown
> **Status:** Not started.
```

```markdown
> **Status:** Phase 1 complete (2026-04-17). Phases 2–3 not started.
```

### DONE

```markdown
> **Completed:** 2026-04-16 — one-line summary of what was built.
```

Always use absolute ISO dates (`YYYY-MM-DD`), never relative ones ("last week", "recently").

---

## Title Line

Match the prefix to the file state:

```markdown
# TODO — Feature Name      ← active or partial
# DONE — Feature Name      ← fully complete
```

Update the title when renaming the file.

---

## Checkboxes for Phased Work

Use `- [ ]` / `- [x]` for any multi-step or multi-phase work. This is what determines
whether a file stays `TODO_` or graduates to `DONE_`:

- At least one `- [ ]` unchecked → file stays `TODO_`
- All items checked **or** no items exist and work is done → rename to `DONE_`

Group checkboxes under phase headings when the work has distinct phases:

```markdown
## Progress

- [x] Phase 1 — scaffolding done (2026-04-17)
- [ ] Phase 2 — audit rule coverage
- [ ] Phase 3 — replace ESLint in CI
```

---

## NEXT_STEPS.md

`docs/todo/NEXT_STEPS.md` is the maintained near-term working list. Rules:

- **References, never rewrites** ROADMAP.md items — link to them, don't duplicate descriptions
- Covers things too small for ROADMAP: manual testing checklists, code polish, small fixes
- Has a **Manual Testing Checklist** section with `- [ ]` items for recently shipped features
- Ordered by actionability — what to do _now_ at the top, longer-horizon below
- Update this file at the end of every significant session

---

## ROADMAP.md

`docs/todo/ROADMAP.md` is for large initiatives only (P0–P3 tier). Do not add small fixes,
manual testing tasks, or session-scoped tasks to ROADMAP. Those belong in `NEXT_STEPS.md`.

When a ROADMAP item is completed:

1. Move it to the `## Done` table at the bottom with a completion date
2. Rename its detail doc from `TODO_` → `DONE_` if one exists

---

## Graduation Checklist (TODO → DONE)

When renaming a file:

1. Rename file: `TODO_FOO.md` → `DONE_FOO.md`
2. Update title: `# TODO — Foo` → `# DONE — Foo`
3. Update status header: `> **Completed:** YYYY-MM-DD — summary`
4. Update any links in `ROADMAP.md` or `NEXT_STEPS.md` that point to the old filename
5. Move the item to the `## Done` table in `ROADMAP.md` if it was listed there
