# Roadmap

> **This is the primary high-level plan for the project.**
> Check this file before proposing new work. Add new items when conceiving features.
> Keep it ordered by priority — move completed items to the Done section at the bottom.

---

## How to use this file

| Tier | Meaning                                   |
| ---- | ----------------------------------------- |
| P0   | Active — being worked on now              |
| P1   | Next — fully scoped, ready to start       |
| P2   | Planned — direction decided, detail TBD   |
| P3   | Backlog — good ideas, not yet prioritised |

When an item is done, move it to the Done section at the bottom with a completion date.

---

## Next

## Manual validation — GitHub sources

- [ ] Run `xscan --project <legacy-yarn-repo> --verbose` against `cv-justin-rankin-v1` with `NPM_TOKEN` in that repo's `.env` (Dependabot on by default)
- [ ] Confirm Dependabot findings match GitHub security digest (pbkdf2, webpack-dev-server, form-data, on-headers, tmp)
- [ ] Confirm `--skip-dependabot` still surfaces GitHub Advisory Database hits
- [ ] Verify `--skip-github` skips advisory queries in the Clack source list (shown gray as skipped)
- [ ] Verify `--remote-repo owner/repo` when scanning a temp directory without `.git`
- [ ] Verify token fallback: `NPM_TOKEN` in project `.env` without shell `export`

## Follow-ups

- [ ] Advisory Database batching/chunking for large lockfiles (currently per-package queries)
- [ ] JSON report source diagnostics (fetched/cached counts, auth status)
- [ ] Consider EPSS-based ordering within severity buckets

## P0 — Active

_Nothing active right now — pick from P1._

---

## P1 — Next Up

_No items queued — pick from P2 or backlog._

---

## P2 — Planned

_No items yet._

---

## P3 — Backlog

_No items yet._

---

## Done

| Item                                                         | Completed  | Plan                             |
| ------------------------------------------------------------ | ---------- | -------------------------------- |
| Add GitHub security source to consolidated dependency report | 2026-06-27 | `DONE_GITHUB_SECURITY_SOURCE.md` |
