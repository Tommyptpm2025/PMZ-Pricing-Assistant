# Build F — P&L Organizer + Money Map handoff

**Scoping & Architecture · Rev 3 (FINAL — all 10 rulings applied · F1 green-lit) · Written build plan**

> **Rev 4 addendum — Profit Pipeline (accumulator + Money Map picker + Analyze):** see
> [`BUILD-F-PIPELINE-SPEC.md`](./BUILD-F-PIPELINE-SPEC.md), the addendum of record for the last major
> Build F item. It governs the pipeline accumulator, the two-gate/tier laws, and the vocabulary +
> iron-guard rulings that post-date this Rev 3 document.

---

## 0. Mission (governs everything)

### Goal 1 — Reorganize the chart of accounts *outside* the accounting program
QuickBooks is **never touched**. Take a P&L export (file or manual) and re-sort accounts into PMZ structure. **Read-only w.r.t. their books.**

### Goal 2 — Produce the five true numbers
**Revenue → Cost of Goods → Gross Profit → Overhead → Net Profit.** The output. A **budgeting tool, not an accounting program.**

### The Handoff (reason the tab exists)
The computed **Overhead** number feeds the **Pricing Assistant's margin target**, using the existing **"Add Details" convention** — a manual input field + a button to apply the computed number. **No new UI conventions.** (§4)

### Demo requirement (primary use case)
Used **LIVE during $500 Profit Audits**: prospect's P&L dropped in during the meeting, reorganized five-number output on screen in the room. **Import→output must be fast and clean.** **PDF drag-and-drop is the headliner**; CSV/XLSX serve tech-savvy users; **manual entry** (the existing Manual Overhead tab) is the in-room fallback.

### LAYOUT LAW (governs F1–F2)
The P&L Organizer is **NOT a separate structure.** The **P&L Import tab** (already stubbed beside Manual Overhead on `app/overhead-profit/page.tsx`) **populates the EXISTING "Detailed Chart of Accounts" line items** on that page (`OverheadChart.items` + the revenue/COGS assumptions). **Detail lives in the tab; the dashboard shows the bottom line.** No new COA store, no new COA tab.

### Rule M-1 (Pricing firewall)
Price is **only** `Cost ÷ (1 − Target Margin %)`. The handoff feeds Overhead into the *margin-target input* (a human applies it); Overhead is **never multiplied onto cost.** Markup math never enters the pricing path.

### Design Law — KISS + Poka-Yoke
Trade contractors, not accountants. Complexity in the engine; UI shows plain-language outcomes only. 10-second-foreman test. No jargon, no ratio tables as a primary display. Every number is a plain sentence first, detail behind a tap. §3 labels every number.

### Standards / out of scope
localStorage · EPP · `BidItem` single line model · TS 0 errors on push · `STATUS_COLORS` SSOT · Four Pillars branding · one commit per fix, browser-verify before push. **Out:** writing back to any accounting system · Money Map auto-population from live P&L · accounting-API integrations · code beyond the greenlit phase.

---

## 1. Feature map (adopt / adapt / drop)

| Feature | Decision |
|---|---|
| Re-sort a P&L export into PMZ structure, books untouched (Goal 1) | **ADOPT — core** |
| Five true numbers output (Goal 2) | **ADOPT — core** |
| Handoff: Overhead → margin target (Add Details pattern) | **ADOPT — core** |
| Populate the EXISTING detailed chart line items + assumptions | **ADOPT — core (Layout Law)** |
| **Overhead Recovery Countdown** summary element | **ADOPT — core (F1)** |
| **PDF** drag-and-drop import (demo headliner) | **ADOPT — committed feed (not droppable)** |
| CSV / XLSX import (tech-savvy users) | **ADOPT — committed feed** |
| Manual entry (existing Manual Overhead tab) | **ADOPT — in-room fallback** |
| Fuzzy-match imported lines → chart categories; Tom review/correct | **ADAPT — core** |
| Demo-mode: session-only data, wiped at audit end unless "save this company" | **ADOPT — core (F3)** |
| **V/F tag on every line** (per-line F/V marker + plain-language defs; education) | **ADOPT — core (F1)** |
| Breakeven · recovery-rate displays · any analytics BUILT ON V/F tags | **DEFER → optional F6 (nothing deleted)** |
| Work-type revenue/COGS split (Pillar 2) | **ADAPT — later F5** |
| Instructor's markup pricing | **DROP (M-1)** |
| Kennedy-repo source code | **DROP (security; spec-only native rebuild)** |
| Money Map auto-populate from live P&L | **DROP (future)** |

