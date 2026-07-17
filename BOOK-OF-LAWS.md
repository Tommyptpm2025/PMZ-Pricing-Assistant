# TPM BOOK OF LAWS — v0.2 FINAL

**Status: v0.2 FINAL — Tom's red-pen applied Jul 17, 2026. All merge conflicts gaveled closed (see RESOLVED). No open conflicts.**
**Home: repo root, beside CLAUDE.md, committed as `BOOK-OF-LAWS.md`. Named or nonexistent. The maintenance rule is ACTIVE from the first commit.**
**Maintenance rule:** any commit that changes a law changes its line here, in the same commit.
**Merge inputs:** BOOK-OF-LAWS-v0.1.md (40 laws) · BOOK-OF-LAWS-SWEEP.md (101 rules, groups A–G, cites verified @ commit `1d6a89c`) · PMZ Session Rulings Jul 13–17, 2026 (37 rulings + gavels + standing process laws) · Tom's red-pen gavels (Jul 17).
**Cite stamp:** repo cites verified @ `1d6a89c`. Drift note: cites touching phase headers and net-color call-sites drifted one commit (`86f7066`, Jul 17 — canonical phase-header rename + netProfitColors SSOT). Note only; the 101 are not re-stamped.
One line per law, dated. 🔓 = see LAW-WITHOUT-A-FENCE.

---

## I. MONEY & TRUTH LAWS

