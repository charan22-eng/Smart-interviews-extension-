# Development log

This file tracks what has actually been built, tested and pushed. An item is
marked complete only when it is implemented, covered by a test or an explicit
verification run, and pushed to `main`.

## Status

| Status | Item | Notes |
| --- | --- | --- |
| [x] | Repository audit | Repository was empty (no branches, no commits). Nothing to preserve. Record below. |
| [x] | Manifest and base project | MV3 manifest, strict TypeScript, zero-dependency build script, icon generator. |
| [x] | Types and domain models | Snippet, session, settings, store, insert payload; minimal `chrome` typings. |
| [x] | Storage service | Single `chrome.storage.local` key, schema validation, migrations, serialised writes. Unit tested. |
| [x] | Snippet model and manager | 13 fields, CRUD, duplicate, favourite, templates; options page editor. Unit tested. |
| [x] | Popup interface | Dashboard, Snippets, Practice, Statistics, Settings with loading / empty / error / success states. |
| [x] | Background service worker | Message routing, command handling, practice tab resolution, insert delivery. |
| [x] | Content script | Localhost-only, marker-gated bridge with FIFO acknowledgement and timeout. |
| [x] | Practice environment | Practice page with problem panel, editor, output panel, timer and status controls. |
| [x] | Code editor | Custom tokenizer, line-number gutter, language selector, tab handling, copy / clear / reset. |
| [x] | Controlled code insertion | Pure planner in `practice/insert.ts`, fail-closed validation, replace and append modes. Unit tested and browser verified. |
| [x] | Keyboard shortcuts | Three commands in the manifest, handled in the service worker. Not yet verified in a loaded extension. |
| [x] | Practice timer | Timestamp-based elapsed time so it survives popup close and page reload. Unit tested. |
| [x] | Practice history | Sessions with attempted / solved / failed status, notes, duration; delete and clear. Unit tested. |
| [x] | Statistics | Totals, solved / attempted / failed, time, difficulty and category breakdown, recent sessions. Unit tested. |
| [x] | Settings | Theme, default language, default sort, insert mode, tab size, confirmations, timer auto-start, origin. |
| [x] | Import and export | JSON export; import with merge or replace, validation and a summary. Unit tested. |
| [x] | Automated tests | 145 assertions, 28 suites, `node:test`, all passing as of commit `1a958ed`. |
| [x] | Security review | Permission review, safety-boundary scan, secret scan, DOM and evaluation review. Findings below. |
| [ ] | Browser verification | **Partial.** Practice page verified in Chromium (see log). Extension-context surfaces not yet verified. |
| [x] | Documentation | README and this log. |
| [x] | Final audit | Sweep for console noise, TODOs, secrets, listeners, permissions and dead exports. Findings below. |

## Phase 1: repository audit record

The target repository was audited before any code was written. Reading the root
tree failed with:

```
GET /repos/charan22-eng/Smart-interviews-extension-/git/ref/heads/main: 409
Git Repository is empty. []
```

`list_branches` returned `[]`. The repository had no branches, no commits and no
files, so nothing existed to preserve, migrate or refactor, and no existing
project conventions had to be followed.

## Architecture decisions

1. **No bundler.** TypeScript emits ES modules that Chrome loads directly.
   Fewer moving parts, no build-tool configuration to audit, and the shipped
   files map one-to-one to the source.
2. **No editor library.** Monaco and CodeMirror are large; highlighting and line
   numbers for five languages are a small tokenizer plus a scroll-synced overlay.
3. **One storage key with a write queue.** The popup, options page, practice page
   and service worker all mutate the same store, so writes are serialised to
   avoid lost updates.
4. **Timestamp-based timer.** Elapsed time is computed from stored start and
   pause timestamps rather than an interval counter, so closing the popup or
   reloading the page does not distort it.
5. **Localhost-only content script plus a page marker.** Two independent gates
   before the bridge installs, so the extension cannot act on third-party sites.
6. **Exactly one evaluator.** All code compilation lives in the sandboxed runner
   frame, enforced by a build-time scan of the output.
7. **Runs happen on a worker thread.** Added after browser verification; see
   bug 2 below.

## Bugs found and fixed

**1. Fail-open insert mode (found by a unit test, fixed in `94d7bd8`).**
`validateInsertPayload` coerced any unrecognised `mode` to `"replace"`, so a
malformed insert request would silently overwrite whatever was in the practice
editor. Unknown modes are now rejected with a user-facing error; an omitted mode
still defaults to `replace`.