---

## 2. Data model

### 2.1 Existing model is the spine (Layout Law) — `app/overhead-profit/page.tsx`
```ts
interface OverheadItem { id: string; category: string; amount: number; }
interface OverheadChart {
  items: OverheadItem[];        // the Detailed Chart of Accounts (overhead line items)
  monthlyRevenue: number;
  monthlyCogs: number;          // Cost of Goods
  billableHours: number;
  notes: string;
}
// Persist: pmz_overhead_chart   (already live)
```
F1 adds **no new fields** — the five numbers + countdown are all derived. Import phases (F3–F4) may add optional provenance/period fields, shown then.

### 2.2 The five true numbers (derived; pure `lib/pnl-summary.ts` or inline memo)
```ts
revenue      = chart.monthlyRevenue
costOfGoods  = chart.monthlyCogs
grossProfit  = revenue − costOfGoods
overhead     = Σ chart.items.amount              // = existing totalOverhead
netProfit    = grossProfit − overhead
overheadPercentOfRevenue = overhead / revenue    // = existing metric; the handoff value (§4)
```

### 2.3 Overhead Recovery Countdown (new summary element — F1)
```ts
projectedGrossProfit = grossProfit               // revenue − costOfGoods
overheadRemaining    = max(0, overhead − projectedGrossProfit)   // counts to zero
// overheadRemaining === 0  ⇒  everything after is net profit (netProfit = projectedGrossProfit − overhead)
```
Uses the **page's own projected figures** (not PMZ job actuals) — correct for a live audit, where the prospect has no PMZ history. Reactive: as Tom edits the prospect's numbers, the number counts toward zero and hits it exactly at break-even. *(An actuals-based live meter for existing customers is a possible F6-era enhancement, not now.)*

### 2.4 Import mapping (F3–F4)
Each imported P&L line maps to **Revenue / Cost of Goods / Overhead** (the pruned three-way core). Revenue lines → `monthlyRevenue`; COGS lines → `monthlyCogs`; overhead lines → `items[]`. Fuzzy match via `lib/coa-match.ts` (native, dependency-light) using `synonyms` seeds; confidence shown as a plain badge.

### 2.5 V/F tags ship in F1 (education); analytics deferred
Every `OverheadItem` carries `behavior: "Fixed" | "Variable"` — a per-line F/V toggle with plain-language definitions in the UI (Fixed: "costs you whether you do a dollar of work or a million"; Variable: "no work, no cost"). Purpose is muscle-memory education, not analysis. **Deferred to optional F6** (nothing deleted): breakeven (`lib/breakeven.ts`), recovery-rate displays (`lib/recovery-rates.ts`), and any charts/reports **built on** the V/F tags — all behind an "Advanced" tap, never in the demo path. Recovery rates additionally need finer sub-buckets (G&A/S&M/Other).

### 2.6 Work-type split (later F5)
Reuses `SavedQuote.workTypeId` / `Job.workTypeName`; only Revenue + Direct COGS split; overhead not split.

---

## 3. Screen layout (plain-language label for every number)

Everything lives on `app/overhead-profit/page.tsx`; the dashboard/bottom-line also surfaces via the Overview Money Map. Existing `activeTab` tabs + button style reused.

### 3.1 Manual Overhead tab — summary gets the bottom line (F1)
The existing summary (Total Monthly Overhead / % of Revenue / per Billable Hour) gains:

**Five true numbers ladder**
| Number | Plain label |
|---|---|
| revenue | "Money in (Revenue)" |
| costOfGoods | "What the work cost (Cost of Goods)" |
| grossProfit | "Left after the work (Gross Profit)" |
| overhead | "Cost to run the business (Overhead)" |
| netProfit | "What you actually keep (Net Profit)" |

**Overhead Recovery Countdown**
| Number | Plain label |
|---|---|
| overheadRemaining (> 0) | "Still to cover this month before you make a dime: **$X**" |
| overheadRemaining === 0 | "Overhead covered — **every dollar after this is profit.**" |

Design-target sentence rendered when it hits zero: *"When it hits zero, everything after is net profit."*