1. **Two-Gate Law** — Money Map lights at foreman-confirmed facts (Ready to Invoice+); Boss View lights at money (Invoiced+). "If it isn't invoiced, it's not revenue." The gap between a lit Map and a dark board is intentional — an unbilled-work reminder. *(Jul 13–14)* — `BUILD-F-PIPELINE-SPEC.md:37`
2. **Qualifying Set** — Realized money = statuses {Invoiced, Paid, Completed}; defined once (`qualifying.ts`), imported everywhere, never redefined. Completed is confirmed in the set (Jul 17 gavel). *(Jul 13; Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:51-52`; `pipeline-fence.test.mjs:40-42`
3. **Facts Gate** — Exactly the money gate plus Ready to Invoice: {Ready to Invoice, Invoiced, Paid, Completed}; superset of the money gate, larger by exactly one. *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:83,86-87`; `pipeline-fence.test.mjs:38-39,45-47`
4. **Board Starts at Invoiced** — Draft / Sent-for-Acceptance bids never appear on Boss View — no bid fallback; they belong in sales trackers and the quotes list. BID badge retired. *(Jul 13)* — `BUILD-F-PIPELINE-SPEC.md:237-241`
5. **No-Blending Law** — Real numbers and sample numbers never combine into one derived figure. Every card is an earned number or an instructive empty state naming the action that earns it. No make-believe. *(Jul 13)* — `BUILD-F-PIPELINE-SPEC.md:39,42,124-125`
6. **Counted-Means-Visible** — Every stored quote must display somewhere or be explicitly explained. Hidden-but-counted records are defects. *(Jul 13)* 🔓 — `BUILD-F-PIPELINE-SPEC.md:41,122-123`
7. **Named Source Law** — Every card names its source. Fallbacks are explicitly labeled; a fallback without a visible label is a silent lie. *(Jul 13)* 🔓 — `BUILD-F-PIPELINE-SPEC.md:40`
8. **Live Means All Live** — Per-card LIVE badges; a banner may claim "live" only when every card is live (AND across cards, never OR). *(Jul 13)* 🔓
9. **One Birthplace Per Number** — Revenue/COGS are born from status flips (read-only in the Organizer); overhead is born from entry. Nothing the system already knows is ever re-typed. *(Jul 15–16)* — `BUILD-F-PIPELINE-SPEC.md:38`
10. **Provenance Labels** — Organizer-sourced overhead is labeled "from your P&L Organizer"; any hand-edit reverts the source to manual / "from your Overhead chart." *(Jul 15)* 🔓
11. **Iron Guard** — PLANNING and CONFIRMED dollars never sum into any shared total; per-phase subtotals only; the rollup exposes only {phases, dead} — no grand-total field exists, the guard is structural. *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:46-48`; `pipeline-fence.test.mjs:110-114`
12. **D4 Ruling** — Ready-to-Invoice dollars display labeled "contracted · awaiting invoice," never summed into Realized. *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:194-196`
13. **Dead Lane Law** — Declined/Lost are terminal; excluded from every total, never routed to the Map, never wear "Revenue." Visible and listed; a dead-lane click opens a PLANNING Analyze (failed-bid post-mortem). *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:68-74`; `pipeline-fence.test.mjs:93,135-136`; `SEGMENT-2-SPEC.md` (Call 2)
14. **Reconciliation Invariant** — Realized-phase revenue === Boss View revenue === the shared qualifying function, enforced as a verified test assertion; realized direct+indirect === COGS; realized job list === qualifying quotes, by id. *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:118-121`; `pipeline-fence.test.mjs:103-107,128-131`
15. **Reconciliation North Star** — The five true numbers must let the owner predict the bookkeeper/accountant's month-end report (arriving the 5th–10th) before it lands — "and the two should coincide." PMZ runs parallel to accounting; accounting confirms PMZ. *(Jul 16)* — `BUILD-F-PIPELINE-SPEC.md:11-14`
16. **Pipeline Purpose** — The Pipeline is a capacity-management and pricing-power tool: when it's full, don't give work away or tax the workers — bid new opportunities at higher margin ("either we get the job or we don't, but if we get it, we're going to make more profits"). It exists to fill the schedule properly and inform future bidding. *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:16-31`
17. **Map Feed Law** — No auto-population from live P&L (that dropped feed stays dropped); the Map DOES auto-feed from foreman-confirmed jobs per the Two-Gate Law. *(Jul 13–17, gaveled — see RESOLVED R-1)* — `BUILD-F-PIPELINE-SPEC.md:135-137,215-219`
18. **Backup Before Demolition** — A dated export precedes any delete/replace of stored data; confirm dialogs name exactly what is removed (counts and dollar totals); cancel is always non-destructive. *(Jul 13)* 🔓

## II. VOCABULARY LAWS

19. **Status Lifecycle Language** — Canonical lifecycle: Draft → Sent for Acceptance → Accepted → Scheduled → Work Order Active → Ready to Invoice → Invoiced → Paid → Completed; Declined and Lost terminal dead-lane. These words are the only permitted status and phase vocabulary on any product surface; invented groupings ("Won," "In Production," "Bidding," "Realized") are barred from headers and labels. "Sent" is informal shorthand only. Header vocabulary is FENCED as of `86f7066` — phase headers renamed to canonical status groupings, the vocabulary fence updated with them and green. Stored status keys are not a product surface: canonical labels map onto every surface now; the stored-key rename ships later as an additive migration (law 48) at a natural touch — no forced data migration. *(Jul 17, gaveled — see RESOLVED R-2/R-3/R-4)*
20. **Revenue Reserved (D5)** — The word "Revenue" and any revenue total belong to Ready-to-Invoice+ tiers only. Below that: "Bid Value" / "Contract Value" — everywhere, including ladders and pipeline rows. *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:43-45,197-201`; `pipeline-fence.test.mjs:96-99`
21. **Projected, Not Net** — The PLANNING hero band reads "Projected Net Profit" — never "Net Profit" unqualified; PLANNING mode drops the word "Revenue" everywhere; percentages read "of bid value." *(Jul 17)* — `SEGMENT-2-SPEC.md` (Ruled §, Call 7)
22. **Copy Law** — "If we didn't state it, we don't print it." No product teaching string ships without Tom's approval; unapproved rung slots render nothing; approved strings ship as working text, adjustable over time, not locked verbatim; one draft, one check, then Tom's call — no further AI review loops. *(Jul 17)* — `SEGMENT-2-SPEC.md` (Ruled §, COPY LAW)
23. **Copy Kills of Record** — The 10–15% net benchmark is KILLED; "the truck payment" is struck from the Overhead teach line. *(Jul 17)* — `SEGMENT-2-SPEC.md` (Ruled §, COPY LAW)
24. **Trade Term Leads** — Trade term first, plain English teaches from parentheses: "Revenue (Income)," "Cost of Goods (Direct Job Costs)." Locked order, every surface. *(Build F)* 🔓
25. **Five True Numbers** — Revenue → COGS → Gross Profit → Overhead → Net Profit. The canonical ladder, always in this order; a budgeting tool, not accounting. *(Build F)* — `BUILD-F-SCOPING.md:18`
26. **"This Job," Not "This Bid"** — Confirmed-job snapshot labels say "This Job"; the label renders only when a confirmed job is present; the dark/empty Snapshot keeps "Quick Snapshot" verbatim. *(Jul 15)* 🔓

## III. PRICING LAWS

27. **Rule M-1** — Margin-only pricing in the pricing path. Markup never appears in any pricing calculation or screen; overhead never multiplies onto cost. *(Core)* 🔓 (fence queued, not yet built) — `BUILD-F-SCOPING.md:29-30,150`
28. **Golden Formula** — Price = Cost ÷ (1 − Target Margin %). *(Core; wording confirmed at red-pen, Jul 17)* — `BUILD-F-SCOPING.md:29-30`
29. **Break-Even Rates** — Stored rates are true break-even cost: no overhead, no profit, no markup baked in. *(Standing)* — `CLAUDE.md:9`

## IV. UI / POKA-YOKE LAWS

30. **Poka-Yoke Governs** — KISS + mistake-proofing is the governing design law. If a user can enter it wrong, the screen is wrong. *(Standing)* — `BUILD-F-SCOPING.md:33`
31. **10-Second Foreman Test** — Every screen understandable by a foreman in ten seconds; plain language; detail behind a tap. All views, all tiers. *(Standing)* — `BUILD-F-SCOPING.md:33`
32. **Single Source of Color Truth** — BUCKET_COLORS and STATUS_COLORS are single-source-of-truth constants. Amber is reserved exclusively for the countdown-uncovered state. *(Build F)* 🔓 — `BUILD-F-SCOPING.md:36`
33. **Single-Door Input** — One input surface per data type. Overhead enters through the P&L Organizer only; the manual chart is a read-only ledger (Billable Hours excepted); the Organizer edits the chart's single store directly — the apply button and confirm dialog stay retired (guards existed for the two-door world only). Runbook B-30's apply-model handoff is superseded. *(Jul 15–16, gaveled Jul 17 — see RESOLVED R-6)* 🔓
34. **Seed, Don't Lose** — Legacy chart lines one-time-seed the Organizer as editable; nothing lost. *(Jul 15)*
35. **Layout Law** — The Organizer populates the existing chart; detail lives in the tab, the dashboard shows the bottom line; no new COA store or tab. *(Build F)* — `BUILD-F-SCOPING.md:26-27,173`
36. **Check the Sort** — A poka-yoke gate before writing into the chart. *(Build F)* — `BUILD-F-SCOPING.md:134`
37. **Glossary In Place** — Terms expand per-term, in place, one level deep, independent toggles; no navigation away to learn a word. *(Jul 15)* 🔓
38. **Earned Green** — Green states are earned by real data, never default. Empty states teach the action that earns them. `netProfitColors(net)` is the net-color SSOT (`lib/pmz-types.ts`), fenced green-on-positive / red-on-negative (@ `86f7066`). *(Jul 13; SSOT + fence Jul 17)*
39. **One Ladder, One Source** — Analyze is the dedicated `/analyze/[id]` full-screen route; the Layer-2 modal is retired — one full-screen ladder, three doors; one tier-labeled ladder component everywhere; never blended, never unlabeled. *(Jul 17, gaveled — see RESOLVED R-5)* — `SEGMENT-2-SPEC.md` (Ruled §, Calls 1 & 5); `BUILD-F-PIPELINE-SPEC.md:139-148,202`
40. **Map As Lens** — The Money Map lives on Overview and gains a job picker: CONFIRMED jobs only, defaults latest — the owner/bookkeeper review lens; the Map's full view converges to `/analyze/[id]` (no modal); "Analyze" from saved quotes opens the same route for any selected quote. *(Jul 16–17)* — `BUILD-F-PIPELINE-SPEC.md:131-137,191-192`; `pipeline-fence.test.mjs:181-184`; `BUILD-F-SCOPING.md:183`

## V. AUDIENCE LAWS

41. **Analysis Tier** — Owner, bookkeeper, accountant see the full analysis layer (all six rungs). *(Jul 16)* 🔓
42. **Sales Tier** — Salespeople see the Pricer AND quotes with margin rungs 1–4, in tier-correct vocabulary: "Bid Value" below Ready to Invoice, "Revenue" at Ready to Invoice and beyond. Overhead and Net Profit (rungs 5–6) are owner-tier only. *(Jul 16; vocabulary gaveled Jul 17 — see RESOLVED R-7)* 🔓
43. **Foreman Tier** — Foremen see the Work Order View with the recipe snapshot frozen at accept-time. *(Build F)*
44. **Prospect Sandbox** — The $500 Profit Audit runs in a separate, sandboxed audit/demo mode, physically unable to write to the owner's chart or board; queued by name. Demo data is session-only, wiped at audit end unless "Save this company"; NDA before any demo. *(Jul 15)* — `BUILD-F-SCOPING.md:136,180`

## VI. DATA & ARCHITECTURE LAWS

45. **One-Address Rule** — All work on `localhost:3007`; never mix dev :3000 and production :3007 storage (localStorage is origin-scoped → split-brain); no parallel servers, ever. Sole exception: a temporary Tom-requested recovery server, killed once verified. *(Standing)* — `CLAUDE.md:37-41`
46. **Status Sets Import, Never Redefine** — Derived status sets import the base set; no duplicate definitions anywhere; the facts-gate ⊇ money-gate relation is proven, not assumed. *(Jul 17)* — `pipeline-fence.test.mjs:45-47`
47. **Tier From Status** — Tier is derived from quote status (`tierOf`) only — never a user-facing toggle; PLANNING and CONFIRMED status sets are disjoint. *(Jul 17)* — `SEGMENT-2-SPEC.md` (Ruled §, 9c); `pipeline-fence.test.mjs:55-60,116-118`
48. **Additive Storage Migrations** — New storage keys add alongside old ones; migrations never destroy prior data. The pending stored-status-key rename to canonical names (law 19) ships under this law at a natural touch. *(Jul 15; Jul 17)* 🔓
49. **Status History & Locks** — Every status change appends statusHistory and sets `locked = isStatusLocked(chosen)`; invoiced-tier and accepted-tier statuses are locked; lock clears jumping backward. Stored keys remain legacy names pending the law-48 rename; canonical labels per law 19 on every surface. *(Standing; gaveled Jul 17)* — `superuser-status.test.mjs:26,33-37,46-55,60-68`
50. **LEM Gate** — No transition to Accepted while lines carry zero quantities. *(Build F)* 🔓
51. **Overhead Store & Math** — Chart persists under `pmz_overhead_chart`; Overhead = Σ chart.items.amount; overheadPercentOfRevenue = overhead ÷ revenue = the handoff value. *(Build F)* — `BUILD-F-SCOPING.md:75,84-86`
52. **Countdown Law** — overheadRemaining = max(0, overhead − projectedGrossProfit), counting to zero; uses the page's projected figures, not PMZ job actuals. *(Build F)* — `BUILD-F-SCOPING.md:89-95`
53. **Work-Type Split** — The split touches only Revenue + Direct COGS; overhead is never split. *(Build F)* — `BUILD-F-SCOPING.md:104`
54. **Phase Rollup Math** — Each phase rolls up count / value = Σ totalRevenue / direct / indirect / gross = value − direct − indirect; each phase's job list matches its members and `jobs.length === count`; `PhaseJob.value` === the job's totalRevenue; null/junk input degrades safely (null → 4 phases, undefined rollup value = 0, junk confirmedJobs = []). *(Jul 17)* — `pipeline-fence.test.mjs:81-92,121-133,186-189`
55. **Frozen Map Math** — Money Map allocation is byte-identical to the frozen pre-build formula (overhead = round(rev × Σitems/monthlyRevenue); gross; net; pct); rev=0 resolves all percentages to 0 — no divide-by-zero, no NaN. *(Jul 17)* — `pipeline-fence.test.mjs:138-179`
56. **One Price Path** — Worksheet display and save both go through `lib/epp-line`; a line's price and the quote total can never diverge; manual unitPrice, priceOverridden, and all per-line LEM detail survive save → reload intact; scope-only lines stay clean; persisted totalRevenue equals the worksheet total. *(Standing)* — `epp-roundtrip.test.mjs:2-6,19-20,38-41,63-74`
57. **Currency Law** — `formatMoney` = 2dp + thousands, extracted to `lib/format.ts`; rates round to the cent as the value so rate×qty ties out. *(Standing)* — `CLAUDE.md:52`; `BUILD-F-SCOPING.md:183`
58. **LEM_GRID** — The shared per-line costing column template; per-line costing is EPP-only and does not affect Full LEM. *(Standing)* — `CLAUDE.md:53-54`
59. **Read-Only Books** — QuickBooks is never touched; PMZ is read-only w.r.t. the customer's books; no write-back to accounting systems. *(Standing)* — `BUILD-F-SCOPING.md:15,36`
60. **Pipeline Writes Nothing** — The Pipeline touches no pricing path, rate store, or QuickBooks; reads quotes + chart; writes nothing new. *(Jul 17)* — `BUILD-F-PIPELINE-SPEC.md:169-170`
61. **Overhead Intake Roadmap** — Phase 2 = chart-of-accounts CSV import; Phase 3 = live accounting integration auto-deciphered into buckets; category lists are suggestions, not fixed. *(Jul 16)*

## VII. BUILD DISCIPLINE LAWS

62. **Roles Fixed** — Tom drives and approves; Claude-in-chat is Project Lead; Claude Code is the builder. *(Standing)* — `CLAUDE.md:3`
63. **Two-Tier Change Control** — Tier 1 (layout/CSS/styling/labels/copy): apply freely, one consolidated diff + typecheck before commit. Tier 2 (values, math, cost/GP calc, handlers, state, data models, business logic, shared stores, cross-surface effects, destructive/irreversible commands): STOP, show the diff, WAIT. When the tier is unclear, treat as Tier 2 and stop. *(Standing)* — `CLAUDE.md:13-21`
64. **Stay In Scope** — A layout pass is layout-only; logic is its own pass; scope expansion is flagged before proceeding. *(Standing)* — `CLAUDE.md:25,32`
65. **Zero TypeScript Errors** — Enforced on every commit, no exceptions; never raise a file's existing error count (project-pricer ~50 pre-existing). *(Standing)* — `CLAUDE.md:26`
66. **One Commit Per Fix** — One fix, one commit, one story; one concern per commit; segments follow the same law. *(Standing)* — `CLAUDE.md:28`
67. **Surgical Staging** — Before committing: `git status` + `git show --stat`, confirm only intended files; stage with `git add <path>` — never `-A`, never `.`. *(Standing)* — `CLAUDE.md:29-30`
68. **Spec Before Code** — Plan first for structural work; show the diff before applying; specs delivered and pressure-tested before any code; open calls get gaveled, not assumed. *(Standing)* — `CLAUDE.md:33`
69. **Verify Before Push** — Green deploy for that exact commit → hard refresh (Ctrl+F5) → test with the owner's eyes; robot suites are necessary, never sufficient; CC stops before push, always. *(Standing)* — `CLAUDE.md:45-46`
70. **Push Word Is Tom's** — No push without Tom's explicit word. Verify gates stated aloud before every approval. *(Standing)*
71. **One Prompt at a Time** — CC receives one prompt, cut fresh from the actual current state. Never a prompt held for later. *(Standing)*
72. **Fence Discipline** — Any build outside a surface must prove that surface byte-identical via regression suite — "proven, not assumed." *(Jul 15–17)*
73. **Named or Nonexistent** — A deliverable that is not a named file in the repo does not exist. *(Jul 17 — this Book lives under it as `BOOK-OF-LAWS.md` at repo root)*

## VIII. BRAND LAWS

74. **PMZ Naming** — The brand is "Profit Margin Zone (PMZ)" — never "Performance Margin Zone." *(Standing)* — `CLAUDE.md:51`
75. **Author Naming** — "Tommy Profit" is the public brand alias for books, podcast, and social media exclusively. Never in working documents, product, or client work. *(v0.1)*
76. **Ziglar Spine** — "Ziglar said it. Jackson banked it. TPM builds it into contractors' pricing." The locked philosophical spine. *(v0.1)*
77. **Earned Merch** — Merchandise acquired outside the system is watermarked "Not Earned — TotalProfitManagement.com." *(v0.1)*

---

## RESOLVED (gavels quoted — the paper trail)

**R-1. Map auto-feed (runbook rule 41 vs sweep rule 61).** Runbook, `BUILD-F-SCOPING.md:138`: "§3.3 Money Map (Overview) = display formalization only, no auto-feed." Sweep C-61, `BUILD-F-PIPELINE-SPEC.md:135-137,215-219`: "Money Map goes dark until foreman-confirmed; it now auto-feeds from confirmed jobs (supersedes B-41)." **Gavel (Tom, Jul 17, verbatim):** *"Rule 61 is canon, runbook rule 41 is removed. The dropped feed is the live-P&L feed; the confirmed-job feed stands per the Two-Gate Law. Gaveled now so the paper trail holds it."* → Law 17.

**R-2. Ruling 37 vs pipeline phase names (session item 21).** Gavel (Tom, Jul 17, verbatim): *"37 fully supersedes item 21's phase names — one vocabulary everywhere, product and docs; specs update to status-grouping names at their next natural touch, old names become historical only."* → Law 19; phase structure (statuses, gates, dead lane) unchanged.

**R-3. Ruling 37 vs v0.1 law 29 (lifecycle).** Gavel (Tom, Jul 17, verbatim): *"Law 29 is stale, canon per 37: the full lifecycle runs Draft → Sent for Acceptance → Accepted → Scheduled → Work Order Active → Ready to Invoice → Invoiced → Paid → Completed, Declined/Lost terminal. 'Completed' is the terminus and stays in the qualifying set; 'Sent for Acceptance' is the canonical status name, 'Sent' is informal shorthand only."* → Laws 2, 19.

**R-4. Canonical status names vs stored/tested status keys (was CONFLICTS C-1).** Canon (ruling 37) named "Sent for Acceptance / Accepted / Work Order Active" where the code stores "Ready for Approval / Approved / In Progress" (`superuser-status.test.mjs:60-68`; `pipeline-fence.test.mjs:55-60`). **Gavel (Tom, Jul 17, verbatim):** *"Stored status keys are not a product surface. Canonical labels map onto every surface now; the stored-key rename ships later as an additive migration (law 48) at a natural touch. No forced data migration. C-1 closed."* → Laws 19, 48, 49.

**R-5. Money Map ladder: shared modal vs retired modal (was CONFLICTS C-2).** Session ruling 28 had the Overview modal sharing the ladder component; sweep G-100 (Call 5 restated) retired the modal. **Gavel (Tom, Jul 17, verbatim):** *"The modal is retired. Everything converges to /analyze/[id] — one full-screen ladder, three doors, as built and walked. C-2 closed; laws 39–40 read accordingly."* → Laws 39, 40.

**R-6. Overhead handoff: runbook apply model vs live-flow (was CONFLICTS C-3).** Runbook B-30 (`BUILD-F-SCOPING.md:21,144`) described an "Add Details" apply-style handoff; session ruling 14 retired the apply button and confirm dialog. **Gavel (Tom, Jul 17, verbatim):** *"B-30 is superseded by the live-flow ruling. The Organizer edits the single store directly; the apply button and confirm dialog stay retired. C-3 closed."* → Law 33.

**R-7. Sales-tier rung names vs PLANNING vocabulary (was CONFLICTS C-4).** Session ruling 18 listed sales-visible rungs as "(Revenue/COGS/Gross)"; ruling 29 + D5 bar "Revenue" below Ready to Invoice. **Gavel (Tom, Jul 17, verbatim):** *"Sales tier sees rungs 1–4 with tier-correct vocabulary: 'Bid Value' below Ready to Invoice, 'Revenue' at Ready to Invoice and beyond. Ruling 18's rung names were rung positions, not vocabulary. C-4 closed."* → Laws 20, 42.

## CONFLICTS

None open. C-1 through C-4 gaveled closed Jul 17, 2026 — see RESOLVED R-4 through R-7.

---

## LAW-WITHOUT-A-FENCE (stated but not enforced by any test in the swept suites)

Scope note: process laws (Ch VII) are fenced by discipline, not tests, and are excluded. Listed = product/data laws a test COULD fence but none does, per the sweep of `pipeline-fence.test.mjs`, `superuser-status.test.mjs`, `epp-roundtrip.test.mjs`.

- **Law 27, Rule M-1 firewall** — the headline case. Stated with only a *suggested* grep/CI guard (`BUILD-F-SCOPING.md:152`); no such check exists. **Fence queued, not yet built.**
- **Law 19, Status Lifecycle Language** — header vocabulary FENCED as of `86f7066` (phase headers renamed to canonical status groupings; vocabulary fence updated and green) — struck from this list for header vocabulary. Remaining unfenced edge: status-label mapping on non-pipeline surfaces.
- **Law 6, Counted-Means-Visible** — spec-cited only; no test walks stored quotes against displayed rows.
- **Law 7, Named Source / Law 10, Provenance Labels** — no test asserts source labels or the manual-revert behavior.
- **Law 8, Live Means All Live** — no test asserts the AND-across-cards banner rule.
- **Law 18, Backup Before Demolition** — no test asserts export-precedes-delete or dialog contents.
- **Law 22, Copy Law** — the approval gate is human by design, but "unapproved rung slots render nothing" is testable and untested.
- **Law 24, Trade Term Leads / Law 26, "This Job" label / Law 37, Glossary In Place** — copy/UI conventions with no fence.
- **Law 32, Amber reservation** — no test asserts amber's exclusivity.
- **Law 33, Single-Door Input** — no test asserts the chart is read-only outside Billable Hours.
- **Laws 41–42, Audience tiers** — owner-only rungs 5–6 and tier-correct sales vocabulary are testable and untested.
- **Law 48, Additive Migrations** — no migration test in the swept suites (the pending status-key rename will need one).
- **Law 50, LEM Gate** — no test blocks Accepted with zero-quantity lines.

---

## MERGE NOTES (audit trail)

- **Sweep count:** task sheet said 89 laws; the delivered file is the re-verified pass at 101 — Story A extended the fence (D.78–86) and Group G (SEGMENT-2-SPEC.md) entered after the original sweep. All 101 dispositioned; none dropped silently.
- **Cite drift:** sweep cites touching phase headers and net-color call-sites are stamped @ `1d6a89c` and drifted one commit (`86f7066`). Note only — no re-stamp of the 101.
- **Folded, not carried as separate lines:** A-2 split into laws 29 + 74; A-15–18 → law 45; B-32 (compound standing-standards line) → laws 32, 45, 56, 65, 66, 69; B-33 → laws 17, 59, 61; C-43 (addendum-of-record pointer) → header note; B-41 → R-1; D-78–82 → laws 13, 14, 54; D-86 → law 54; E-87–89 → law 49 (+R-4); G-95 (Segment 2 story order) → transient build-run instruction, not standing law.
- **Session rulings all folded:** 1–37 map into the chapters above; gavels quoted in RESOLVED; ruling 16's "no audit running today; priority is completion and minimal downtime" is a scheduling note, not law — recorded here only.
- **v0.1 laws all carried:** 1–40 map forward; law 29 rewritten per Gavel R-3; law 16's Golden Formula one-liner filled from sweep B-27 and confirmed at red-pen.
- **PLANNING/CONFIRMED confirmed as tier names** (Tom, Jul 17), not barred grouping words — untouched throughout.

## RULED AT RED-PEN (Jul 17, 2026)

- Golden Formula wording (law 28): confirmed as written.
- Book home: repo root beside CLAUDE.md, committed as `BOOK-OF-LAWS.md`. Named or nonexistent. Maintenance rule active from the first commit.

## OPEN ITEMS

- Cowork Notion/Drive sweep for brand/business rulings not yet run — Ch VIII may be under-populated.
- Fence direction for the remaining unfenced laws above (M-1 queued, not yet built).
- Pending at a natural touch: stored-status-key rename (laws 19/48/49); law-38 net-color cite drift follows the next sweep re-stamp.
