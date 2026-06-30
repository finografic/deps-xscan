# Next Steps

Near-term working list, manual testing, and small follow-ups.

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
