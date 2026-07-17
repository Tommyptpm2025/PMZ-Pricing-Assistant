# Book of Laws — Repo Sweep

**Every rule the repo states or enforces, in plain language, with file:line. Flag-only artifact —
this file changes no code and edits no Book. Not committed.**

## Verification stamp

- **Cites for groups C–F verified against commit `1d6a89c`** (HEAD at the Segment 2 build pause —
  `Segment 2 Story A: pipeline phase drill-down + tier routing`).
- **Groups A–B** (`CLAUDE.md`, `BUILD-F-SCOPING.md`) are outside the Segment 2 blast radius and were
  not touched; their cites carry over from the original sweep, still valid at `1d6a89c`.
- **Of C–F, only group D** (`scripts/pipeline-fence.test.mjs`) shifted — Story A extended the fence,
  moving the Money-Map/guard cites down ~16 lines and adding the drill-down laws (D.19–D.24 below).
  **C, E, F are byte-unchanged** since the original sweep (`git diff --stat 8c23dbf..1d6a89c` touches
  only `pipeline-fence.test.mjs` among C–F).
- **Group G** (`SEGMENT-2-SPEC.md`) is a new spec/addendum file that entered the repo after the
  original sweep; added this pass, cites verified against `1d6a89c`.

---

## A. `CLAUDE.md` — standing operating law

1. Roles are fixed: Tom drives/approves; Claude-in-chat is Project Lead; Claude Code is the builder. — `CLAUDE.md:3`
2. PMZ = Profit Margin Zone; stored rates are true break-even cost (no overhead/profit/markup). — `CLAUDE.md:9`
3. Tier 1 (apply freely, then one consolidated diff + typecheck before commit): layout/CSS/styling/labels/copy. — `CLAUDE.md:13-14`
4. Tier 2 (STOP, show diff, WAIT): values, math, cost/GP calc, handlers, state, data models, dropdown/business logic. — `CLAUDE.md:16-17`
5. Tier 2 also: anything reaching a shared store or affecting another surface. — `CLAUDE.md:18`
6. Tier 2 also: any security-flagged/destructive/irreversible command. — `CLAUDE.md:19`
7. When the tier is unclear, treat as Tier 2 and stop. — `CLAUDE.md:21`
8. Stay in scope — a layout pass is layout-only; logic is its own pass. — `CLAUDE.md:25`
9. Typecheck every change; never raise a file's existing error count (project-pricer ~50 pre-existing). — `CLAUDE.md:26`
10. One concern per commit. — `CLAUDE.md:28`
11. Before committing, `git status` + `git show --stat`; confirm only intended files. — `CLAUDE.md:29`
12. Stage surgically (`git add <path>`); never `-A`/`.`. — `CLAUDE.md:30`
13. Flag scope expansion before proceeding. — `CLAUDE.md:32`
14. Plan first for structural work; show the diff before applying. — `CLAUDE.md:33`
15. One address, one cabinet — all work on `localhost:3007`. — `CLAUDE.md:37`
16. No parallel servers, ever (localStorage is origin-scoped → split-brain). — `CLAUDE.md:38-39`
17. Only server exception: a temporary Tom-requested recovery server, killed once verified. — `CLAUDE.md:40`
18. Serve 3007 via `npm run build` then `npx next start -p 3007`. — `CLAUDE.md:41`
19. Never test live Vercel until the deploy for that exact commit is green. — `CLAUDE.md:45`
20. Live sequence: deploy-green → hard refresh → then test. — `CLAUDE.md:46`
21. Brand is "Profit Margin Zone (PMZ)" — never "Performance Margin Zone." — `CLAUDE.md:51`
22. Currency law: `formatMoney` = 2dp + thousands; rates round to the cent as the value so rate×qty ties out. — `CLAUDE.md:52`
23. `LEM_GRID` is the shared per-line costing column template. — `CLAUDE.md:53`
24. Per-line costing is EPP-only; does not affect Full LEM. — `CLAUDE.md:54`

## B. `BUILD-F-SCOPING.md` — the runbook (Rev 3)

