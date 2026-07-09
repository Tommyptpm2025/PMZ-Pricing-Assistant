# CLAUDE.md — PMZ Pricing Assistant

Standing instructions for Claude Code working in this repo. These apply **every session**. Tom (owner) drives and approves. Claude in chat is **Project Lead** (strategy, cross-session memory, methodology/brand vocabulary, diff review). You, Claude Code, are the **builder** — execute, police yourself, bank wins. The goal of this file is simple: let Tom spend attention on decisions, not on babysitting approvals.

## Project

- PMZ Pricing Assistant — a Next.js estimating tool for trade contractors.
- Primary file: `app/project-pricer/page.tsx` (~4,000 lines). Customer management: `app/customers/page.tsx`.
- PMZ = Profit Margin Zone. Stored rates are **true break-even cost** — no overhead, no profit, no markup.

## Approval tiers — what you may apply vs. what must stop

**Apply freely — no per-edit approval — then show ONE consolidated diff + a typecheck before committing:**
- Layout, CSS, styling, `className`/grid, labels, copy, and other purely-visual changes.

**Stop, show the diff, and WAIT for explicit approval before applying:**
- Anything touching values, math, cost/GP calculations, handlers (`onChange` / `onValueChange`), state, data models, or dropdown / business logic.
- Anything that reaches a **shared store** (e.g. the rate store) or affects **another surface** (e.g. Crew Builder).
- Any security-flagged, destructive, or irreversible command — deletes, history rewrites, force-push, permission changes.

When unsure which tier a change is, treat it as the second tier and stop.

## Engineering guardrails

- **Stay in scope.** A layout pass is layout-only — never change values, math, calc, handlers, or dropdown logic inside one. Logic changes are their own pass.
- **Typecheck every change.** Run the type checker; do not raise the file's existing error count. `project-pricer/page.tsx` currently carries ~50 pre-existing errors — don't add to them, don't try to "fix" them as a side quest, don't be alarmed by them.
- **Commit discipline.**
  - One concern per commit. Never bundle layout with logic, or either with unrelated work.
  - This repo carries **pre-existing uncommitted work in several files.** Before committing, run `git status` and `git show --stat` and confirm only the intended file(s) are included.
  - Stage surgically: `git add <path>`. Never `git add -A` or `git add .`.
  - Clear, scoped commit messages. Bank each working state.
- **Flag scope expansion.** If a change turns out to reach further than stated — a shared store, another component, more files than expected — stop and flag it before proceeding.
- **Plan first for anything structural.** Use Plan Mode; show the diff before applying.

## Local environment — ONE ADDRESS, ONE CABINET

- **The single address is `http://localhost:3007`.** Dev work, verification, and Tom's browser walks all happen there — one origin, one localStorage cabinet.
- **No parallel servers, ever.** Never stand up a second dev/prod server on another port (3000 or otherwise) for routine work. One running server at a time, on 3007.
- **Why:** localStorage is origin-scoped (`host:port`). Two servers = two separate data homes = split-brain builder data. On 2026-07-08 a full 26-key export/import migration was needed to reunite data that had been stranded under `:3000`. One address prevents a repeat.
- **Only exception:** a deliberate, temporary recovery server (e.g. to migrate stranded data), explicitly requested by Tom — killed the moment the recovery is verified.
- **Serving 3007:** `npm run build` then `npx next start -p 3007`. For a live-reload dev pass when needed, run dev *on 3007* (`npm run dev -- -p 3007`) — still one address.

## Locked conventions & vocabulary

- **Brand:** Profit Margin Zone (PMZ). **Never** "Performance Margin Zone."
- **Currency:** `formatMoney` = 2-decimal display with thousands separators. Rates round to the nearest cent **as the value, not just the display**, so numbers tie out (rate × qty = the shown cost).
- **Grid:** `LEM_GRID` is the shared column template for the per-line costing rows (Labor / Equipment / Material / Misc).
- **Costing:** per-line costing is **EPP-only** and does not affect Full LEM.

## Workflow

1. Tom brings a goal → Project Lead (Claude in chat) shapes it into a tight, scoped spec.
2. You execute it — plan structural work, show diffs, apply within the tiers above.
3. Bank each working state with a clear commit.
4. Tom loops Project Lead back in for the next fork, a major plan, a security gut-check, or end-of-session synthesis — **not** for every routine step.

Tweak this file anytime; changes take effect next session.
