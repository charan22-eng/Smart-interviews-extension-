# DSA Practice Companion

A Chrome extension (Manifest V3) for practising data-structures and algorithms
with **your own** saved solutions. You store snippets and templates you wrote,
search them, time your practice sessions, track solved / attempted / failed
problems, and insert a saved solution into a coding editor **on the practice
page that ships with this extension and runs on your own machine**.

## Scope boundary (please read first)

This project is a personal study tool. It deliberately does **not**:

- run on Smart Interviews, HackerRank, LeetCode, or any other assessment or
  proctored site (the manifest only matches `http://localhost/*` and
  `http://127.0.0.1/*`);
- attempt to bypass, disable, detect-proof or interfere with any anti-cheat,
  proctoring or extension-detection system;
- hide itself, spoof an extension fingerprint, or disguise its presence;
- simulate typing or keystrokes, or work around paste restrictions on
  third-party sites;
- auto-submit answers or bypass authentication or access controls.

Insertion works only on the bundled practice page, which identifies itself with
a `<meta name="dsa-practice-environment">` marker. Using it during a real
assessment would be cheating, and the extension gives you no way to do that.

## Features

**Snippet library**

- Create, edit, duplicate and delete snippets and reusable templates.
- 13 fields per snippet: title, language, difficulty, category, code,
  explanation, time complexity, space complexity, tags, notes, favourite,
  template flag, and timestamps.
- 5 languages (C++, Java, Python, JavaScript, C) and 19 categories.
- Full-text search across title, code, tags, notes and explanation.
- Filters (language, difficulty, category, snippet/template, favourites) and
  sorts (newest, oldest, recently updated, alphabetical, difficulty).

**Controlled practice environment**

- 8 bundled problems: Two Sum, Valid Parentheses, Binary Search, Maximum
  Subarray, Reverse Linked List, Valid Anagram, Climbing Stairs, Number of
  Islands. Each has a description, examples, constraints, difficulty, category,
  per-language starter code and test cases.
- Code editor with syntax highlighting, a line-number gutter, language
  selection, tab handling, and copy / clear / reset actions.
- Run and Test against the problem's cases, with per-case pass/fail output and
  captured `console.log` output.
- Per-problem, per-language drafts so switching around does not lose work.

**Practice tracking**

- Session timer that survives closing the popup and reloading the page, because
  elapsed time is derived from stored timestamps rather than a running interval.
- Mark a session solved, attempted or failed; each session records id, problem,
  language, start, completion, duration and status.
- Statistics: totals, solved / attempted / failed, time practised, solved by
  difficulty, category breakdown, most-practised category and recent sessions.

**Data and settings**

- Export everything to JSON; import with merge or replace.
- Settings for theme, default language, default sort, default insert mode,
  editor tab size, delete confirmation, timer auto-start and practice origin.
- Keyboard shortcuts for the snippet manager, the practice page and insertion.

## Architecture

```
Popup / Options  ──chrome.runtime──▶  Background service worker
                                              │
                                              │ chrome.tabs.sendMessage
                                              ▼
                                     Content script (localhost only)
                                              │ window.postMessage
                                              ▼
                                     Controlled practice page
                                              │ postMessage
                                              ▼
                                     Sandboxed runner frame
                                              │ worker thread
                                              ▼
                                     Your code, executed
```

```
src/
  background/   service worker: message routing, commands, tab handling
  content/      practice-bridge: localhost-only, marker-gated page bridge
  popup/        dashboard, snippets, practice, statistics, settings
  options/      full snippet manager, import/export, history tools
  practice/     practice page, problems, grading, highlighter, runner, insert
  services/     snippets, query, timer, stats, transfer, messaging
  storage/      chrome.storage.local area, schema/validation, repository
  utils/        constants, ids, time formatting, safe DOM helpers
  types/        domain models and a minimal chrome API typing
tests/          node:test suites (pure logic)
tests/browser/  Playwright verification of the practice page
```

Design points worth knowing:

- **One storage key, serialised writes.** All state lives under a single
  `chrome.storage.local` key and every write goes through a queue, so two
  surfaces cannot clobber each other.
- **Validation at the boundary.** Anything read from storage or received over a
  message is normalised and validated before use; unknown insert modes are
  rejected rather than guessed.
- **Evaluation is isolated.** Code you run is executed in a sandboxed extension
  page (opaque origin, no `chrome.*` access) on a dedicated worker thread that
  can be terminated. That is the only place in the project that compiles code.
- **DOM is built, not injected.** UI is created with `document.createElement`
  and `textContent`; the build fails if unsafe HTML-injection APIs appear in the
  output outside the sandboxed runner.

## Tech stack

- TypeScript (strict) targeting ES2022 modules
- Chrome Extension Manifest V3
- `node:test` for unit tests, Playwright + system Chromium for browser checks
- No runtime dependencies, no bundler, no UI framework, no editor library

