# Sales Tracker Module — Gaveled Spec

**Status:** Gaveled by Tom, 2026-07-31. Replaces the **Pricing Tracker by Work Type** and **Compiled Tracker Totals** sheets of the source Excel workbook. Build is **Tier 2** and lands in walked steps.

---

## Founding Principle — A View, Not a Ledger

Tracker rows are **never entered**. They **derive** from saved quotes and job actuals that already exist (Law 9). A bid is born once in the pricer; the tracker is a **window** onto it. Nothing is re-typed, so nothing can drift or be forgotten.

---

## The Row (all derived)

Bid date · customer (by **id**) · work type · **bid amount** (frozen `totalRevenue`, Law 56) · GP at bid · margin · salesperson (roster **id**) · status · actual revenue · actual GP · actual GP percent · objection (lost bids) · notes.

---

## Status Vocabulary

Maps to the existing quote lifecycle:

- **Bid** = sent and outstanding.
- **Accepted** = accepted.
- **Lost** = closed-loss. PMZ says "Lost" plainly; the source workbook called this **"Closed"** — translation recorded here for migration.

**RULING:** Draft quotes are **excluded from all tracker math** — never presented to a customer, dead information.

---

## Loss Capture

Marking a quote **Lost** prompts for the **objection**: pick-list (**price, timing, competitor, scope, no response**) plus free text, **searchable**. Confirm-and-carry in the **Law 50** spirit — skippable, but only by saying so explicitly.

*Framed door, not built now:* competitor bid capture on lost commercial bids with a **source-confidence** field — a separate data class, never blended (Law 5).

---

## The Scoreboard (all derived, never stored)

Per work type and all-up: win/loss ratios **BOTH by dollars and by count**, accepted GP, blended margin. **Both ratio families are mandatory** — count and dollars tell different truths.

---

## Three Scorecards

Each scorecard measures only what its holder **controls** and shows only what its holder **may see**.

- **Owner scorecard** — everything: all salespeople side by side, all crews, goals vs actuals across the company.
- **Salesperson scorecard** — their own book only: wins, losses, sales and margin vs goals. Goals per salesperson per segment (sales dollars, margin percent) are entered by the **boss** (Law 82).
- **Foreman / execution scorecard** — estimated hours vs actual hours, crew time, jobs closed clean. **NEVER shows margin** — beating estimated hours is the foreman's contribution to margin whether he sees the percentage or not. Performance incentive layer on top: **labor/crew-time based ONLY**, percentage editable and toggleable by the owner.

---

## Visibility — Toggles for Preferences, Laws for Walls

The owner controls what each role sees, in the spirit of the quote **details / no-details** option. Visibility toggles live in **Company settings** beside the change-order ceiling. Examples:

- salespeople see each other's scorecards (**leaderboard mode**) on/off;
- salesperson sees **GP dollars** vs **goal-attainment only**;
- foreman sees **crew-vs-crew** comparison on/off.

Defaults ship as this spec reads — **own book only**.

**HARD WALL, NOT A TOGGLE:** the **foreman-never-sees-margin** rule is gaveled law; **no setting may exist that exposes margin to the foreman role.** In beta, visibility settings are **stored and honored on screen**; true enforcement arrives with the backend permissions matrix.

---

## Fences

The source workbook's hand-written cross-checks become **automated tests**:

- ratios must sum;
- every non-draft quote appears in **exactly one** status bucket;
- work-type filters derive from **work-type ids** (never hand-typed strings — the source workbook's silent filter bugs become **impossible by construction**).

**Mutation test required before the build ships.**