25. QuickBooks is never touched; read-only w.r.t. the customer's books. — `BUILD-F-SCOPING.md:15`, `36`
26. The five true numbers, in order: Revenue → COGS → Gross → Overhead → Net; a budgeting tool, not accounting. — `BUILD-F-SCOPING.md:18`
27. Rule M-1 (pricing firewall): price is ONLY `Cost ÷ (1 − Target Margin %)`; overhead never multiplies onto cost. — `BUILD-F-SCOPING.md:29-30`, `150`
28. Firewall enforced by module separation + a *suggested* grep/CI guard. — `BUILD-F-SCOPING.md:152`
29. Layout Law: P&L Organizer populates the existing chart; detail in tab, dashboard shows bottom line; no new COA store/tab. — `BUILD-F-SCOPING.md:26-27`, `173`
30. Handoff uses the existing "Add Details" convention — no new UI conventions; lands on the global overhead assumption, editable. — `BUILD-F-SCOPING.md:21`, `144`
31. Design Law — KISS + Poka-Yoke; plain-language, 10-second-foreman test, detail behind a tap. — `BUILD-F-SCOPING.md:33`
32. Standing standards: localStorage; EPP; BidItem single-line model; TS 0 errors on push; STATUS_COLORS SSOT; one commit per fix; browser-verify before push. — `BUILD-F-SCOPING.md:36`
33. Out of scope: writing back to accounting systems; Money Map auto-population from live P&L; accounting-API; code beyond greenlit phase. — `BUILD-F-SCOPING.md:36`, `59`
34. Overhead chart persists under `pmz_overhead_chart`. — `BUILD-F-SCOPING.md:75`
35. Overhead = Σ chart.items.amount; overheadPercentOfRevenue = overhead / revenue = handoff value. — `BUILD-F-SCOPING.md:84-86`
36. Overhead Recovery Countdown: `overheadRemaining = max(0, overhead − projectedGrossProfit)`, counts to zero. — `BUILD-F-SCOPING.md:89-93`
37. Countdown uses the page's projected figures, not PMZ job actuals. — `BUILD-F-SCOPING.md:95`
38. Work-type split touches only Revenue + Direct COGS; overhead not split. — `BUILD-F-SCOPING.md:104`
39. "Check the sort" is a poka-yoke gate before writing into the chart. — `BUILD-F-SCOPING.md:134`
40. Demo-mode data is session-only, wiped at audit end unless "Save this company"; NDA before any demo. — `BUILD-F-SCOPING.md:136`, `180`
41. §3.3 Money Map (Overview) = display formalization only, no auto-feed. *(Superseded by C-rule 61 and now by Segment 2 convergence — see G.)* — `BUILD-F-SCOPING.md:138`
42. Money Map stays on Overview; `formatMoney` extracted to `lib/format.ts`. — `BUILD-F-SCOPING.md:183`

## C. `BUILD-F-PIPELINE-SPEC.md` — Rev 4 addendum (cites re-verified @ `1d6a89c`, byte-unchanged)

43. This spec is the addendum of record for the Profit Pipeline; runbook carries a Rev 4 pointer. — `BUILD-F-PIPELINE-SPEC.md:3`, `226-229`
44. North star: owner's numbers reconcile with the accountant's month-end; realized = same number/birthplace as Boss View. — `BUILD-F-PIPELINE-SPEC.md:11-14`
45. Purpose law: the Pipeline is a capacity-management + pricing-power tool (full pipeline → price higher). — `BUILD-F-PIPELINE-SPEC.md:16-31`
46. Two-gate law: facts at Ready to Invoice, money at Invoiced. — `BUILD-F-PIPELINE-SPEC.md:37`
47. One birthplace per number. — `BUILD-F-PIPELINE-SPEC.md:38`
48. No blending across tiers. — `BUILD-F-PIPELINE-SPEC.md:39`
49. Every number names its source. — `BUILD-F-PIPELINE-SPEC.md:40`
50. Counted means visible. — `BUILD-F-PIPELINE-SPEC.md:41`, `122-123`
51. Earned numbers only — empty states name the action. — `BUILD-F-PIPELINE-SPEC.md:42`, `124-125`
52. Vocabulary law: "Revenue" reserved for RtI+; phases 1–2 = "bid value"/"contract value." — `BUILD-F-PIPELINE-SPEC.md:43-45`, `197-201`
53. Iron guard: PLANNING and CONFIRMED dollars never share a total; no grand total. — `BUILD-F-PIPELINE-SPEC.md:46-48`
54. Money gate = `REALIZED_STATUSES = {Invoiced, Paid, Completed}` (qualifying.ts). — `BUILD-F-PIPELINE-SPEC.md:51-52`, `84`
55. Facts gate = money gate + `Ready to Invoice`. — `BUILD-F-PIPELINE-SPEC.md:83`, `86-87`
56. Four phases by stored status; Declined/Lost = dead lane, excluded from totals. — `BUILD-F-PIPELINE-SPEC.md:68-74`
57. Tier rule: CONFIRMED at RtI+, PLANNING below. — `BUILD-F-PIPELINE-SPEC.md:81-84`
58. `Completed` is explicitly a phase-4/Realized member. — `BUILD-F-PIPELINE-SPEC.md:73`, `76-79`
59. D4: Ready-to-Invoice dollars shown ("contracted · awaiting invoice"), never summed into realized. — `BUILD-F-PIPELINE-SPEC.md:194-196`
60. Reconciliation invariant (verified assertion): phase4.revenue === salesFromInvoiced().revenue === Boss View. — `BUILD-F-PIPELINE-SPEC.md:118-121`
61. Money Map goes dark until foreman-confirmed; it now auto-feeds from confirmed jobs (supersedes B-41). — `BUILD-F-PIPELINE-SPEC.md:135-137`, `215-219`
62. Money Map picker is CONFIRMED-only, default latest. — `BUILD-F-PIPELINE-SPEC.md:131-137`, `191-192`
63. Analyze on EPP + Full; one tier-labeled ladder; never blended, never unlabeled. — `BUILD-F-PIPELINE-SPEC.md:139-148`, `202`
64. Boss View starts at Invoiced — no bid fallback. — `BUILD-F-PIPELINE-SPEC.md:237-241`
65. Pipeline touches no pricing path / rate store / QuickBooks; reads quotes + chart; writes nothing new. — `BUILD-F-PIPELINE-SPEC.md:169-170`

