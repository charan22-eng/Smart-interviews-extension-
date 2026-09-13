# Development progress tracker

An item is checked only after it has been implemented, type-checked, covered by
passing automated tests where practical, and pushed to `main`.

| Status | Item | Notes |
| --- | --- | --- |
| [x] | Repository audit | Repo was **completely empty** (no branches, no commits, no files). Nothing to preserve; no pre-existing build/lint/test commands to run. |
| [x] | Manifest | Manifest V3, minimal permissions (`storage`, `tabs`) + localhost host permissions only. |
| [ ] | Types / models | |
| [ ] | Storage service | |
| [ ] | Snippet service | |
| [ ] | Search / filter / sort | |
| [ ] | Timer service | |
| [ ] | Statistics service | |
| [ ] | Import / export service | |
| [ ] | Messaging contract | |
| [ ] | Background service worker | |
| [ ] | Content script | |
| [ ] | Popup UI | |
| [ ] | Options / settings page | |
| [ ] | Practice environment | |
| [ ] | Code editor | |
| [ ] | Practice problems | |
| [ ] | Controlled code insertion | |
| [ ] | Keyboard shortcuts | |
| [ ] | Practice history | |
| [ ] | Automated tests | |
| [ ] | Security review | |
| [ ] | Browser verification | |
| [ ] | Documentation | |
| [ ] | Final audit | |

## Audit record (Phase 1)

`GET /repos/charan22-eng/Smart-interviews-extension-/git/ref/heads/main` returned
`409 Git Repository is empty`, and `list_branches` returned `[]`.

Consequences:

- No framework, no Manifest version, no build system, no architecture existed.
- No `package.json`, so `install` / `lint` / `typecheck` / `test` / `build`
  could not be run against pre-existing code. Commands were not assumed - they
  were checked and found absent.
- No dead code, TODOs, placeholders, dependency problems, unused dependencies
  or security issues could be inherited.

## Architecture decision record

- **No bundler, no runtime dependencies.** Manifest V3 supports native ES
  modules in the service worker and extension pages, so `tsc` alone produces a
  loadable build. This avoids Vite/webpack config drift and keeps the supply
  chain empty (one devDependency: TypeScript).
- **No Monaco / CodeMirror.** Both are large (Monaco is several MB) and add MV3
  CSP friction. A textarea plus a synced highlight overlay and a line-number
  gutter satisfies the editor requirements in a few KB. Documented as a
  deliberate trade-off in the README.
- **Single storage key with a serialized write queue.** Prevents lost updates
  when the popup, options page and practice page write concurrently.
- **Timer persisted as timestamps.** Elapsed time is always derived, so it stays
  correct across popup close, page reload and service-worker suspension.
- **Content script scoped to `http://localhost/*` and `http://127.0.0.1/*` only**,
  and it additionally requires an opt-in marker element on the page before it
  does anything. There is no `<all_urls>` and no third-party assessment host.
- **One deliberate evaluator.** Running your own JavaScript in the practice page
  happens inside `practice/runner.html`, a manifest-declared sandboxed page with
  no extension API access and no DOM access to the practice page. Every other
  file is checked by the build to contain no `eval` / `new Function` /
  `innerHTML`.
