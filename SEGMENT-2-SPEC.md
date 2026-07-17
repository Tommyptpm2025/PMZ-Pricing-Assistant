# Segment 2 — Phase Drill-Down + Full-Screen Analyze

**Scoping spec · Draft for gavel · NO CODE until blessed · Stop before push · One commit per story**

> **Gavel status:** Calls 1, 2, 3, 4, 7 approved; Open Call 9 tail received and ruled (copy law
> below). **Call 5 is HELD — build does not start until it is gaveled.** See §Ruled and the restated
> Call 5 at the bottom.

Two stories on top of the shipped Profit Pipeline (Build F Rev 4):
- **Story A** — pipeline phase rows drill down to the jobs they contain, each job routing by tier.
- **Story B** — Analyze promoted from the side drawer to a full-screen ladder (layout 1a).

> **Input truncation flag:** the Part B brief ended on a dangling bullet after "Silent Killer strip
> on rung 3." — see **Open Call 9**. This spec assumes nothing beyond what was stated; confirm no
> Part B requirement was lost.

---

## 0. Laws this segment is checked against (from the repo's own Book)

- **Counted means visible** — "every phase with a nonzero count can expand to the jobs behind it"
  (`BUILD-F-PIPELINE-SPEC.md:122-123`). **Story A is this law made literal** — it is not new behavior,
  it is the drill-down the law already promised.
- **One birthplace** — the job list is the rollup's own `inPhase` set; surfaced, never re-filtered
  elsewhere (`lib/pipeline.ts:98`).
- **Vocabulary law** — job dollars in a phase carry that phase's label (bid value / contract value /
  Revenue); dead-lane and PLANNING never print "Revenue" (`BUILD-F-PIPELINE-SPEC.md:43-45`).
- **Iron guard** — drill-down lists per phase; no cross-phase or grand total is introduced.
- **Picker is CONFIRMED-only** (`BUILD-F-PIPELINE-SPEC.md:191-192`) — the tier-routing split *is* the
  guard: a PLANNING job structurally cannot reach the Money Map.
- **Earned numbers only** — a full-screen PLANNING Analyze stays a labeled projection (D5).

---

## Story A — Pipeline phase drill-down

### A.1 Data — retain the list the rollup already has
Today `rollPhase` computes `inPhase` then throws it away, returning only aggregates
(`lib/pipeline.ts:96-114`); `dead` is a bare count (`lib/pipeline.ts:121,128`).

- Add `jobs: PhaseJob[]` to `PhaseRoll` (`lib/pipeline.ts:76`) and `jobs` to `dead`
  (`lib/pipeline.ts:119-121`). `PhaseJob` = a **minimal projection** `{ id, name, value, status }`
  (name = `jobName || customerName || customer || "Untitled"`; value = `totalRevenue`). No new math,
  no re-filter — it is exactly the objects `inPhase`/dead already hold.
- **Tier of change:** Tier 2 (shared-lib data model) → stop/approve before code.
- **Fence extension (required):** `pipeline-fence.test.mjs` gains asserts that each phase's
  `jobs.length === count`, `jobs` ids match the seed's members, and the realized phase's `jobs` are
  exactly the `qualifyingQuotes` members — extending the reconciliation invariant to the list, not
  just the total.

### A.2 UI — expandable rows (`app/page.tsx` `PhaseRow:112`)
- Each **non-empty** phase row gains a disclosure control (chevron); expanding lists its jobs
  in place, one level deep. Empty phases keep the existing action line (`PHASE_EMPTY_ACTION`,
  `app/page.tsx:102`) and no expander.
- Each job line shows **name + its dollar, labeled with the phase's `moneyLabel`** (bid value /
  contract value / Revenue) — never a bare "Revenue" on a PLANNING row.
- Dead-lane row (`app/page.tsx:515-519`) becomes expandable too, listing its jobs.

### A.3 Routing per tier (the core of Story A)
- **CONFIRMED-phase job** (Ready to Invoice, Realized) → `setSelectedMapJobId(job.id)`
  (`app/page.tsx:228`) **+ scroll/focus the Money Map card**. Fully in-page (drill-down and Map both
  live on the Overview). Reuses the picker that already exists — no new lens computation.
- **PLANNING-phase job** (Bidding, Won·In Production) → **opens full-screen Analyze** for that quote
  (Story B). Cross-surface — see **A.4** and **Open Call 1/3**.
- **Dead-lane job** (Declined / Lost) → lists, **never routes to the Map, never touches Revenue
  vocabulary.** Whether it opens Analyze is **Open Call 2**.

### A.4 Cross-surface dependency
PLANNING and dead routing need an Analyze entry point reachable **from the Overview**. Analyze today
lives only on the Quotes page as a modal (`app/quotes/page.tsx:1658`). This couples Story A to Story
B's "where does Analyze live" decision (**Open Call 1**) and forces a **sequencing** decision
(**Open Call 3**).

