# Build F — Profit Pipeline (accumulator + Money Map picker + Analyze)

**Scoping spec · Rev 4 · Owner-approved, building under the fence · Addendum of record to `BUILD-F-SCOPING.md`**

The last major Build F item: an accumulator that rolls saved jobs up **across the whole
pipeline, phase by phase** — not just the invoiced tier the Boss View already sums. Folded in
by owner ruling: **(a)** a job picker on the Money Map (point the lens at any confirmed job, not
only the latest), and **(b)** an **Analyze** action on the saved-quotes list that opens the
ladder for any quote, tier-labeled.

Audience: **owner / bookkeeper.** North star: **the owner's numbers reconcile with the
accountant's month-end report.** The realized total this surface shows must be the *same
number*, from the *same birthplace*, as the Boss View — and must tie to what the accountant
calls revenue.

## Why this exists (owner's intent — governs the design)

The Profit Pipeline is a **capacity-management and pricing-power tool**, not a reporting
curiosity. Its job is to make the schedule's fullness *visible so it changes pricing behavior:*

- **A full pipeline is pricing leverage.** When the phases ahead of Realized are stacked with
  work, new bids get priced at **higher margin** — the owner stops giving work away and stops
  taxing the crews to win jobs that aren't needed.
- **A thin pipeline is a scheduling signal**, not a reason to discount blindly — it says *fill
  the schedule properly*, with eyes open, rather than panic-bidding.