## D. `scripts/pipeline-fence.test.mjs` — laws in code (RE-VERIFIED @ `1d6a89c`; lines shifted + extended)

66. Facts gate is exactly `{Ready to Invoice, Invoiced, Paid, Completed}`, byte-identical to the pre-build const. — `pipeline-fence.test.mjs:38-39`
67. Money gate is exactly `{Invoiced, Paid, Completed}`. — `pipeline-fence.test.mjs:40-41`
68. `Completed` is in the money set. — `pipeline-fence.test.mjs:42`
69. Facts gate ⊇ money gate, adds `Ready to Invoice`, is larger by exactly one. — `pipeline-fence.test.mjs:45-47`
70. Realized phase def lists exactly Completed/Invoiced/Paid. — `pipeline-fence.test.mjs:51-52`
71. `tierOf` = CONFIRMED for RtI/Invoiced/Completed, PLANNING for In-Progress/Approved/Draft. — `pipeline-fence.test.mjs:55-60`
72. Each phase rolls up count / value=ΣtotalRevenue / direct / indirect / gross=value−direct−indirect. — `pipeline-fence.test.mjs:81-92`
73. Dead lane counts Declined + Lost. — `pipeline-fence.test.mjs:93`
74. Vocabulary law: Bidding/Production labels never say "revenue"; Ready/Realized do. — `pipeline-fence.test.mjs:96-99`
75. Reconciliation invariant: realized value === salesFromInvoiced().revenue; direct+indirect === .cogs. — `pipeline-fence.test.mjs:103-107`
76. Iron guard: rollup exposes only `{phases, dead}` — no `total`/`grandTotal`/top-level `value`. — `pipeline-fence.test.mjs:110-114`
77. PLANNING and CONFIRMED status sets are disjoint. — `pipeline-fence.test.mjs:116-118`
78. **(Story A)** Each phase's `jobs.length === count`. — `pipeline-fence.test.mjs:121`
79. **(Story A)** Each phase's job list matches its members (bidding/production/ready/realized). — `pipeline-fence.test.mjs:122-125`
80. **(Story A)** List-level reconciliation: realized jobs === `qualifyingQuotes` members, by id. — `pipeline-fence.test.mjs:128-131`
81. **(Story A)** `PhaseJob.value` === the job's totalRevenue. — `pipeline-fence.test.mjs:133`
82. **(Story A)** Dead lane lists its jobs (route to PLANNING Analyze, never the Map). — `pipeline-fence.test.mjs:135-136`
83. Money Map allocation is byte-identical to the frozen pre-build formula (overhead=round(rev×Σitems/monthlyRevenue); gross; net; pct). — `pipeline-fence.test.mjs:138-171`
84. rev=0 guard: no divide-by-zero/NaN; all percentages resolve to 0. — `pipeline-fence.test.mjs:173-179`
85. `confirmedJobs` in stored order; picker default = latest confirmed. — `pipeline-fence.test.mjs:181-184`
86. Empty/junk tolerance: null → 4 phases; realizedRoll(undefined).value===0; confirmedJobs("nonsense")===[]. — `pipeline-fence.test.mjs:186-189`

