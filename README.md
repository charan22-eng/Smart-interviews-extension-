# DSA Practice Companion

A Manifest V3 Chrome extension for legitimate DSA / interview practice: store your
own solutions and reusable templates, search and filter them, track timed practice
sessions, and insert your saved code into a **practice editor that ships with
this repository**.

> **Scope and boundaries.** Code insertion targets only the controlled practice
> environment bundled in this project (`src/practice/`), or a copy of it that you
> serve yourself on `localhost`. This extension contains no functionality to
> bypass, disable, detect, evade, or interfere with any third-party assessment
> platform's security, proctoring, extension detection, or paste restrictions.

Full documentation is added in the documentation phase; see `DEVELOPMENT.md` for
the live build status of each component.

## Quick start

```bash
npm install      # installs the single devDependency (TypeScript)
npm run build    # type-checks, compiles, and assembles dist/
```

Then load `dist/` via `chrome://extensions` -> Developer mode -> Load unpacked.

## Tech stack

- TypeScript, compiled by `tsc` to native ES modules
- Chrome Extensions Manifest V3 (`chrome.storage.local`, runtime messaging, commands)
- No UI framework, no bundler, and **zero runtime dependencies**
- Tests: the Node built-in test runner (`node --test`)

## License

MIT