- **It informs future bidding.** The mix across phases (what's bid, what's won, what's
  confirmed, what's realized) is the context the owner prices the *next* job against.

Every design choice below serves that: the phases are the capacity view, the tiers keep planning
optimism from masquerading as booked money, and the reconciliation invariant keeps the whole
thing trustworthy enough to price against.

---

## 0. Governing laws (all untouchable — every section below is checked against these)

1. **Two-gate law** — **facts at Ready to Invoice**, **money at Invoiced.**
2. **One birthplace per number** — a number is computed in exactly one place; every surface reads it.
3. **No blending across tiers** — CONFIRMED and PLANNING never sum into one figure.
4. **Every number names its source.**
5. **Counted means visible** — if it rolls into a total, the owner can see the jobs behind it.
6. **Earned numbers only** — empty states name the action that earns them.
7. **Vocabulary law (ruled Rev 4)** — the word **"Revenue"** (and any total *labeled* revenue) is
   **RESERVED for Ready-to-Invoice and beyond.** Phases 1–2 use **"bid value"** (Bidding) and
   **"contract value"** (Won · In Production) — **never "revenue."**
8. **Iron guard (ruled Rev 4)** — PLANNING and CONFIRMED dollars **never sum into any shared
   total.** Per-phase subtotals only. **There is no grand total anywhere on this surface.** Enforced
   in code (the rollup exposes no combined field) and asserted in the fence.

Already codified in the repo (the spec builds on these, does not reinvent them):
- `lib/qualifying.ts` → `REALIZED_STATUSES = {Invoiced, Paid, Completed}` + `qualifyingQuotes()` +
  `salesFromInvoiced()`. **This is the money gate and the earned-sales birthplace.**
- `app/page.tsx:72` → `MAP_CONFIRMED_STATUSES = {Ready to Invoice, Invoiced, Paid, Completed}`.
  **This is the facts gate — but it lives locally on the Overview page, not in a lib.** (See §2.)
- `lib/pmz-types.ts` → `QuoteStatus`, `STATUS_ORDER`, `STATUS_COLORS` (the three locked zones:
  Office/Sales, Operations, Finance), per-quote money fields
  (`totalRevenue`, `directCogsDollars`, `indirectCogsDollars`, `grossProfitDollars`).

---

## 1. Pipeline phases — what qualifies a job into each

Four phases, in forward order. The **two gates are the boundaries between them.** Membership is by
stored `QuoteStatus` (stable values, never the display label).

| # | Phase (working name) | Stored statuses | Tier | Dollar label (vocab law) | Numbers are… |
|---|---|---|---|---|---|
| 1 | **Bidding** | `Draft`, `Ready for Approval` | **PLANNING** | **"bid value"** | your **bid** (projected) |
| 2 | **Won · In Production** | `Approved`, `Scheduled`, `In Progress` | **PLANNING** | **"contract value"** | **contracted** (still projected cost) |
| — | ══ **FACTS GATE** — foreman has confirmed real costs ══ | | | | |
| 3 | **Ready to Invoice** | `Ready to Invoice` | **CONFIRMED (facts)** | **"Revenue · contracted, awaiting invoice"** | **foreman-confirmed cost**, revenue **not yet money** |
| — | ══ **MONEY GATE** — revenue is realized ══ | | | | |
| 4 | **Realized** | `Invoiced`, `Paid`, **`Completed`** (legacy) | **CONFIRMED (money)** | **"Revenue · realized"** | **earned** — the accountant's revenue |
| — | **Dead lane** (not in the forward pipeline) | `Declined`, `Lost` | — | — | excluded from all pipeline totals |

**`Completed` is explicitly a phase-4 (Realized) member (ruling, Rev 4).** It is a retired legacy
status, but any quote persisted under it *is* realized money and must count — it is already in
`REALIZED_STATUSES = {Invoiced, Paid, Completed}`. Counted means visible applies to the spec table
itself: phase 4 = **`Invoiced`, `Paid`, `Completed`**, stated in full, never as an implied "et al."

**Tier mapping — exact, and identical to the existing sets:**
- **PLANNING** = phases 1–2 = *not in* the facts gate = `{Draft, Ready for Approval, Approved, Scheduled, In Progress}`.
- **CONFIRMED** = phases 3–4 = the facts gate = `MAP_CONFIRMED_STATUSES` = `{Ready to Invoice, Invoiced, Paid, Completed}`.
- **Money / earned** = phase 4 *only* = `REALIZED_STATUSES` = `{Invoiced, Paid, Completed}`.

The facts gate is exactly the money gate **plus `Ready to Invoice`** — the one status that is
CONFIRMED-fact but not-yet-money. That single-element difference is the two-gate law made literal.

So the owner's tier rule — *"CONFIRMED at Ready-to-Invoice+, PLANNING below it"* — maps 1:1 onto
`MAP_CONFIRMED_STATUSES`. And the money gate sits *one step inside* the CONFIRMED tier: **phase 3
is CONFIRMED but not yet money.** That single fact (§Decision D4) is the sharpest edge of the whole
build and the thing the two-gate law exists to protect.

---

## 2. How jobs accumulate and roll up

**One birthplace.** A new `lib/pipeline.ts` owns the phase definitions and the rollup. It does **not**
redefine the gates — it **imports** them so the numbers are physically the same set:
- Phase 4 membership = `REALIZED_STATUSES` imported from `lib/qualifying.ts` (unchanged).
- The facts gate `MAP_CONFIRMED_STATUSES` **moves out of `app/page.tsx` into this lib** as the
  single facts-gate home; the Money Map then imports it instead of declaring its own. (Today it's a
  local const on the Overview page — a one-birthplace violation waiting to happen the moment the
  Pipeline needs the same set. Move it once, both read it.)

**The rollup shape** (per phase, summed over that phase's quotes):
```
PhaseRoll = { statuses, tier, count, revenue, directCogs, indirectCogs, gross }
```
Sums reuse the exact per-quote fields the Boss View already sums (`totalRevenue`,
`directCogsDollars`, `indirectCogsDollars`) — no new math, no recompute.

**Law compliance baked into the rollup:**
- **No blending:** phase totals are *never* added across tiers. There is no single "pipeline grand
  total." The realized number and the planning number are separate figures on separate rows.
- **Names its source:** each phase row carries its tier badge + a source clause — "from your bids"
  (1), "contracted work" (2), "foreman-confirmed" (3), "from invoiced quotes" (4).
- **Reconciliation invariant (the north star, must hold in code):**
  `pipeline.phase4.revenue === salesFromInvoiced(quotes).revenue === Boss View revenue.`
  Same birthplace guarantees it. This is the line the owner ties to the accountant; it must be a
  verified assertion, not a coincidence.
- **Counted means visible:** every phase with a nonzero count can expand to the jobs behind it
  (drill to the rows). A total with no visible jobs is a law break.
- **Earned-only empty states:** an empty phase names its action — phase 4 empty →
  *"Invoice a quote to see realized revenue."*

---

## 3. Where the picker and Analyze action live

### 3a. Money Map job picker — `app/page.tsx` (Overview)
Today `moneyMapSnapshot` auto-picks `mapJobs[mapJobs.length - 1]` — the latest confirmed job, no
choice. Add a **picker on the Money Map card header** listing the confirmed jobs; default = latest
(unchanged behavior when untouched); selecting one drives the same snapshot computation for the
chosen job. **The picker lists CONFIRMED (Ready-to-Invoice+) jobs only** — the Money Map's standing
law is *"goes dark until foreman-confirmed facts exist,"* and the picker must not reopen that door
(PLANNING jobs are reachable only via Analyze, §3b, where the tier is labeled). See Decision D2.

### 3b. Analyze action — `app/quotes/page.tsx` (saved-quotes list)
Add **Analyze** to the existing row **Actions** dropdown (currently Preview / Edit / Duplicate),
on both the EPP and Full lists. Analyze opens the **same 6-rung ladder** for that quote, **tier-labeled**:
- status ∈ CONFIRMED set → **CONFIRMED** ladder (foreman-confirmed costs, same as the Money Map).
- status below it → **PLANNING** ladder, explicitly labeled *"PLANNING — from your bid, not yet
  foreman-confirmed."*

**Never blended, never unlabeled:** the tier badge is always present; one ladder shows exactly one
tier's numbers. A PLANNING ladder is legal to show *because it is labeled PLANNING* — it is a bid
projection, never money, never rolled into a realized total.

### 3c. Shared ladder component (enabling refactor, presentation-only)
The 6-rung ladder + `RUNG_INFO` + glossary currently live **inline in `app/page.tsx`**. Extract to
`components/MoneyMapLadder.tsx` so the Overview Money Map, the picker, and the Quotes Analyze modal
render the identical ladder from one source (props: the snapshot + a tier label). Pure lift —
markup/copy only, no math moved. (Falls under the layout/visual tier; the math it displays does not
change.)

---

## 4. What changes, on which surface

| Surface | Change | Tier of change |
|---|---|---|
| `lib/pipeline.ts` **(new)** | Phase defs + rollup; imports `REALIZED_STATUSES`; new home for the facts-gate set. | **Logic — stop/approve** |
| `lib/qualifying.ts` | Untouched logic; `REALIZED_STATUSES` now also imported by pipeline. | none (read-only reuse) |
| `app/page.tsx` (Overview) | (a) Money Map **job picker**; (b) new **Profit Pipeline** accumulator section (phase rollup); import gates from lib instead of local const. | **Logic — stop/approve** |
| `app/quotes/page.tsx` | **Analyze** in the row Actions dropdown → opens tier-labeled ladder. | **Logic — stop/approve** |
| `components/MoneyMapLadder.tsx` **(new)** | Extracted shared ladder (presentation). | **Visual — batch + typecheck** |

Nothing touches the Pricer's pricing path, the rate store, or QuickBooks. Reads saved quotes +
overhead chart; writes nothing new to storage.

---

## 5. Seed states to verify (browser walk on :3007)

| Seed | Data | Expected — the law under test |
|---|---|---|
| **S0** | No quotes | All phases 0 with action-naming empty states; Money Map dark; picker empty; Boss View empty. |
| **S1** | Only Draft/Sent/Approved | PLANNING phases show **bid** totals, tier-badged PLANNING; phase 4 realized **$0** + "Invoice a quote…"; Money Map **still dark**; Analyze on a Draft → **PLANNING** ladder. *(Two-gate: money stays $0 while planning shows.)* |
| **S2** | One job at **Ready to Invoice** | Phase 3 populated **CONFIRMED-facts**; its revenue shown **but not counted as money**; Money Map lights up + picker has 1 entry; realized **$0**; **Boss View still empty.** *(The sharpest two-gate test: facts visible, money not.)* |
| **S3** | One **Invoiced** job | Phase 4 realized populated; **`phase4.revenue === Boss View revenue`** (reconciliation assertion); picker includes it. |
| **S4** | Jobs across all four phases | Each phase count/total correct; picker lists **all** RtI+ jobs; Analyze labels CONFIRMED vs PLANNING correctly; **no blended grand total anywhere**; realized ties to Boss View exactly. |
| **S5** | Includes Declined + Lost | Dead lane **excluded** from every pipeline total (optional muted count only). |

---

## 6. Decisions — RESOLVED (Rev 4)

- **D1 — Where does the accumulator live? → Overview, under the Money Map** (rec applied). Owner
  surface, sits next to the lens it feeds.
- **D2 — Picker scope → CONFIRMED-only** (rec applied). Preserves "Money Map goes dark until
  confirmed"; PLANNING reachable via Analyze, where it's labeled.
- **D3 — Phase count → keep 4** (rec applied). Maps cleanly to the two gates + the three locked zones.
- **D4 — Phase-3 (Ready to Invoice) revenue → APPROVED: show it, labeled "contracted · awaiting
  invoice," never summed into realized.** The two-gate law's hardest edge, resolved: the number is
  visible (counted-means-visible) but lives outside the realized/money total.
- **D5 — PLANNING dollars on screen → BLESSED, with the vocabulary law (§0 law 7).** Bid dollars
  **may** display in PLANNING phases and PLANNING Analyze ladders — but the word **"Revenue"** and
  any revenue-labeled total are **reserved for Ready-to-Invoice+**. Phases 1–2 read **"bid value"**
  and **"contract value."** Reinforced by the iron guard (§0 law 8): PLANNING and CONFIRMED dollars
  never share a total.
- **D6 — Analyze on Full (non-EPP) quotes → yes, same ladder** (rec applied).
- **D7 — New `lib/pipeline.ts` importing `REALIZED_STATUSES`** (rec applied). Keeps the locked
  qualifying set tiny and untouched; `pipeline.ts` becomes the single home for the facts gate.

*No applied default (D1–D3, D6–D7) contradicts the Rev-4 rulings.*

---

## 7. Runbook conflicts — Pipeline scope vs laws ruled since Rev 3 (Jul 3)

The runbook (`BUILD-F-SCOPING.md`, Rev 3) predates the two-gate / one-birthplace / tier rulings.
Flags:

1. **§3.3 "Money Map (Overview) — display formalization only; no auto-feed." → SUPERSEDED.**
   Since Rev 3 the Money Map **does auto-feed** from foreman-confirmed jobs (commits *"Money Map goes
   dark until foreman-confirmed facts exist,"* *"Phase 1 unification: one birthplace per number"*).
   The Pipeline extends that auto-feed. The governing reality is **"auto-feed from foreman-confirmed
   jobs, dark until then,"** not "no auto-feed." The runbook line is stale.

2. **Feature map "Money Map auto-populate from live P&L → DROP (future)" → still holds, but don't
   over-read it.** That drop is about the **P&L** feed. The **job** feed (from saved quotes) is live
   and in-scope — the Pipeline reads *jobs*, not P&L. Consistent, but state it so "DROP" isn't
   mistaken for blocking the job accumulator.

3. **The Profit Pipeline is not in the written F1–F6 phase table. → RESOLVED (Rev 4):** this spec is
   the **addendum of record**, and the runbook (`BUILD-F-SCOPING.md`) carries a one-line Rev 4
   pointer to it. The accumulator + picker + Analyze are an owner ruling folded into Build F after
   Rev 3; they live here, not in the Rev 3 F1–F6 table.

4. **Two ladders now exist — the runbook conflates them by omission.** Runbook §3.1's five-number
   ladder is the **P&L Organizer's projection ladder** (a *prospect's* numbers, live audit). The
   Money Map / Pipeline ladder is the **owner's job ladder** (the owner's *confirmed* jobs). Same
   vocabulary, different source and tier. This spec touches **only the job ladder.** Not a conflict —
   a clarification the runbook never makes, and must, so the two are never merged.

5. **"Boss View starts at Invoiced — remove bid fallback" → confirms the money gate; kills any bid
   fallback.** The Pipeline's PLANNING phases show bid dollars **only** under the PLANNING label and
   **never** as Boss View / realized data — consistent, but it makes Decision **D5** load-bearing:
   the build shows bid dollars outside the Pricer for the first time, legal only if "labeled PLANNING
   ≠ earned money" is explicitly the owner's reading.

---

**Stop here. Owner pressure-tests §1 phases, §6 decisions (D4/D5 especially), and §7 flags before any code.**
