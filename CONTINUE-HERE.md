# PMZ Pricing Assistant — Continuation Guide

**Last Updated:** 2026-07-30  
**Status:** Shipped and working — the Next.js app builds, runs, and its fence tests pass.

---

## Current State

PMZ is a working Next.js application, not a scaffold in progress. The project is fully initialized, its dependencies are installed, the UI is built, and the app runs against its pinned local address. All development happens inside this `pmz/` folder.

- The Next.js app is built and running (App Router, TypeScript, Tailwind, UI component library in place).
- Dependencies are installed. After a fresh clone, run `npm install` once to restore `node_modules`.
- The dev server is pinned to port 3007 in `package.json` (the One-Address Rule, Law 45), so a bare `npm run dev` always serves there.
- The fence test suite passes (`npm test`).

**Do not run project-initialization commands in this repo.** The app already exists; re-initializing it would overwrite shipped work.

---

## Run It

From inside `pmz/`:

```powershell
npm run dev
```

The command serves the app at its pinned address (printed on startup). To run the fence tests:

```powershell
npm test
```

---

## Key Files

| File                  | Purpose                                      |
|-----------------------|----------------------------------------------|
| `PLAN.md`             | Full project design, architecture, and specs |
| `SETUP.md`            | The original run-it-yourself guide — historical; the app is already set up |
| `CLAUDE.md`           | Standing build instructions, conventions, and the One-Address Rule |
| `BOOK-OF-LAWS.md`     | The project's accumulated laws |
| `CONTINUE-HERE.md`    | This file — current state and entry point |
| `pmz-theme.css`       | The professional blue/gray theme (already applied to `app/globals.css`) |

---

## Where to Go Next

Open work lives in the project's specs and laws, not in setup. For current build state and next steps, see `CLAUDE.md`, `BOOK-OF-LAWS.md`, and the build-specific specs. This file no longer tracks scaffolding.

---

*Historical note: this file once tracked the project's initial scaffolding. That setup is long finished; the original steps are preserved in `SETUP.md` for history only and must not be run against the shipped repo.*