### 3.2 P&L Import tab — populate the existing chart (F3–F4)
1. **Drop the P&L** — PDF (headliner) / XLSX / CSV, or "Type it in instead." *We never touch your books.*
2. **Check the sort** (poka-yoke gate): each line → "Sorted into: {Revenue / Cost of Goods / Overhead}", amount via `formatMoney`, confidence badge "Good match / Please check", action "Looks right ✓ / Move it". Confirming **writes into the existing chart** (`items` + assumptions).
3. Output = the same §3.1 bottom line, now populated from the file.
**Demo mode:** session-only data, wiped at audit end unless **"Save this company."** + a **"Start a fresh audit"** reset. (NDA is signed before any demo — business-process rule.)

### 3.3 Money Map (Overview) — display formalization only; no auto-feed.

---

## 4. The Handoff — Overhead → margin target (F2)

Faithful reuse of **"Add Details"** (`project-pricer/page.tsx:2616`) + the **"Apply" result-bar** (`costingTargetResult`, `page.tsx:519`): manual field + a button that commits a computed value. Output shows *"Your overhead is 18.4% of revenue"*; a **"Use this for my pricing"** button applies it into the **global overhead assumption that already feeds the Pricer's margin targets** (editable after apply). **M-1-safe:** it sets an input to the target margin; the price is still `Cost ÷ (1 − Target Margin %)`. Overhead never multiplies onto cost.

```
 P&L Organizer → five numbers → Overhead %  ──HANDOFF (human applies)──►  margin-target INPUT
                                                                              │
                                          Golden Formula: Price = Cost ÷ (1 − Target Margin %)
 ══════════════ FIREWALL: no ratio ever multiplies onto cost ══════════════
```
Enforced by module separation + a suggested grep/CI guard (fails build if the pricing path imports diagnostic modules).

---

## 5. Phased plan (Build-E-sized; one-concern commits; 0 TS errors; browser-verify)

| Phase | Deliverable | Status |
|---|---|---|
| **F1** | Five-number ladder + **Overhead Recovery Countdown** on the summary; **per-line Fixed/Variable tag** (education) on the chart of accounts; `lib/format.ts` extraction. | **DONE — committed, browser-verified (2 commits)** |
| **F2** | Handoff: Overhead % → margin target via Add Details/Apply pattern (§4). | Core |
| **F3** | P&L Import engine → **Check the sort** → populate existing chart; **CSV + XLSX** feeds (papaparse + SheetJS); demo-mode session-only + "Save this company" + "Start a fresh audit". | Core |
| **F4** | **PDF** drag-and-drop feed (pdfjs) — demo headliner. | Committed |
| **F5** | Work-type revenue/COGS split. | Later |
| **F6** | Deferred analytics (breakeven, recovery-rate displays, charts built on the V/F tags) behind "Advanced". | Optional |

---

## 6. Final rulings (all 10)

| # | Ruling |
|---|---|
| Layout | P&L Organizer populates the **existing** detailed chart; detail in the tab, dashboard shows the bottom line. |
| Summary | Add **Overhead Recovery Countdown** (counts to zero; "everything after is net profit"). |
| Q1 COA labels | Approved as ruled — reconcile exact labels with Project Lead as categories are seeded. |
| Q2 Handoff field | Approved — land on the global overhead assumption feeding the Pricer's margin targets, editable after apply. |
| Q3 PDF | **Ships. Committed phase, not droppable.** PDF drag-and-drop is the headliner; CSV/XLSX for tech-savvy; manual = in-room fallback. |
| Q4 Deps | **Approved:** papaparse + SheetJS now; pdfjs at the PDF phase. Building all three feeds. |
| Q5 Build order | Approved as ruled — manual (exists) → CSV/XLSX → PDF. |
| Q6 Demo data | NDA before every demo (business rule). Software: demo-mode data session-only, parked securely, wiped at audit end unless "Save this company." |
| Q7 Diagnostics | **Corrected:** V/F tags **ship in F1** (per-line F/V marker + plain-language defs; education). Breakeven, recovery-rate displays, and any analytics built on the tags stay **deferred to optional F6.** Nothing deleted. |
| Sub-buckets / recovery label / Total-CODB | Resolved by pruning (moot for core; revisit only with F6). |
| Minor | Money Map stays on Overview; extract `formatMoney` → `lib/format.ts` during F1. |

---

## 7. Requirement traceability
1 COA bucketing → **core** (Revenue/COGS/Overhead on existing chart) · 2 V/F tags → **F1 (tags/education)**, analytics → **F6** · 3 recovery rates → **F6** · 4 breakeven → **F6** · 5 work-type split → **F5** · Five numbers (Goal 2) → **F1** · Handoff → **F2**.

---

**Rev 3 FINAL. F1 authorized — proceeding.**