The only devDependency is TypeScript. The editor uses a small custom tokenizer
instead of Monaco or CodeMirror: highlighting and line numbers for five
languages did not justify a multi-megabyte dependency in an extension bundle.

## Installation (from source)

```bash
git clone https://github.com/charan22-eng/Smart-interviews-extension-.git
cd Smart-interviews-extension-
npm install
npm run build
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run compile     # tsc
npm test            # typecheck + node:test suites
npm run build       # clean, compile, copy static files, icons, verify manifest
```

`npm run build` also runs a static safety scan over the build output and fails
if HTML-injection or code-compilation APIs appear anywhere except the sandboxed
runner.

## Production build

```bash
npm run build
```

Produces a loadable, unpacked extension in `dist/`:

```
dist/
  manifest.json
  assets/icon-{16,48,128}.png
  background/  content/  popup/  options/  practice/
  services/  storage/  utils/  types/
```

## Installing in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Pin the extension, then open the popup.

## Usage

1. **Add a snippet.** Open the popup and choose Snippets, or open the options
   page for the full editor with explanation, complexity, tags and notes.
2. **Open the practice page.** Popup -> Practice -> Open practice, or
   `Ctrl+Shift+P`.
3. **Solve.** Pick a problem, pick a language, write your solution, press Run
   or Test. JavaScript solutions are executed against the problem's cases.
4. **Insert your own saved solution.** Select a snippet in the popup and press
   Insert, or `Alt+Shift+I`. It lands in the practice editor only.
5. **Track it.** Start the timer, then mark the session solved, attempted or
   failed. Statistics update immediately.
6. **Back up.** Settings -> Export data, or the options page for import.

Default shortcuts (rebindable at `chrome://extensions/shortcuts`):

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+S` | Open the snippet manager |
| `Ctrl+Shift+P` | Open the practice page |
| `Alt+Shift+I` | Insert the selected snippet |

Insertion uses `Alt+Shift+I` because Chrome reserves `Ctrl+Shift+I` for
DevTools.

## Testing

**Automated (`npm test`)** — 145 assertions across 28 suites covering storage
validation and migrations, snippet CRUD, search/filter/sort, timer arithmetic,
statistics, import/export, message validation, problem definitions, the
tokenizer, the runner protocol and controlled insertion. These are pure-logic
tests: no browser and no code evaluation.

**Browser verification (on demand)**

```bash
npm run build
(cd dist && python3 -m http.server 8123) &
CHROMIUM_PATH=$(command -v chromium) node tests/browser/verify-practice.mjs
```

This drives the built practice page in Chromium and checks problem rendering,
the editor, real code execution, controlled insertion, rejection of malformed
and foreign messages, and recovery from a runaway loop. Popup, options,
shortcuts, storage persistence and the real content script need the unpacked
extension loaded in Chrome; see `DEVELOPMENT.md` for what has and has not been
verified.

## Security

- **Minimal permissions.** `storage` and `tabs` only. Host access is limited to
  `http://localhost/*` and `http://127.0.0.1/*`. No `<all_urls>`, no
  `webRequest`, no `scripting`, no `clipboardRead`, no `debugger`.
- **Content script is doubly gated.** It only loads on localhost, and it only
  installs its bridge when the page carries the practice-environment marker.
- **Messages are validated.** Sender, channel, origin, message shape and insert
  payload are all checked; malformed requests get an explicit error instead of a
  best guess, and an unknown insert mode never overwrites your editor.
- **Code execution is contained.** Your code runs in a sandboxed extension page
  with an opaque origin and no `chrome.*` access, on a worker thread that is
  terminated if it overruns. Nothing is fetched or executed from the network.
- **No unsafe DOM writes.** UI is constructed programmatically; the build fails
  if that changes.
- **No secrets.** No tokens, keys, `.env` files or analytics in the repository.

## Privacy

Everything stays in `chrome.storage.local` on your machine. The extension makes
no network requests, has no telemetry, no accounts and no remote code. Exports
are local files you create yourself.

## Limitations

- **Only JavaScript is executed.** C++, Java, Python and C snippets can be
  stored, highlighted, inserted, copied and timed, but the bundled runner cannot
  compile them. Running them would need a server, which this project does not
  have.
- **Runaway code is stopped, not prevented.** A run that exceeds the timeout is
  terminated on its worker thread; the page stays usable, but a solution that
  allocates until the browser is out of memory can still hurt the tab.
- **Import happens on the options page.** File pickers can close a popup, so
  bulk import lives on the options page by design.
- **The practice page is local-only.** Opened outside the extension (for example
  over `http://127.0.0.1`) it runs and grades code but shows a notice and
  disables timer and history actions, because `chrome.storage` is unavailable.
- **The bundled problem set is fixed** at 8 problems; user-defined problems are
  not implemented.