---

## Story B — Full-Screen Analyze, layout 1a (Expandable Profit Ladder)

### B.1 Promote drawer → full screen
Current Analyze is a centered modal `Dialog` (`app/quotes/page.tsx:1658-1673`, `max-w-2xl`) wrapping
`MoneyMapLadderFull`. Layout 1a replaces it with a full-screen ladder.

- **Open Call 1 — where Analyze lives:** dedicated **route** (`/analyze/[id]`) vs **full-screen
  overlay component**. *Rec: route* — deep-linkable, opens cleanly from the Quotes row action AND the
  Overview drill-down, gives browser-back for free, no scroll-lock/z-index fights. Cost: a new page
  that loads the quote by id from `pmz_saved_quotes` + the overhead chart (same reads Analyze already
  does, `app/quotes/page.tsx:1092-1096`).

### B.2 Layout 1a structure
- **Net Profit hero band** across the top — the kept-money number, tier-badged. PLANNING label is
  **Open Call 7**.
- **Six stacked rungs** (Revenue/Bid Value · Direct COGS · Indirect COGS · Gross Profit · Overhead ·
  Net Profit). Tap a rung → it expands **breakdown / worked example / how-to-improve / glossary** in
  place. **One rung open at a time** (accordion) — differs from the current multi-open `Set`
  behavior in `MoneyMapLadderFull`.
- **Rung 1 label stays tier-aware** ("Revenue" CONFIRMED / "Bid Value" PLANNING) — already in
  `components/MoneyMapLadder.tsx` (`rung1Label`).
- **Silent Killer strip on rung 3** (Indirect COGS) — promote the existing inline "SILENT KILLER"
  badge into a full strip.

### B.3 Per-rung content model (new — the substantive lift)
Today each rung has ONE line of copy (`RUNG_INFO`, `components/MoneyMapLadder.tsx`). Layout 1a needs a
structured object per rung with **four slots**: `breakdown`, `workedExample`, `howToImprove`,
`glossary`.

- **Open Call 6 — worked example source:** static teaching copy vs **computed from this job's own
  numbers** (e.g. "your Indirect is $X = Y% of the job; trimming 5 pts frees $Z"). *Rec: computed
  where the number is already in the snapshot (one-birthplace, no new math); static teaching prose for
  the rest.*
- **Open Call 8 — content authoring owner:** the breakdown / how-to-improve / glossary prose is
  brand voice. Spec scaffolds the structure; copy is a fill-in by Project Lead. Confirm who writes it
  and whether placeholder copy is acceptable for the first commit.

### B.4 Shared-ladder question
`MoneyMapLadder` is deliberately shared by the Overview Money Map and Analyze (spec §3c). Layout 1a
diverges Analyze's ladder from the Money Map's.