## E. `scripts/superuser-status.test.mjs` — lifecycle laws in code (byte-unchanged @ `1d6a89c`)

87. On any status change, statusHistory is appended and `locked = isStatusLocked(chosen)`. — `superuser-status.test.mjs:26,33-37`
88. Invoiced & Approved are locked; Ready for Approval is not; lock clears jumping backward. — `superuser-status.test.mjs:46-55,71-76`
89. Predecessor ("Back") chain: Paid→Invoiced→Ready to Invoice→In Progress→Scheduled→Approved→Ready for Approval→Draft; Declined←Ready for Approval; Draft has none. — `superuser-status.test.mjs:60-68`

## F. `scripts/epp-roundtrip.test.mjs` — EPP persistence laws in code (byte-unchanged @ `1d6a89c`)

90. Worksheet display and save path both go through `lib/epp-line` — a line's price and the quote total can never diverge. — `epp-roundtrip.test.mjs:2-6,40`
91. A manually-entered `unitPrice` and its line total survive save → reload. — `epp-roundtrip.test.mjs:19-20,41`
92. Persisted `totalRevenue` equals the worksheet total. — `epp-roundtrip.test.mjs:38-39`
93. `priceOverridden` + all per-line LEM detail (labor/equipment/material/misc/crew) survive save → reload intact. — `epp-roundtrip.test.mjs:63-68`
94. A scope-only line stays clean — no empty LEM keys injected. — `epp-roundtrip.test.mjs:71-74`

## G. `SEGMENT-2-SPEC.md` — new spec/addendum file (added this pass; cites @ `1d6a89c`)

95. Segment 2 build: Story B before Story A, one commit each, stop before push; gavels 1–5, 7 recorded. — `SEGMENT-2-SPEC.md:5-11`
96. **Copy law (9b):** no new teaching string ships without owner approval; the 10–15% net benchmark is killed; "the truck payment" struck from the Overhead teach line; unapproved rung slots render nothing. — `SEGMENT-2-SPEC.md` (Ruled §, COPY LAW)
97. **Tier rule (9c):** tier is derived from quote status (`tierOf`) only — never a user-facing toggle. — `SEGMENT-2-SPEC.md` (Ruled §, Tier rule)
98. **Call 1:** Analyze is a dedicated `/analyze/[id]` full-screen route. — `SEGMENT-2-SPEC.md` (Ruled §, Call 1)
99. **Call 2:** dead-lane job click opens PLANNING Analyze (failed-bid post-mortem); never to the Map, never "Revenue." — `SEGMENT-2-SPEC.md` (Ruled §, Call 2)
100. **Call 5 (Option A):** the Money Map's full view converges to `/analyze/[id]`; the Layer-2 modal is retired — one full-screen ladder, three doors. — `SEGMENT-2-SPEC.md` (Call 5 restated)
101. **Call 7 (9a):** PLANNING hero band reads "Projected Net Profit" — never "Net Profit" unqualified. — `SEGMENT-2-SPEC.md` (Ruled §, Call 7)

> **Note:** Group G cites the file by section (the spec has no line prefixes in the sweep tooling
> pass); §-anchors are stable across redeploys. The behaviors in 96–101 are ALSO now live in code
> (`components/MoneyMapLadder.tsx`, `app/analyze/[id]/page.tsx`, `app/page.tsx`, `app/quotes/page.tsx`)
> but that code is outside the sweep's stated scope (specs + tests), so it is flagged, not extracted.

---

## Cross-file flags (unchanged from the original sweep, re-confirmed @ `1d6a89c`)

- **B-41 vs C-61 vs G-100:** the runbook's "no auto-feed" is contradicted by the pipeline spec
  (auto-feed from confirmed jobs) and now further by Segment 2 (the full view is the `/analyze`
  route). The repo already marks it superseded; the Book should canonize C-61 / G-100.
- **B-27/28 (M-1 firewall) is a law without a fence:** stated as a *suggested* grep/CI guard
  (`BUILD-F-SCOPING.md:152`) but no such check exists in the swept test suites.