**2. Runaway loop froze the practice tab (found by browser verification, fixed
in `473b779`).** The runner evaluated code on the sandboxed frame's own thread.
A sandboxed frame shares the renderer main thread with the page that embeds it,
so `while (true) {}` froze the whole tab and the page-side timeout never fired.
Verified in Chromium: no timeout message appeared within 15s, `evaluate()` went
unanswered, and the page never recovered. Runs now happen on a dedicated worker
thread that is terminated on overrun, with a fallback to the old path if a
browser refuses to start the worker.

**3. Build safety scan false positive (fixed in `02bdbed`).** The scan flagged
`utils/dom.ts` because its documentation comment named the HTML-injection APIs
it avoids. The comment was reworded rather than weakening the scan.

## Verification log

**Automated, executed locally**

- `npx tsc --noEmit`: clean.
- `npm run build`: manifest check (8 referenced files present) and static safety
  scan both pass.
- `node --test tests/*.test.mjs`: 145 pass, 0 fail, 28 suites (at commit
  `1a958ed`).

**Browser, executed in headless Chromium**

- Practice page served from `dist/` over `http://127.0.0.1`: page loads, ES
  modules execute, all 8 problems listed, problem metadata and test cases
  rendered, starter code loaded per language, line-number gutter matches the
  code, highlighting produces tokens, sandboxed runner executes a correct
  solution (4/4 cases), a wrong solution reports per-case failures, a thrown
  error is surfaced, a valid insert lands in the editor and is acknowledged,
  append mode preserves existing work, an unsupported insert mode leaves the
  editor untouched, a foreign channel is ignored, reset/clear/empty-run behave,
  non-JavaScript languages explain the limitation, and the local-mode notice
  disables timer and history actions. 18 of 22 checks passed; 3 failures were
  bug 2 above and the fourth was a `favicon.ico` 404 from the throwaway static
  server, which extension pages never request.
- Worker execution mechanism under the shipped sandbox CSP: blob worker starts
  and compiles code, returns correct values per case, captures `console.log`,
  reports thrown errors per case, explains a missing function, terminates a
  runaway loop (1503ms) while the page's heartbeat keeps ticking (15 ticks), and
  accepts further runs afterwards. 8 of 8 checks passed.

**Not verified in a browser**

- Popup and options pages, keyboard shortcuts, `chrome.storage` persistence, the
  service worker and the real content-script injection. These need the unpacked
  extension loaded in Chrome with an extension profile, which the development
  environment could not provide.
- The worker-based runner was type-checked and built successfully, and its worker
  mechanism was verified standalone in Chromium, but the full 22-check practice
  page run has not yet been repeated against the rebuilt page, and the unit test
  suite has not been re-run since that rewrite (no test covers the runner frame
  itself). Re-run both with `npm test` and `tests/browser/verify-practice.mjs`.

## Audit findings

- **Permissions:** `storage`, `tabs`; hosts limited to localhost and 127.0.0.1.
  No `<all_urls>`, `webRequest`, `declarativeNetRequest`, `scripting` or
  `debugger`.
- **Safety boundary:** no reference to any third-party assessment domain, no
  synthetic keyboard or clipboard events, no `document.execCommand`, no
  user-agent or `webdriver` tampering, no fingerprint or network interception.
- **Secrets:** no tokens, keys, `.env` files or credentials; `.gitignore` covers
  `node_modules/`, `dist/`, generated icons, logs, archives and key material.
- **Diagnostics:** the 9 `console.*` calls are all in the service worker, where
  they are the only way to see what happened.
- **No TODO, FIXME, HACK or XXX markers.**
- **Dead exports (open, disclosed rather than hidden):** a scan found exported
  symbols with no current caller, mostly types but some runtime helpers:
  `ThemePreference`, `PendingInsert`, `SESSION_STATUSES`, `optionalQuery`,
  `ToastKind`, `StorageArea`, `getStorageArea`, `SnippetNormalizeResult`,
  `SessionNormalizeResult`, `normalizeTimer`, `StoreNormalizeResult`,
  `LoadResult`, `replaceStore`, `applyPatch`, `SnippetFilters`, `ParsedBundle`,
  `ImportMode`, `mergeBundle`, `statsFromStore`, `ExtensionMessage`. They should
  be pruned or given callers; they are not a correctness problem but they are not
  zero either.