- **Open Call 5 — does the Overview Money Map modal ALSO adopt layout 1a**, keeping one shared
  ladder — or does Analyze get a distinct full-screen ladder while the Money Map keeps its current
  modal? *Rec: build layout-1a as the shared expandable ladder and point both at it* (preserves the
  one-ladder principle; Money Map's compact-in-card view is unchanged). If they diverge, that's a
  conscious break of §3c to record.
- **Open Call 4 — accordion vs multi-open:** layout 1a is one-at-a-time. If the ladder is shared
  (Open Call 5 = yes), the Money Map modal's disclosure changes from multi-open to one-at-a-time too.
  Confirm that's acceptable.

### B.5 Tier & vocabulary in full screen
- CONFIRMED: rung 1 "Revenue", hero "Net Profit", badge CONFIRMED.
- PLANNING: rung 1 "Bid Value", badge PLANNING, **no "Revenue" anywhere**. Hero label = **Open Call 7**
  ("Net Profit" vs "Net Profit (Projected)"). Net Profit is not the reserved word, so either is
  vocab-legal; the question is honesty framing.

---

## Commits & sequencing

- **Story A = commit 1** — rollup `jobs` + fence extension + drill-down UI + routing.
- **Story B = commit 2** — full-screen Analyze route + content model + Silent Killer strip.
- **Open Call 3 — order:** Story A's PLANNING/dead routing needs Story B's Analyze entry point to
  exist. *Rec: land Story B first* (the `/analyze/[id]` route), so Story A routes to a real target;
  OR ship A's CONFIRMED→picker routing (no dependency) first and stub PLANNING→Analyze to the existing
  modal until B lands. Pick one so "one commit per story" stays clean.

---

## Ruled (Segment 2 gavels applied)

- **Call 1 — RULED:** Analyze is a **dedicated `/analyze/[id]` route** (full-screen).
- **Call 2 — RULED:** dead-lane job click **opens PLANNING Analyze** as a failed-bid post-mortem —
  still **never routes to the Map, never prints "Revenue."**
- **Call 3 — RULED:** **Story B ships before Story A** (A routes into B's route).
- **Call 4 — RULED:** the ladder is one-rung-open-at-a-time (accordion), applied wherever the shared
  ladder renders (contingent on Call 5's shared decision).
- **Call 7 — RULED (from 9a):** in **PLANNING tier the hero band reads "Projected Net Profit"** —
  never "Net Profit" unqualified. CONFIRMED tier reads "Net Profit."
- **Tier rule (9c):** tier is **derived from quote status only** (`tierOf`) — **never a user-facing
  toggle.** No control anywhere lets a user flip CONFIRMED/PLANNING.

### COPY LAW (9b — governs all Story-B teaching strings)

- **No new teaching string ships without the owner's approval.** The four per-rung content slots
  (breakdown / worked example / how-to-improve / glossary) are teaching strings under this law.
- **Killed:** the **10–15% net benchmark** — it appears in no teaching copy, ever.
- **Struck:** **"the truck payment"** from the Overhead teach line.
- *Status:* neither string exists in current shipped copy (verified) — this is a **never-add** rule,
  plus an approval gate on every new string. Supersedes/absorbs the old Open Call 8 (authoring).
- **Consequence for the build:** Story B ships the content *structure* with owner-approved copy only;
  any rung whose copy is unapproved renders its existing one-liner (`RUNG_INFO`) or a blank slot — it
  does **not** invent teaching prose.

## Still open

- **Call 5 — HELD (load-bearing).** Restated in full below; build does not start until gaveled.
- **Call 6 (secondary):** worked example computed-from-job vs static — still open, but gated by the
  copy law regardless. *(Rec: computed where the number is already in the snapshot.)*
- **Drill-down row disclosure (secondary):** independent multi-open rows vs one-at-a-time.
  *(Rec: independent — phases are a list, not an accordion.)*

---

## Call 5 — RESTATED IN FULL (held for gavel)

**The decision.** The Overview Money Map today has two layers: a compact ladder inside the card
(`MoneyMapLadderCompact`, always shown when a confirmed job exists) and a **"View Full Money Map &
Glossary" modal** (`MoneyMapLadderFull` + glossary, `app/page.tsx:579-624`). Story B makes Analyze a
full-screen `/analyze/[id]` ladder in layout 1a. **For a CONFIRMED job, the Money Map's full view and
Analyze show the same job's same CONFIRMED ladder.** Call 5 decides how far "one ladder, one source"
goes — component only, or the whole full-view experience.

**Sub-parts:**

- **5a — Shared component (low controversy):** the layout-1a expandable ladder (hero band, six
  accordion rungs, four-slot content model, Silent Killer strip) becomes the **single ladder
  component**, replacing `MoneyMapLadderFull`. Both surfaces render it. Your "one ladder, one source"
  reads as **yes.**
- **5b — Container for the Money Map's FULL view (the real fork):**
  - **Option A — Converge to the route.** "View Full Money Map" **navigates to `/analyze/[id]`** for
    the currently-picked confirmed job. There is exactly **one** full-screen ladder experience in the
    app; the Money Map just points at it. The Layer-2 modal is deleted.
    *Pros:* truest "one source" — the Map's full view and Analyze are literally the same screen and
    can never drift; less code. *Cons:* the full view **leaves the Overview** (a navigation), where
    today it's an in-page modal.
  - **Option B — Shared component, two containers.** The Money Map keeps its in-Overview modal but
    renders the layout-1a ladder inside it; Analyze is the route rendering the same component.
    *Pros:* full view stays on the Overview (no navigation). *Cons:* two full-view containers for the
    same content — "one ladder" but **not** "one experience"; a hero-band + full-screen layout shoe-
    horned into a modal; more code.
- **5c — Compact card ladder is unaffected** either way — `MoneyMapLadderCompact` stays on the
  Overview as the at-a-glance snapshot. Call 5 is only about the FULL view.
- **5d — Tier:** the Money Map is CONFIRMED-only, so its full view is always CONFIRMED ("Revenue" /
  "Net Profit"); Analyze may be either. The shared ladder already takes a `tier` prop — no conflict.

**Recommendation: Option A (converge to the route).** It is the literal "one ladder, one source":
one full-screen ladder, the Map points at it via the picked job's id, and the Layer-2 modal is
retired. It also makes the whole app converge on `/analyze/[id]` — Story A's CONFIRMED jobs reach the
Map picker (in-page), PLANNING/dead jobs reach `/analyze` directly, and the Map's own full view is
that same `/analyze`. One full-screen ladder, three doors.

**What flips on your gavel:** Option A retires the Money Map modal and turns "View Full Money Map"
into a navigation to `/analyze/[picked-id]`. Option B keeps the modal and shares only the component.
Either way the compact card ladder stays put.

---

**Build is HELD. Gavel Call 5 (Option A or B) and I ship Story B, then Story A — one commit each,
stop before push.**
