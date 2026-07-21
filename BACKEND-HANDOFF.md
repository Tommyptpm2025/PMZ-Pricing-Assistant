# BACKEND-HANDOFF.md

**Audience:** Kennedy — backend engineer building the production backend for PMZ Pricing Assistant.
**Purpose:** an accurate map of what exists today, written from the code, so a backend snaps in rather than fights the front end.

**Originally verified against commit `8203f31`, Jul 20 2026; §10.1 and §10.2 updated at `d246303` the same day.** Every claim below carries a `file:line` cite. Law references cite edition + number per **Law 78 (Edition Citation Law)**; the canon is `BOOK-OF-LAWS.md` at repo root, now at **v0.2.2** — read it directly, never a summary. Cites written as "v0.2.1 Law N" below were correct at the time of writing and remain valid for laws unchanged in v0.2.2; Laws 19, 56 and 65 were amended Jul 20 — read those at v0.2.2.

**Accuracy discipline:** anything I could not confirm from the code is marked **TODO** and left open. Nothing here is inferred from a name. Where the code contradicts the intent, §10 says so plainly.

---

## 1. SYSTEM OVERVIEW

### Stack

| Piece | Version | Cite |
|---|---|---|
| Next.js (App Router, Turbopack in dev) | 16.1.7 | `package.json:19` |
| React / React DOM | 19.2.4 | `package.json:22-23` |
| TypeScript | 5.9.3 | `package.json:40` |
| Tailwind CSS | 4.2.1 | `package.json:39` |
| UI kit | radix-ui 1.4.3 + shadcn 4.8.1 | `package.json:21,24` |
| PDF | `@react-pdf/renderer` 4.5.1 | `package.json:15` |

Scripts — `package.json:6-13`: `dev`, `build`, `start`, `lint`, `format`, `typecheck` (`tsc --noEmit`).

### There is no backend today

This is the single most important fact for your planning:

- **Zero API routes.** No `app/api/**`, no `route.ts` anywhere in the repo (verified by search at `8203f31`).
- **Zero server components doing data work.** Every page under `app/` is `"use client"` except `app/layout.tsx`, `app/materials/page.tsx`, and `app/reports/page.tsx` — and the latter two are static placeholders (`app/materials/page.tsx:18`, `app/reports/page.tsx:18-20`).
- **No database, no ORM, no auth, no network calls.** `next.config.mjs` is empty (`next.config.mjs:1-4`).
- **No user model of any kind.** I searched for role / auth / session / login / sponsor / IDP / superuser across all `.ts`/`.tsx`/`.mjs`. The only hits are ARIA attributes, shadcn component props, and `scripts/superuser-status.test.mjs` — which is about *status locks*, not users. **Sections 6 and 7 therefore describe requirements, not existing code.**

### Deploy target

Vercel, via Git integration. There is no `vercel.json`, no `.github/` workflows, and no CI config in the repo — deploy is triggered by push to `main`.

The verification sequence is a standing law — **v0.2.1 Law 69 (Verify Before Push)** and `CLAUDE.md:45-46`: confirm the deploy for *that exact commit* is green → hard refresh (Ctrl+F5) → then test. A browser holding the pre-deploy build reads as a phantom bug.

### Persistence: localStorage, origin-scoped

All state lives in the browser's `localStorage` (one key in `sessionStorage`). This has a consequence that governs local work — **v0.2.1 Law 45 (One-Address Rule)**, `CLAUDE.md:37-41`:

> localStorage is scoped to `host:port`. Two dev servers on two ports = two separate data cabinets = split-brain data.

All local work happens on **`http://localhost:3007`**, never a second parallel server. On 2026-07-08 a 26-key export/import migration was needed to reunite data stranded under `:3000`.

**For you:** origin-scoping is exactly the property that disappears when you introduce a server. Data currently keyed to a browser origin becomes data keyed to a user identity. §8 covers the mapping.

### Product vs. test bench

- **Product surfaces** — `app/project-pricer/page.tsx` (~4,000 lines, the primary file), `app/quotes/page.tsx`, `app/page.tsx` (Overview / Money Map / Pipeline), `app/analyze/[id]/page.tsx`, `app/customers/page.tsx`, `app/overhead-profit/page.tsx`, `app/jobs/page.tsx`, and the rate builders (`app/labor-rates`, `app/equipment-rates`, `app/material-rates`, `app/miscellaneous-rates`, `app/work-types`, `app/crew-builder`, `app/company-setup`).
- **Placeholders, not product** — `app/materials/page.tsx` and `app/reports/page.tsx` are static cards with "placeholder" / "Coming soon" badges. Do not treat them as a spec.
- **Test bench** — `scripts/*.test.mjs`, three suites, plain Node with `node:assert/strict`. No Jest/Vitest, no test runner dependency. §5.

> **TODO (unconfirmed):** `app/reports/page.tsx:20` reads *"Available after Supabase persistence is added."* That is the only mention of a backend technology anywhere in the repo. Treat it as a stale hint of prior intent, **not** a decision — the datastore choice is open and is Tom's call.

---

## 2. DATA SHAPES

**25 storage keys** — 24 `localStorage` + 1 `sessionStorage`. Below: every key, its owner module, its type, and one JSON example.

**Read this first — three repo-wide facts about the persisted data:**

1. **No key stores a version number in its payload.** Five keys carry a version in the *key name* (`pmz_work_types_v2`, `pmz_current_estimate_v1`, `pmz_current_lem_v1`, `pmz_jobs_v1`, `pmz_pnl_worksheet_v1`) but **none has migration code reading a prior version**. The version suffixes are naming convention only.
2. **Most guards are `try/catch` + `Array.isArray` + `|| []`.** Real schema normalization exists in only three places: `lib/company-settings.ts:121-136`, `lib/pnl-worksheet.ts:53-73`, `lib/rate-store.ts:70-79` (labor only).
3. **Several exported types in `lib/pmz-types.ts` do NOT describe what is persisted.** `LaborRate` (`:79-100`), `EquipmentRate` (`:112-142`), `MaterialRate` (`:144-154`), and `WorkType` (`:163-169`) look authoritative and are **not** the on-disk shapes. The real persisted shapes are in `lib/rate-store.ts:5-38` and `app/work-types/page.tsx:35-40`. **Do not model your schema off the `pmz-types.ts` rate types.** See §10.

### 2.1 `pmz_saved_quotes` — the central record

Key: `lib/quote-storage.ts:10`. Read `:17`; write `:37`, `:59`. Type `SavedQuote[]` — `lib/pmz-types.ts:254-307`.

This is the spine of the whole system. The Pipeline, Money Map, Boss View, Analyze route, and Overhead page all read it.

Required: `id`, `quoteType` (`"EPP" | "Full"`), `jobName`, `customerId`, `workTypeId`, `salesperson`, `status`, `locked`, `statusHistory`, `eppLineItems`, `proLemItems`, `targetGpPercent`, `targetGpSource`, `totalRevenue`, `directCogsDollars`, `indirectCogsDollars`, `grossProfitDollars`, `grossProfitPercent`, `customer`, `workType`, `createdAt`, `updatedAt`.
Optional: `estimator`, `sentAt`, `decidedAt`, `decisionNote`, `targetMargin` (legacy alias for `targetGpPercent`), `rateProfileSnapshot`, `quoteNumber`, `termsText`, `customerName`, `billingAddress`, `jobSiteAddress`, `customerDetails`, `grossProfitAmount`, `grandTotal`.

```json
{
  "id": "q_1752900000000_ab12cd",
  "quoteType": "EPP",
  "jobName": "Riverside Lot Repave",
  "customerId": "c_1752800000000_zz01",
  "workTypeId": "wt_paving",
  "salesperson": "Tom Peterson",
  "estimator": "Dana Reyes",
  "status": "Ready to Invoice",
  "locked": true,
  "statusHistory": [
    { "status": "Draft",             "at": "2026-07-01T14:02:11.004Z" },
    { "status": "Ready for Approval","at": "2026-07-03T16:41:09.220Z" },
    { "status": "Approved",          "at": "2026-07-05T09:15:44.870Z" },
    { "status": "Scheduled",         "at": "2026-07-06T11:00:02.101Z" },
    { "status": "In Progress",       "at": "2026-07-09T07:30:55.640Z" },
    { "status": "Ready to Invoice",  "at": "2026-07-15T17:20:30.912Z" }
  ],
  "sentAt": "2026-07-03T16:41:09.220Z",
  "decidedAt": "2026-07-05T09:15:44.870Z",
  "decisionNote": "Accepted verbally, PO to follow",
  "eppLineItems": [
    { "id": "paving", "description": "Paving", "quantity": 4000, "unit": "SF", "unitPrice": 7 },
    { "id": "siteprep", "description": "Site Prep", "quantity": 1, "unit": "LS", "unitPrice": 29495.28, "priceOverridden": true }
  ],
  "proLemItems": [],
  "targetGpPercent": 38,
  "targetGpSource": { "workTypeId": "wt_paving", "pricingTierId": "tier_mid" },
  "totalRevenue": 57495.28,
  "directCogsDollars": 31200.00,
  "indirectCogsDollars": 4180.00,
  "grossProfitDollars": 22115.28,
  "grossProfitPercent": 38.5,
  "customer": "Riverside Property Group",
  "workType": "Paving",
  "quoteNumber": "Q-1042",
  "termsText": null,
  "customerName": "Riverside Property Group",
  "grandTotal": 57495.28,
  "createdAt": "2026-07-01T14:02:11.004Z",
  "updatedAt": "2026-07-15T17:20:30.912Z"
}
```

Nested types: `LineItem` — `lib/pmz-types.ts:201-214`; entry shapes (`LaborEntry`/`EquipmentEntry`/`MaterialEntry`/`MiscEntry`/`CrewUsage`) — `:173-199`, all inner fields optional. `LemItem` — `:216-224` (`id`, `resourceType` `"labor"|"equipment"|"material"`, `rateId`, `label`, `quantity`, `frozenUnitCost`, `bucket` `"direct"|"indirect"`), all required.

**Guards:** array check plus a duplicate-`id` de-dup that **rewrites storage in place** on read (`lib/quote-storage.ts:20-39`). Note it mints ids via `Date.now()` + `Math.random()` (`:28`) — not collision-proof under a server.

**Two writers, one key.** `lib/quote-storage.ts` is the typed layer, but `app/project-pricer/page.tsx:1631-1675` writes this key **directly**, bypassing it. The key string is also hardcoded at `app/quotes/page.tsx:263,482,711`; `app/project-pricer/page.tsx:650,762,818,1504,1675`; `app/page.tsx:244,311,342`; `app/analyze/[id]/page.tsx:27`; `app/overhead-profit/page.tsx:94` — despite `lib/quote-storage.ts:4` instructing "Do not use these keys anywhere else."

**Typing is nominal.** `SavedQuote` is declared, but every reader outside the lib parses to `any` (e.g. `app/overhead-profit/page.tsx:92`, `app/project-pricer/page.tsx:653`). The on-disk shape is **not** enforced at read time. Assume dirty data.

### 2.2 `pmz_overhead_chart` — the overhead ledger

Key: `app/overhead-profit/page.tsx:24`. Read `:101`; write `:118`. Also read at `app/page.tsx:254,313` and `app/analyze/[id]/page.tsx:30`.

Type: **local, non-exported** `interface OverheadChart` — `app/overhead-profit/page.tsx:47-58`. Required: `items: OverheadItem[]`, `monthlyRevenue`, `monthlyCogs`, `billableHours` (numbers), `notes` (string). Optional: `source?: "manual" | "pnl-organizer"`, `sourceAppliedAt?: string`. `OverheadItem` — `:40-45`: `id`, `category` (string), `amount` (number), `behavior` (`"Fixed" | "Variable"`).

```json
{
  "items": [
    { "id": "oh_rent",      "category": "Rent",            "amount": 4200,    "behavior": "Fixed" },
    { "id": "oh_ins",       "category": "Insurance",       "amount": 1850.5,  "behavior": "Fixed" },
    { "id": "oh_fuel",      "category": "Fuel",            "amount": 2300,    "behavior": "Variable" }
  ],
  "monthlyRevenue": 250000,
  "monthlyCogs": 160000,
  "billableHours": 1040,
  "notes": "Q3 baseline",
  "source": "pnl-organizer",
  "sourceAppliedAt": "2026-07-12T10:04:00.000Z"
}
```

**This store feeds the Money Map's overhead allocation** — `moneyMapForJob` reads `chart.items[].amount` and `chart.monthlyRevenue` (`lib/pipeline.ts:184-187`). See §4.5.

**Two behaviors to preserve:**
- `behavior` is backfilled to `"Fixed"` on load for charts saved before V/F tagging shipped (`:108`).
- An **empty saved chart is silently discarded** — `:104` only applies the parsed chart `if (parsed.items && parsed.items.length > 0)`. A user who deletes every line gets the previous in-memory chart back, not an empty one. Flagged in §10.

Governing law: **v0.2.1 Law 51 (Overhead Store & Math)** — Overhead = Σ `chart.items.amount`; **v0.2.1 Law 33 (Single-Door Input)** — overhead enters through the P&L Organizer only; the manual chart is a read-only ledger (Billable Hours excepted).

### 2.3 Equipment / labor / material / misc rate profiles

All four live in `lib/rate-store.ts`, synced across tabs via a custom `'pmz-rates-updated'` event (`:45`) plus native `storage` events (`:149-155`). Every load path is `try/catch` → `[]`.

**Stored rates are true break-even cost — no overhead, no profit, no markup** (**v0.2.1 Law 29, Break-Even Rates**; `CLAUDE.md:9`). Do not let a backend "helpfully" bake anything in.

#### `pmz_equipment_rates` — `SavedEquipmentProfile[]`, `lib/rate-store.ts:9-28`

Key `:41`. Read `:93`; writes `:214,223,231`. **Guard: `Array.isArray` only — no normalization.**

```json
[
  {
    "id": "eq_skid75",
    "description": "Skid Steer 75HP",
    "serialNumber": "SN-448120",
    "unitNumber": "U-12",
    "meterReading": 3820,
    "meterUnit": "hours",
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "startingValue": 62000,
    "endingValue": 44000,
    "ownership": [ { "label": "Depreciation", "annual": 18000 } ],
    "operating": [ { "label": "Fuel", "annual": 9600 } ],
    "budgetedHours": 1200,
    "estimatedHours": 1150,
    "actualHours": 980,
    "targetMargin": 35,
    "utilizationPct": 100
  }
]
```

⚠️ **`ownership` and `operating` are typed `any[]`** (`lib/rate-store.ts:21-22`). The example contents above are **illustrative, not verified** — I did not confirm the inner shape from a typed declaration. **TODO: derive the real shape from `app/equipment-rates/page.tsx` before modeling these two columns.** Only optional field: `utilizationPct?` ("default 100; legacy records omit it", `:25`).

#### `pmz_labor_rates` — `SavedLaborRate[]` = `LaborRateInputs & { id: string }`, `lib/rate-store.ts:5-7`

Key `:40`. Read `:66`; writes `:182,191,199`. Also written directly, bypassing the store, at `app/labor-rates/page.tsx:177` (delete path). `LaborRateInputs` — `lib/calculations.ts:8-38`.

**This is the one store with real normalization** — `normalizeLaborRateInputs()` (`lib/calculations.ts:187`) spread over each raw record plus id regeneration (`lib/rate-store.ts:70-79`).

```json
[
  {
    "id": "lr_operator",
    "role": "Operator",
    "baseWage": 32.00,
    "payrollTaxes": 9.5,
    "workersComp": 7.2,
    "pto": 4.0,
    "supervision": 6.0,
    "downtime": 5.0,
    "targetMargin": 38,
    "perDiem": 0,
    "healthAndWelfare": 3.10,
    "pension": 2.40,
    "training": 0.35,
    "otherFixedFringes": 0,
    "generalLiabilityPerThousand": 12.5
  }
]
```

`benefits?: number` is optional and legacy — "kept for backward compatibility with old saved rates" (`lib/calculations.ts:35-37`). Carry it; don't require it.

#### `pmz_material_rates` and `pmz_misc_rates` — both `SavedMaterialProfile[]`, `lib/rate-store.ts:30-38`

Keys `:42` and `:43`. Material: read `:110`, writes `:246,255,263`. Misc: read `:127`, writes `:303,312,320`. **Misc reuses the material interface verbatim** — `:295` comments "Misc (independent from material, same shape)". Two keys, one shape. Guard: `Array.isArray` only.

```json
[
  {
    "id": "mat_gravel34",
    "description": "3/4\" Crushed Gravel",
    "unitOfMeasure": "TON",
    "baseCost": 28.50,
    "deliveryCost": 6.25,
    "supplier": "Valley Aggregate",
    "notes": "Price holds through Q3"
  }
]
```

### 2.4 `pmz_jobs_v1` — foreman work orders (LIVE)

Key: `lib/jobs.ts:119` (`JOBS_STORAGE_KEY`). Read `:127`; write `:138`. Callers: `app/jobs/page.tsx:99`, `app/quotes/page.tsx:673`. Type `Job[]` — `lib/jobs.ts:80-117`.

```json
[
  {
    "id": "job_1752950000000",
    "createdAt": "2026-07-06T11:00:02.101Z",
    "status": "open",
    "jobName": "Riverside Lot Repave",
    "workTypeName": "Paving",
    "salesperson": "Tom Peterson",
    "contractValue": 57495.28,
    "bidItems": [ { "id": "paving", "description": "Paving", "quantity": 4000, "unit": "SF" } ],
    "recipe": [ { "id": "r1", "type": "labor", "profileId": "lr_operator", "description": "Operator", "quantity": 16 } ],
    "actuals": { "r1": 18 },
    "recipeLines": [ { "id": "rl1", "label": "Operator hours", "plannedQty": 16, "actualQty": null } ],
    "attachments": [],
    "quoteId": "q_1752900000000_ab12cd",
    "customerName": "Riverside Property Group",
    "jobSite": { "address": "1200 Riverside Dr" },
    "intakeNotes": "Gate code 4417",
    "notes": ""
  }
]
```

`status` is `"open" | "completed"` (`lib/jobs.ts:84`). `JobRecipeRow` carries `actualQty: number | null` where **null means "not entered"** — distinct from zero (`lib/jobs.ts:52-58`). Preserve that distinction; collapsing null→0 would fabricate a foreman's confirmation. Guard: `Array.isArray` only (`:130`).

⚠️ Field shapes inside `bidItems` / `recipe` / `recipeLines` / `attachments` above are illustrative. Their interfaces are at `lib/jobs.ts:38-44`, `:30-36`, `:66-71`, `:74-78` — **read those before modeling.**

### 2.5 `pmz_customers`

Key: `app/customers/page.tsx:33`. Read `:368`; write `:386`. Also read/written in the Pricer at `app/project-pricer/page.tsx:585,610,688,1742,1767`. Type `Customer[]` — `lib/pmz-types.ts:3-70`.

Required: `id`, `name`, `createdAt`, `updatedAt`. **Everything else is optional** — contact fields, `preferredContact`, `decisionMakerContact` (`:18-25`), legacy `altContact` (`:28-35`), `billingAddress` (`:36-45`), `jobSiteAddress` (`:46-58`, includes lat/long/accessNotes), `paymentTerms`, `apContact`, `externalIds` (`{odoo?, quickbooks?, sage?}`), `tags`, `notes`.

```json
[
  {
    "id": "c_1752800000000_zz01",
    "name": "Riverside Property Group",
    "contactName": "Maria Alvarez",
    "isDecisionMaker": true,
    "phone": "5095550142",
    "email": "maria@riversidepg.com",
    "preferredContact": "Email",
    "billingAddress": { "line1": "PO Box 88", "city": "Spokane", "state": "WA", "postalCode": "99201" },
    "jobSiteAddress": { "line1": "1200 Riverside Dr", "city": "Spokane", "state": "WA", "accessNotes": "Gate code 4417" },
    "paymentTerms": "Net 30",
    "externalIds": { "quickbooks": "QB-4471" },
    "tags": ["commercial", "repeat"],
    "createdAt": "2026-05-02T18:00:00.000Z",
    "updatedAt": "2026-07-01T14:02:11.004Z"
  }
]
```

🔴 **Date hazard — confirmed.** `createdAt` / `updatedAt` are declared `Date` (`lib/pmz-types.ts`) but JSON-serialize to **strings**. Both readers rehydrate with `new Date(...)` — `app/customers/page.tsx:371-375` and `app/project-pricer/page.tsx:588-592` — and the parse variable is `any[]` in both. **A backend must serve these as ISO strings and let the client rehydrate, or fix both call sites together.** The declared type lies about what's on disk.

**TODO:** `lib/pmz-types.ts:26-27` comments a legacy `altContact` → `decisionMakerContact` migration "on edit". I did not read the edit path; **unconfirmed whether that migration code exists.**

### 2.6 Company / registry / terms stores

| Key | Owner | Type | Guard |
|---|---|---|---|
| `pmz_company_settings` | `lib/company-settings.ts:52` (read `:141`, write `:152`) | `CompanySettings`, `:18-50` — single object | ✅ real deep-merge `normalize()` `:121-136` |
| `pmz_estimators` | `lib/estimators.ts:23` (read `:38,96`, write `:60`) | `Estimator[]`, `:13-21` | ✅ filters nameless, regenerates ids, defaults `active` `:36-56` |
| `pmz_salespeople` | `lib/salespeople.ts:19` (read `:33,86`, write `:54`) | `Salesperson[]`, `:10-17` | ✅ same normalize pattern `:31-50` |
| `pmz_terms` | `lib/terms.ts:15` (read `:22`, write `:34`) | `TermsBlock[]`, `:7-13` | `Array.isArray` only `:25` |
| `pmz_pnl_worksheet_v1` | `lib/pnl-worksheet.ts:35` (read `:56`, write `:78`) | `PnlWorksheet`, `:18-21` | ✅ validates types, backfills id `:53-73` |
| `pmz_work_types_v2` | `app/work-types/page.tsx:21` (read `:310`, write `:323`) | wrapper `{ workTypes }` | `Array.isArray(parsed.workTypes) && length > 0` `:313` |
| `pmz_crews` | literal only — `app/crew-builder/page.tsx:78,93,102`; Pricer `app/project-pricer/page.tsx:933,952` | local `Crew`, `:37-42` | `Array.isArray` only |

`pmz_company_settings` — five nested groups, **every leaf a required `string`** (numbers stored as strings, coerced by `normalize()`):

```json
{
  "company": { "legal_name": "Peterson Paving LLC", "short_name": "Peterson Paving", "website": "petersonpaving.com", "phone": "5095550100", "email": "office@petersonpaving.com", "address": "410 Industrial Way", "city_state_zip": "Spokane, WA 99201", "year_founded": "2009", "years_experience": "17", "payment_methods": "Check, ACH, Card" },
  "terms": { "deposit_pct": "25", "balance_due_days": "30", "late_interest_monthly_pct": "1.5", "change_order_deposit_pct": "50", "cancellation_fee_pct": "10", "quote_validity_days": "30" },
  "lien": { "state": "WA", "state_notice_text": "Notice to Owner...", "withhold_days": "45" },
  "legal": { "utility_locator": "811" },
  "process": { "cure_avoid_hours": "24" }
}
```

`pmz_work_types_v2` — note the **wrapper object**, not a bare array, and note this `WorkType` is the *local* one (`app/work-types/page.tsx:35-40`), not `lib/pmz-types.ts:163-169`:

```json
{
  "workTypes": [
    {
      "id": "wt_paving",
      "name": "Paving",
      "notes": "Commercial lots",
      "tiers": [
        { "id": "tier_small", "low": 0,      "high": 25000, "targetGpPercent": 42, "label": "Small" },
        { "id": "tier_mid",   "low": 25000,  "high": 100000,"targetGpPercent": 38, "label": "Mid" },
        { "id": "tier_large", "low": 100000, "high": null,  "targetGpPercent": 33, "label": "Large" }
      ]
    }
  ]
}
```

`high: null` means "no upper bound" — the open-ended top tier. Preserve null; don't coerce to 0 or Infinity.

Remaining examples, compact:

```json
// pmz_estimators  (lib/estimators.ts:13-21)
[{ "id": "est_dana", "name": "Dana Reyes", "title": "Senior Estimator", "email": "dana@petersonpaving.com", "phone": "5095550188", "active": true, "createdAt": "2026-03-01T00:00:00.000Z" }]

// pmz_salespeople  (lib/salespeople.ts:10-17)
[{ "id": "sp_tom", "name": "Tom Peterson", "email": "tom@totalprofitmanagement.com", "phone": "5095550100", "active": true, "createdAt": "2026-03-01T00:00:00.000Z" }]

// pmz_terms  (lib/terms.ts:7-13) — exactly one isDefault enforced at :86-96, :105-107
[{ "id": "terms_std", "name": "Standard Terms", "body": "Payment due Net 30...", "isDefault": true, "updatedAt": "2026-06-10T00:00:00.000Z" }]

// pmz_pnl_worksheet_v1  (lib/pnl-worksheet.ts:10-21)
{ "revenue": 250000, "lines": [ { "id": "pl_1", "label": "Crew wages", "amount": 96000, "bucket": "Direct COGS", "behavior": "Variable" }, { "id": "pl_2", "label": "Rent", "amount": 4200, "bucket": "Overhead", "behavior": "Fixed" } ] }

// pmz_crews  (app/crew-builder/page.tsx:37-42)
[{ "id": "crew-a", "name": "Grade Crew", "laborLines": [ { "profileId": "lr_operator", "quantity": 2 } ], "equipmentLines": [ { "profileId": "eq_skid75", "quantity": 1 } ] }]
```

⚠️ `pnl-worksheet`'s loader validates `revenue`, `amount`, `id`, and `behavior` — but **passes `bucket` through unvalidated** (`lib/pnl-worksheet.ts:66`). An unknown bucket string survives the load. Validate it server-side.

### 2.7 Scratch / handoff / UI-state keys

These are **transient cross-page handoffs and UI preferences**. They are the Quotes tab handing state to the Pricer. A backend should almost certainly **not** persist most of these — but you must know they exist, because clearing storage without understanding them breaks the "edit this quote" flow.

| Key | Shape | Cites |
|---|---|---|
| `pmz_current_estimate_v1` | `CurrentEstimate` (local, `app/project-pricer/page.tsx:133-144`) | write `:875,899`; read `:601,680,896`; **also written with a different shape** by `app/quotes/page.tsx:422-430` |
| `pmz_current_lem_v1` | `LemItem[]` on write; adapted to local `RealLEMItem` (`:146-153`) on read | write `app/quotes/page.tsx:436-439`; read `app/project-pricer/page.tsx:732`, adapter `:737-744` |
| `pmz_current_quote_id` | bare `string` (no JSON) | write `app/quotes/page.tsx:433`, `app/project-pricer/page.tsx:1677`; read `:816`; self-heal remove `:824` |
| `pmz_current_quote_readonly` | bare string `"true"` | write `app/quotes/page.tsx:445`; read `app/project-pricer/page.tsx:808` |
| `pmz_pricer_focus` | `{ lineIds, fields, scrollTo? }` — consume-once | write `app/quotes/page.tsx:452`; read + immediate remove `app/project-pricer/page.tsx:836,838` |
| `pmz_bid_items_collapsed` | stringified boolean | write `app/project-pricer/page.tsx:910`; read `:671` |
| `pmz_pro_view_collapsed` | stringified boolean | write `:917`; read `:923` |
| `pmz_quote_logo` | raw base64 data-URL string | write `app/company-setup/page.tsx:74`; read `app/quotes/page.tsx:215`, `app/project-pricer/page.tsx:436` |
| `theme` | bare string, effectively `"light"\|"dark"` | `components/theme-provider.tsx:84,99,108`; pre-hydration script `app/layout.tsx:51,59` |
| `pmz_epp_print_quote` | **sessionStorage** — untyped object literal | write `app/project-pricer/page.tsx:1844`; read `:453` |

```json
// pmz_current_estimate_v1 — Pricer's write shape (app/project-pricer/page.tsx:133-144)
{ "jobName": "Riverside Lot Repave", "workTypeName": "Paving", "salesperson": "Tom Peterson", "estimator": "Dana Reyes", "estimatedRevenue": 57495.28, "customerName": "Riverside Property Group", "customerId": "c_1752800000000_zz01", "bidItems": [] }
```

🔴 **`pmz_current_estimate_v1` has two writers with different shapes.** The Quotes tab writes `{ jobName, workTypeName, salesperson, estimatedRevenue, bidItems, customer }` (`app/quotes/page.tsx:422-430`) — **no `estimator`, no `customerId`/`customerName`, and `customer` where the Pricer writes `customerName`.** The Pricer's read absorbs this with a fallback chain at `:618-629` (`saved.bidItems || saved.eppLineItems`, `saved.customerName || saved.customer`, `saved.workTypeName || saved.workType || saved.workTypeId`). **That informal fallback chain is the only "migration" on this key.** Same pattern on `pmz_current_lem_v1` at `:737-744`.

**`pmz_epp_print_quote`** (sessionStorage, `app/project-pricer/page.tsx:1826-1843`) carries `{ quoteData, options: {...}, logoDataUrl, exportType, termsText }`. **TODO: `quoteData` is `buildQuoteData(estimate)` and I did not read that function's return type — shape unconfirmed.**

### 2.8 Dead / orphaned keys — do NOT migrate

Four keys are written but **never read back**. Confirm with Tom before carrying any of them.

| Key | Where | Status |
|---|---|---|
| `pmz_epp_quotes` | `app/project-pricer/page.tsx:236-263`, append at `:259` | **Append-only, never read.** Element typed `any[]` (`:246`). Grows unbounded. |
| `pmz_pro_quotes` | `app/project-pricer/page.tsx:265-290`, write `:286` | **Never read back.** Element typed `any[]`. |
| `pmz_jobs` (no `_v1`) | `lib/quote-storage.ts:11`, read `:48`, write `:67` | **Dead code.** `saveJob`/`getAllJobs`/`getJobById`/`updateJob` (`:137,151,160,165`) are called nowhere in the repo. Its `Job` type (`lib/quote-job-types.ts:27-36`) has `actuals?: any` ("loose for now", `:35`) and a status union `'Open'\|'In Progress'\|'Complete'` that **conflicts with the live `pmz_jobs_v1`** union `"open"\|"completed"` (`lib/jobs.ts:84`). |
| `pmz_customer_draft` | `app/customers/page.tsx:54`, write `:404` (debounced 500ms), read `:412`, remove `:393` | Live but **UI-local draft recovery only.** `{ form, editingId }`, `form` has no interface. Not business data. |

⚠️ Two of these (`pmz_epp_quotes`, `pmz_pro_quotes`) are **unbounded append-only writes on every save**. If a user has been working for months, they may hold significant dead weight. Worth checking storage size before any export-based migration.

---

## 3. STATUS LIFECYCLE

### 3.1 Canonical lifecycle — v0.2.1 Law 19

```
Draft → Sent for Acceptance → Accepted → Scheduled → Work Order Active
      → Ready to Invoice → Invoiced → Paid → Completed
Declined, Lost = terminal dead lane
```

Per **v0.2.1 Law 19 (Status Lifecycle Language)** these words are the **only** permitted status/phase vocabulary on any product surface. Invented groupings — "Won," "In Production," "Bidding," "Realized" — are **barred from headers and labels**. "Sent" is informal shorthand only. "DEAD LANE" is a permitted surface term for the terminal lane (gaveled Jul 18, `dba8616`).

### 3.2 🔴 Stored keys ≠ surface labels — the C-1 gavel

**This is the single highest-risk item in this document for a backend engineer.** The strings in storage are **not** the canonical words.

Stored union `QuoteStatus` — `lib/pmz-types.ts:230-241` (11 members). Label map `STATUS_LABELS` — `lib/pmz-types.ts:366-378`. Accessor `statusLabel()` — `:381-383`.

| Stored key (on disk, in your DB) | Display label (canonical) |
|---|---|
| `"Draft"` | Draft |
| **`"Ready for Approval"`** | **Sent for Acceptance** |
| **`"Approved"`** | **Accepted** |
| `"Declined"` | Declined |
| `"Lost"` | Lost |
| `"Scheduled"` | Scheduled |
| **`"In Progress"`** | **Work Order Active** |
| `"Ready to Invoice"` | Ready to Invoice |
| `"Invoiced"` | Invoiced |
| `"Paid"` | Paid |
| `"Completed"` | Completed *(legacy)* |

**Exactly three keys diverge.** The other eight are identity mappings.

The governing gavel — **RESOLVED R-4** in `BOOK-OF-LAWS.md:124`, Tom, Jul 17, verbatim:

> *"Stored status keys are not a product surface. Canonical labels map onto every surface now; the stored-key rename ships later as an additive migration (law 48) at a natural touch. No forced data migration. C-1 closed."*

**What this means for you:** persist the **legacy stored keys**. Do not "clean them up" into canonical names as part of standing up the backend unless Tom gavels that rename — and if he does, it ships under **v0.2.1 Law 48 (Additive Storage Migrations)**: new keys added *alongside* old ones, never destroying prior data. §8.3.

`"Completed"` is **retired from the forward flow** but kept in the union so legacy records type-check (`lib/pmz-types.ts:229,241`). It is **excluded from `STATUS_ORDER`** (`:331-342`) so it never appears in pickers — but it **is** in the qualifying money set (§4.1). Both facts are load-bearing.

### 3.3 Legal transitions

`STATUS_FLOW` — `lib/pmz-types.ts:314-326`:

```ts
"Draft":            ["Ready for Approval"],
"Ready for Approval": ["Approved", "Declined"],
"Approved":         ["Scheduled"],
"Declined":         ["Draft", "Ready for Approval", "Lost"],
"Lost":             [],   // terminal
"Scheduled":        ["In Progress"],
"In Progress":      ["Ready to Invoice"],
"Ready to Invoice": ["Invoiced"],
"Invoiced":         ["Paid"],
"Paid":             [],
"Completed":        [],   // legacy/terminal
```

Guard: `canTransition(from, to)` — `lib/quote-lifecycle.ts:15-17`. A backend enforcing transitions must honor this table, including `Declined`'s recovery back-routes to Draft / Ready for Approval and its write-off to Lost.

### 3.4 `tierOf` — tier is derived, never stored

`lib/pipeline.ts:20-24`:

```ts
export type PipelineTier = "PLANNING" | "CONFIRMED";
export function tierOf(status: string): PipelineTier {
  return CONFIRMED_STATUSES.has(status) ? "CONFIRMED" : "PLANNING";
}
```

**v0.2.1 Law 47 (Tier From Status)** — tier is derived from status only, never a user-facing toggle; PLANNING and CONFIRMED status sets are disjoint. Fenced at `scripts/pipeline-fence.test.mjs:55-60,116-119`.

**Do not add a `tier` column.** Deriving it is the law; storing it creates a second source of truth that can drift.

Two behaviors to know: the signature takes `string`, not `QuoteStatus`, so an **unrecognized value silently returns `"PLANNING"`**; and `"Declined"`/`"Lost"` also return `"PLANNING"` — the dead lane is never explicitly excluded here. Sole call site: `app/analyze/[id]/page.tsx:39`.

### 3.5 Status history and locks

Entry shape — `lib/pmz-types.ts:243-247`. **Two fields only, no actor and no note:**

```ts
export interface StatusHistoryEntry {
  status: QuoteStatus;
  at: string;   // ISO timestamp
}
```

⚠️ **There is no `who` on a status change.** The moment you add users (§6), this becomes an audit gap — a status change is legally and operationally interesting and currently records only *what* and *when*, never *who*. **Recommend adding an actor field under Law 48 (additive).** Tom's call.

`LOCKED_STATUSES` / `isStatusLocked()` — `lib/pmz-types.ts:347-360`. **Seven statuses lock:** `Approved`, `Scheduled`, `In Progress`, `Completed`, `Ready to Invoice`, `Invoiced`, `Paid`. Not locked: `Draft`, `Ready for Approval`, `Declined`, `Lost`.

🔴 **The lock rule differs between two paths — deliberately. Both must be preserved.**

| Path | Rule | Cite |
|---|---|---|
| Normal transition | `locked: quote.locked \|\| isStatusLocked(newStatus)` — **forward-only latch**, never clears | `lib/quote-lifecycle.ts:38` |
| Super-user jump | `locked: isStatusLocked(newStatus)` — **no latch**, so jumping backward **clears** the lock | `app/quotes/page.tsx:523` |

The latch exists because `locked` means "the bid snapshot is frozen" (`lib/pmz-types.ts:344`). The super-user override is the deliberate escape hatch. A backend that applies one rule to both paths breaks either the freeze guarantee or the override.

History is **appended** by `applyStatusChange` (`lib/quote-lifecycle.ts:22-45`), which also seeds a first entry for legacy quotes saved before `statusHistory` existed (`:31-34`). History is **replaced, not appended,** at three seed/reset sites: `app/project-pricer/page.tsx:1652-1654` (first save), `app/quotes/page.tsx:471` (new quote), and `app/quotes/page.tsx:541-556` (`superUserResetToDraft` — wipes history to a single Draft entry, forces `locked: false`, clears `sentAt`/`decidedAt`/`decisionNote`).

Consumer: `getDaysInCurrentStatus` reads only the last entry's `at` (`lib/pmz-types.ts:435-443`).

---

## 4. INVARIANTS THE BACKEND MUST NEVER BREAK

These are not style preferences. Each is a gaveled law with a fence test. **If your backend violates one, it is wrong even if it compiles and the tests you wrote pass.**

### 4.1 The qualifying set (money gate) — v0.2.1 Law 2

`lib/qualifying.ts:5`:

```ts
export const REALIZED_STATUSES = new Set<string>(["Invoiced", "Paid", "Completed"]);
```

Realized money = exactly these three stored statuses. Defined **once**, imported everywhere, never redefined — the file header calls membership "a locked convention — do not add/remove statuses without a ruling" (`lib/qualifying.ts:4`).

**Fence:** `scripts/pipeline-fence.test.mjs:41-43` — byte-identical to the frozen reference, and `Completed` explicitly asserted present.

### 4.2 The facts gate — v0.2.1 Law 3

`lib/pipeline.ts:18`:

```ts
export const CONFIRMED_STATUSES = new Set<string>(["Ready to Invoice", ...REALIZED_STATUSES]);
```

The facts gate is the money gate **plus exactly one status**. Note it is *constructed by spreading* the imported money gate — so `CONFIRMED ⊇ REALIZED` holds **structurally**, not by convention. That is **v0.2.1 Law 46 (Status Sets Import, Never Redefine)** made literal.

**Fence:** `scripts/pipeline-fence.test.mjs:45-48` — proves containment and asserts `CONFIRMED.size === REALIZED.size + 1`.

The two gates encode **v0.2.1 Law 1 (Two-Gate Law)**: the Money Map lights at foreman-confirmed facts (Ready to Invoice+); the Boss View lights at money (Invoiced+). *"If it isn't invoiced, it's not revenue."* The gap is intentional — an unbilled-work reminder.

**Backend rule:** derive the facts gate from the money gate in code. Never write two independent lists.

### 4.3 The Iron Guard — v0.2.1 Law 11 — no grand-total field exists

`lib/pipeline.ts:138-152`:

```ts
export interface PipelineRollup {
  phases: PhaseRoll[];
  dead: { count: number; jobs: PhaseJob[] };
}
```

**Exactly two keys.** PLANNING and CONFIRMED dollars are never summed together. The `dead` lane carries a `count` and `jobs` but **no money field at all**.

**Fence:** `scripts/pipeline-fence.test.mjs:110-119` — asserts `Object.keys(roll).sort()` is exactly `["dead","phases"]`, that `total`/`grandTotal`/`value` are all `undefined`, and that the PLANNING and CONFIRMED status sets are disjoint.

**Honest scope of the guard:** it is structural **at the boundary**, conventional past it. `PhaseRoll[]` is a plain array — nothing stops a consumer writing `rollup.phases.reduce((s,p) => s + p.value, 0)`. I checked the real consumer, `app/page.tsx`, and it does **not** do this; its only reduces are over realized-only quotes (`:250-251`) and overhead items (`:257`). Past the boundary the rule is held by comments (`app/page.tsx:337-338,573-574`) and a rendered disclaimer (`:599`).

⚠️ **Do not confuse two different things named "grand total":**
- `SavedQuote.grandTotal?` (`lib/pmz-types.ts:303`) — a **per-quote** document total. Legitimate, not a violation.
- `app/project-pricer/page.tsx:2002` — sums line items **within a single quote document**. Also legitimate.
- The Iron Guard forbids only a **cross-phase / cross-tier** sum. No such sum exists anywhere in the codebase (verified).

**Backend rule:** do not add a `SELECT SUM(...)` across pipeline phases, and do not expose a pipeline total in any API response. If a consumer wants one, that is a ruling for Tom, not an implementation detail.

### 4.4 The reconciliation invariant — v0.2.1 Law 14

Realized-phase revenue **===** Boss View revenue **===** the shared qualifying function. Enforced as a verified assertion, not documentation.

**Fence:** `scripts/pipeline-fence.test.mjs:103-108`:

```js
assert.equal(realizedRoll(seed).value, invoiced.revenue,
  "RECONCILE: pipeline realized value === salesFromInvoiced().revenue (the Boss View number)");
assert.equal(byKey.realized.directCogs + byKey.realized.indirectCogs, invoiced.cogs,
  "RECONCILE: realized direct+indirect === salesFromInvoiced().cogs");
```

Plus **list-level** reconciliation at `:129-132` — realized drill-down jobs `===` `qualifyingQuotes` members, by id. The drill-down can never show a job the total didn't count, or vice versa.

The point, per **v0.2.1 Law 15 (Reconciliation North Star)**: the owner must be able to predict the bookkeeper's month-end report before it lands. PMZ runs parallel to accounting; accounting confirms PMZ. **Any backend aggregation that produces a different revenue number than `salesFromInvoiced()` is a bug, however defensible its arithmetic.**

### 4.5 Frozen Map math — v0.2.1 Law 55

`moneyMapForJob` — `lib/pipeline.ts:180-200` — is a **verbatim port** of the Overview's former inline math, and must stay byte-identical:

```ts
const totalOverhead = chart.items.reduce((s, it) => s + num(it?.amount), 0);
const overheadRate   = chart && chart.monthlyRevenue > 0 ? totalOverhead / chart.monthlyRevenue : 0;
const overhead       = Math.round(rev * overheadRate);
const grossProfit    = rev - directCogs - indirectCogs;
const netProfit      = grossProfit - overhead;
const pct = (n) => (rev > 0 ? Math.round((n / rev) * 1000) / 10 : 0);
```

Specifics that matter: overhead is a **real allocation** — (company overhead ÷ company revenue) × this job — **rounded to whole dollars** (the only rounded dollar figure). Percentages are rounded to **one decimal**. At `rev === 0` every percentage resolves to `0` — no NaN, no divide-by-zero — but **dollar fields are not zeroed** (rev 0 with 750 of COGS yields `grossProfit: -750`, `grossPercent: 0`).

**Fence:** `scripts/pipeline-fence.test.mjs:146-187` holds a frozen copy of the original formula (`oldMoneyMap`, `:148-167`) and asserts `deepEqual` across every confirmed seed job × four chart shapes including `null` and a zero-revenue chart. The rev=0 guard is pinned at `:183-187`.

**Backend rule:** if you recompute this server-side, port it exactly — including the rounding order. `Math.round(rev * rate)` is not the same as rounding after other operations.

### 4.6 One price path — v0.2.1 Law 56

`lib/epp-line.ts` is the single source of truth for a line's price and the quote total. Worksheet display and save **both** go through it, so a line's price and the quote total can never diverge (`lib/epp-line.ts:1-7`).

```ts
export function eppLineTotal(line)   { return (line.quantity || 0) * (line.unitPrice || 0); }   // :68-70
export function eppTotalRevenue(lines) { return lines.reduce((s, l) => s + eppLineTotal(l), 0); } // :76-78
```

`serializeEppLine` (`:37-65`) **passes `unitPrice` through** rather than recomputing (`unitPrice: item.unitPrice || 0`, `:55`) — deliberately. Recomputing is the exact bug this file was created to kill: the worksheet showed entered totals while save persisted a cost-derived recompute, silently zeroing manually-priced lines (`:3-6`).

Call sites, both in `app/project-pricer/page.tsx`: display `:1017-1019`, save `:1560` and `:1662`.

**Fence:** `scripts/epp-roundtrip.test.mjs` — manual prices survive save→reload→duplicate (`:19-20,38-41`), per-line LEM detail survives (`:63-68`), scope-only lines stay clean with no injected empty keys (`:71-74`).

**Backend rule:** persist `unitPrice` as entered. Never recompute a stored price from cost on read or write.

✅ **See §10.2 — this law WAS violated on the print path and is now fixed and fenced.** The Quote Preview / PDF printed the cost-derived Golden Formula *recommendation* instead of the persisted quoted price (owner walk, Jul 20 2026; one case printed **$0** on a $75,495.28 quote). Fixed `0196a9a`, fenced `d246303`, verified on production. Persist and serve the entered `unitPrice`; never treat the recommendation as a price.

### 4.7 Other invariants worth knowing

- **v0.2.1 Law 54 (Phase Rollup Math)** — `jobs.length === count` holds **structurally**: `jobs` is the same filtered array projected, not a second filter (`lib/pipeline.ts:134`). Fence `:122`.
- **v0.2.1 Law 13 (Dead Lane Law)** — Declined/Lost are terminal, excluded from every total, never routed to the Map, never wear "Revenue." Fence `:94,135-137`.
- **v0.2.1 Law 20 (Revenue Reserved)** — the word "Revenue" belongs to Ready-to-Invoice+ only. Below that: "Bid Value" / "Contract Value." Enforced on phase labels at fence `:96-100`. **This governs API field naming too** — do not name a PLANNING-tier money field `revenue`.
- **v0.2.1 Law 38 (Earned Green)** — `netProfitColors(net)` is the SSOT (`lib/pmz-types.ts:430-432`). Boundary: `net === 0` renders **green**, not red (rule is `< 0`). Fence `:139-144`.
- **v0.2.1 Law 28 (Golden Formula)** — Price = Cost ÷ (1 − Target Margin %). **v0.2.1 Law 27 (Rule M-1)** — margin-only; markup never appears in any pricing calculation; overhead never multiplies onto cost. ⚠️ Law 27 is explicitly **unfenced** — `BOOK-OF-LAWS.md:142` lists it as "the headline case… fence queued, not yet built."
- **v0.2.1 Law 57 (Currency Law)** — `formatMoney` = 2dp + thousands (`lib/format.ts:6-13`); rates round to the cent **as the value**, so rate × qty ties out. Note `formatMoney` prefixes `$` manually rather than using `Intl` currency style, so negatives render `$-750.00`.

---

## 5. TEST FENCES

Four suites (three at the time of writing; `quote-document-fence.test.mjs` added Jul 20 in `d246303` — see §10.2). Verified against `git ls-files`; everything else matching `*.test.*` is inside `node_modules`.

**The fourth suite:** `scripts/quote-document-fence.test.mjs` — run `node scripts/quote-document-fence.test.mjs` (no `--import` hook needed). Asserts the customer document's printed total equals the persisted `totalRevenue` across every priced shape, pins the two owner-walk regressions, and structurally bars the cost-derived path from `buildQuoteData`. **Plain Node + `node:assert/strict` — no Jest, no Vitest, no runner dependency.** They are `.mjs` so `tsc`'s `**/*.ts` include doesn't pull them in.

⚠️ **There is no `test` script in `package.json`** (`package.json:6-13` — only `dev`, `build`, `start`, `lint`, `format`, `typecheck`). Every suite must be invoked by explicit path, and the fence suite silently requires a flag the other two don't (§5.1). Nothing runs these in CI. **A `"test"` script chaining all three with `--import` applied uniformly (harmless for the two that don't need it) would remove that footgun** — worth proposing to Tom.

⚠️ **These are assert-scripts, not a framework: execution halts at the first failed assertion.** A break early in `pipeline-fence.test.mjs` masks every fence after it — and that one file concentrates the Iron Guard, the reconciliation invariant, and the frozen Money Map math in a single linear script. A failure at line 39 would hide all of them. Real fragility in the fence coverage, not a style preference.

**I ran all three at `8203f31`. Verbatim output:**

```
$ node --import ./scripts/ts-ext-register.mjs scripts/pipeline-fence.test.mjs
PASS: Profit Pipeline fence — both gates byte-identical, Completed in money set, Money Map port byte-identical
PASS: rollup per-phase subtotals, vocabulary law, reconciliation invariant (realized === salesFromInvoiced), iron guard (no grand total)
PASS: drill-down — each phase lists the jobs behind its count; realized jobs === qualifyingQuotes members; dead lane lists its jobs
PASS: color law — Net Profit green when kept, destructive-red on a loss (netProfitColors SSOT)

$ node scripts/superuser-status.test.mjs
PASS: super-user jump + back-step — status set, lock rule, history append, predecessor chain

$ node scripts/epp-roundtrip.test.mjs
PASS: EPP manual-price round-trip — unit prices and totalRevenue survive Save -> reload -> duplicate ($75,495.28)
PASS: EPP per-line LEM detail (labor/equipment/material/misc/crew) survives Save -> reload; scope-only lines stay clean
```

### 5.1 `scripts/pipeline-fence.test.mjs` (202 lines) — the big one

**Run:** `node --import ./scripts/ts-ext-register.mjs scripts/pipeline-fence.test.mjs`

⚠️ **This suite needs the `--import` hook; the other two do not.** `lib/pipeline.ts` value-imports `lib/qualifying.ts` via an extensionless specifier. The app resolves that through Next/Turbopack and `tsc`'s `moduleResolution: bundler`; plain Node cannot. `scripts/ts-ext-register.mjs` (4 lines) registers `scripts/ts-ext-resolver.mjs` (19 lines), a **test-only** ESM resolve hook that appends `.ts` to relative extensionless specifiers when that file exists. It touches no application code, tsconfig, or build.

| Lines | Proves |
|---|---|
| `34-43` | Both gates byte-identical to frozen pre-build references; `Completed` is in the money set |
| `45-48` | Facts gate ⊇ money gate, larger by exactly one — containment proven, not assumed |
| `50-53` | Realized phase lists Invoiced + Paid + Completed explicitly |
| `55-61` | `tierOf` — CONFIRMED at RtI+, PLANNING below |
| `63-76` | Seed: one quote in every phase + two dead-lane quotes |
| `82-94` | Per-phase rollup subtotals (count/value/direct/indirect/gross) for all four phases + dead count |
| `96-100` | **Vocabulary law** — phases 1–2 never say "revenue"; phases 3–4 do |
| `102-108` | **Reconciliation invariant** — realized value === `salesFromInvoiced().revenue`; COGS ties too |
| `110-119` | **Iron Guard** — only `{phases,dead}`; no `total`/`grandTotal`/`value`; tiers disjoint |
| `121-137` | Drill-down — `jobs.length === count`; realized jobs === `qualifyingQuotes` by id; dead lane lists its jobs |
| `139-144` | Color law — green at `>= 0` (incl. exactly 0), red below |
| `146-187` | **Frozen Map math** — byte-identical vs. `oldMoneyMap` across 4 jobs × 4 chart shapes; rev=0 → no NaN |
| `189-192` | Picker default = latest confirmed job, in stored order |
| `194-197` | Degrades safely — null → 4 phases, undefined → 0, junk → `[]` |

### 5.2 `scripts/superuser-status.test.mjs` (78 lines)

**Run:** `node scripts/superuser-status.test.mjs`

Imports `lib/pmz-types.ts` directly (no runtime deps). ⚠️ **It mirrors rather than imports the transform** — `jump()` at `:26-37` is a hand-copy of `superUserSetStatus`, and `statusBack()` at `:17-23` mirrors the Quotes page's Back logic. It uses the *real* `STATUS_FLOW` and `isStatusLocked`, but **a change to `lib/quote-lifecycle.ts` would not fail this suite.** Know that limit.

| Lines | Proves |
|---|---|
| `45-50` | Jump forward: status set, `Invoiced` locks, history appended |
| `52-55` | Jump backward **clears** the lock (super-user path, no latch) |
| `57-68` | Full predecessor chain Paid→Invoiced→RtI→In Progress→Scheduled→Approved→Ready for Approval→Draft; Declined←Ready for Approval; Draft has none |
| `70-76` | A back-step persists: `Approved` locked → step back to `Ready for Approval` unlocked, history appended |

### 5.3 `scripts/epp-roundtrip.test.mjs` (77 lines)

**Run:** `node scripts/epp-roundtrip.test.mjs`

Runs the **real** save-serialization through an actual `JSON.parse(JSON.stringify(...))` round-trip.

| Lines | Proves |
|---|---|
| `13-20` | A manually-priced line survives save→reload (the bug typecheck kept missing) |
| `22-41` | Four-line worksheet totals $75,495.28; persisted total === worksheet total (was 0) |
| `43-68` | Per-line LEM detail — labor (incl. nested labor + group), equipment, material, misc, crew — survives intact |
| `70-74` | Scope-only lines stay clean: no `laborEntries`/`crewUsages`/`priceOverridden` keys injected |

### 5.4 Typecheck

`npm run typecheck` → `tsc --noEmit` (`package.json:12`).

**v0.2.1 Law 65 (Zero TypeScript Errors)** — never raise a file's existing error count.

**Measured at `8203f31`: `npm run typecheck` exits clean, 0 errors.**

⚠️ Note the discrepancy: `CLAUDE.md:26` and **v0.2.1 Law 65** both state that `app/project-pricer/page.tsx` carries **~50 pre-existing errors** ("don't add to them, don't fix them as a side quest, don't be alarmed"). That is no longer true — the file is clean. Either those errors were resolved and the standing note went stale, or they were never counted by `tsc --noEmit` under the current config. **Treat a clean typecheck as the baseline; any error you introduce is yours.** Worth a one-line correction to `CLAUDE.md` — Tom's call.

### 5.5 What is NOT fenced

`BOOK-OF-LAWS.md:138-154` maintains an explicit **LAW-WITHOUT-A-FENCE** list. Highlights relevant to you: **Law 27 (Rule M-1)** — the headline gap, fence queued not built; **Law 6 (Counted-Means-Visible)**; **Law 48 (Additive Migrations)** — no migration test exists, *"the pending status-key rename will need one"*; **Law 50 (LEM Gate)** — no test blocks Accepted with zero-quantity lines; **Laws 41–42 (audience tiers)** — testable and untested.

✅ **Closed Jul 20 2026:** the quote document / PDF render path was entirely unfenced — `epp-roundtrip.test.mjs` proved Law 56 for save/reload and nothing proved it for output, which is exactly where the §10.2 defect lived. Now fenced by `scripts/quote-document-fence.test.mjs` (`d246303`), asserting *rendered document total === persisted `totalRevenue`*, mutation-tested. Residual edge: `buildQuoteData` is a closure and cannot be imported, so its call sites are pinned structurally rather than executed — extracting the mapping into `lib/` would close that.

**And note §6 is entirely unfenced today.** If you build role enforcement, you are building the first fence for it — write the tests.

---

## 6. ROLE / AUTH REQUIREMENTS

> **Status: NOT IMPLEMENTED. No auth, user model, session, or role code exists in this repo** (verified §1). Everything below is a **requirement to build**, sourced to Tom's gavels of Jul 18 2026 as relayed in the handoff brief. Per **v0.2.1 Law 68 (Spec Before Code)**, treat open questions as needing a gavel, not an assumption.

Related canon: **v0.2.1 Law 41 (Analysis Tier)**, **Law 42 (Sales Tier)**, **Law 43 (Foreman Tier)**. These are currently marked 🔓 unfenced (`BOOK-OF-LAWS.md:152`).

### 6.1 The four roles

**Owner — everything.** Full analysis layer, all six rungs of the ladder (Law 41: owner, bookkeeper, accountant).

**Sales — rungs 1–4, front-half pipeline, bid/cost/margin. Never overhead, never net.**
Sees the Pricer and quotes with margin rungs 1–4. **Overhead and Net Profit (rungs 5–6) are owner-tier only.** Vocabulary is tier-correct per **v0.2.1 Law 20** and gavel R-7 (`BOOK-OF-LAWS.md:130`): **"Bid Value" below Ready to Invoice, "Revenue" at Ready to Invoice and beyond.**

**Foreman — equipment / labor / material quantities and hours. ZERO dollars.**
Sees the Work Order View with the recipe snapshot frozen at accept-time (Law 43). The foreman confirms *facts* — that is the whole basis of the Two-Gate Law (§4.2): the Money Map lights at foreman-confirmed facts. **The foreman supplies the quantities; he must never see what they cost.**

**Sponsor superuser (IDP) — every driver individually, scorecards only.**
See §7.

### 6.2 🔴 The architectural requirement — absent, not hidden

**This is the requirement most likely to be implemented wrongly, so it is stated flatly:**

> For roles that must not see money, the financial fields must be **structurally absent from the API response** — not present-and-hidden by the UI.

A `display:none`, a CSS class, a client-side `if (role !== 'foreman')`, or a field serialized as `null` all **fail** this requirement. If the dollars reach the browser, they have leaked — devtools, a network tab, or a JSON response body will show them regardless of what renders.

Concretely:
- The foreman endpoint returns quantity and hour fields **only**. No `unitPrice`, no `totalRevenue`, no `directCogsDollars`, no `indirectCogsDollars`, no `grossProfit*`, no `contractValue`.
- The sponsor endpoint returns scorecard counters **only** (§7). No dollar field of any kind exists in that surface's schema.
- The sales endpoint returns rungs 1–4 and omits overhead and net — not zeroes them, omits them.

This mirrors how the Iron Guard is built (§4.3): the guarantee lives in the **shape of the returned type**, so violating it requires deliberately editing a schema rather than forgetting a conditional. Same discipline, applied to authorization.

It also mirrors **v0.2.1 Law 44 (Prospect Sandbox)**, where the audit/demo mode must be *"physically unable to write to the owner's chart or board"* — the word is *physically*, not *prevented from*.

**Recommended shape:** separate response types per role at the API boundary (`ForemanJobView`, `SalesQuoteView`, `SponsorScorecardView`, `OwnerQuoteView`), each a distinct type — not one wide type with optional fields. Optional fields invite a `?? 0` and a leak.

### 6.3 Open questions — need Tom's gavel, do not assume

- **TODO:** Can one person hold multiple roles (owner who also sells)? Is role per-user or per-user-per-company?
- **TODO:** Is the bookkeeper/accountant of Law 41 a distinct role or an alias of owner? Law 41 groups all three; §6.1's four-role list does not name them separately.
- **TODO:** §3.5 — `StatusHistoryEntry` has no actor field. With users, who changed a status becomes auditable and currently isn't recorded. Recommend adding under Law 48.
- **TODO:** Multi-tenancy model — is a "company" a first-class entity? `pmz_company_settings` is currently a single unscoped object (§2.6).

---

## 7. FOSTER IDP PILOT SHAPE

> **Status: NOT IMPLEMENTED — no code exists.** Requirements as relayed from Tom's Jul 18 gavels. Cross-references to canon are mine and marked as such.

### 7.1 Shape

- **50 isolated driver instances.** Each driver gets their own instance; **per-user data isolation is the defining constraint.** No driver sees another driver's data. Assume this must hold at the query layer, not the view layer — same discipline as §6.2.
- **Simple provisioning.** 50 users must be standable-up without hand-configuration per user.
- **Sponsor scorecard — milestones, entry streaks, months active. NO DOLLARS.** The sponsor superuser sees every driver individually, but the scorecard surface is counters only.
- **Consent-based coach sharing.** A driver can share with a coach; sharing is **opt-in by the driver**, not default and not sponsor-imposed.

### 7.2 🔴 The sponsor surface carries no money — structurally

Restating §6.2 because it is the pilot's core risk: the sponsor API surface must have **no financial field in its schema at all**. Not hidden, not nulled, not zeroed — **absent**.

A sponsor is an external party looking at 50 contractors' engagement. A leaked margin, overhead figure, or net profit is a disclosure of a driver's confidential business data to a third party. The failure mode is not a UI bug; it is a breach.

Suggested scorecard fields — **illustrative, needs Tom's gavel:**

```
driverId, displayName, milestonesCompleted, currentEntryStreak,
longestEntryStreak, monthsActive, lastEntryAt
```

Nothing else. In particular: no revenue, no job count weighted by value, no "total bid volume" — an aggregate can leak a business's scale as effectively as a line item.

### 7.3 Consent model

- **TODO:** What exactly does a driver share with a coach — the full owner view, or a defined subset? Unspecified.
- **TODO:** Is consent revocable, and what happens to already-shared data on revocation?
- **TODO:** Is coach a distinct role in §6.1's taxonomy? It is not currently listed.
- **TODO:** Relationship between the pilot's driver isolation and the **v0.2.1 Law 44** prospect sandbox — both are "physically cannot reach the owner's data" requirements. Worth one design, not two.

---

## 8. MIGRATION NOTES — localStorage → database

### 8.1 The governing law

**v0.2.1 Law 48 (Additive Storage Migrations):** *new storage keys add alongside old ones; migrations never destroy prior data.*

Also binding: **v0.2.1 Law 18 (Backup Before Demolition)** — a dated export precedes any delete/replace of stored data; confirm dialogs name exactly what is removed (counts and dollar totals); cancel is always non-destructive.

⚠️ **No migration test exists in any suite.** `BOOK-OF-LAWS.md:153` explicitly notes Law 48 is unfenced and *"the pending status-key rename will need one."* If you write the migration, you are writing its first fence.

### 8.2 What maps where

| localStorage key | Destination | Notes |
|---|---|---|
| `pmz_saved_quotes` | `quotes` (+ child `quote_line_items`, `quote_status_history`) | The spine. `eppLineItems`/`proLemItems` are natural child tables; `statusHistory` is already an append-only log — model it as one. |
| `pmz_jobs_v1` | `jobs` (+ `job_recipe_lines`, `job_attachments`) | Preserve `actualQty: null` ≠ 0 (§2.4). |
| `pmz_customers` | `customers` | 🔴 Serve `createdAt`/`updatedAt` as ISO **strings** (§2.5). |
| `pmz_overhead_chart` | `overhead_charts` + `overhead_items` | Feeds Money Map allocation (§4.5). Preserve the `behavior` backfill default. |
| `pmz_labor_rates` / `pmz_equipment_rates` / `pmz_material_rates` / `pmz_misc_rates` | `rate_profiles`, discriminated by kind, or four tables | **Break-even only** (Law 29). ⚠️ Equipment `ownership`/`operating` are `any[]` — resolve before modeling (§2.3). Material and misc share one shape. |
| `pmz_work_types_v2` | `work_types` + `pricing_tiers` | Unwrap the `{ workTypes }` wrapper. Preserve `high: null` = unbounded. |
| `pmz_company_settings` | `company_settings` | Every leaf is a **string** today, including numerics. Decide deliberately whether to type them properly — that is a behavior change, not a migration. |
| `pmz_estimators` / `pmz_salespeople` / `pmz_terms` / `pmz_crews` / `pmz_pnl_worksheet_v1` | direct tables | `pmz_terms` enforces exactly one `isDefault` — make it a DB constraint. |
| `pmz_current_*`, `pmz_*_collapsed`, `pmz_pricer_focus`, `theme`, `pmz_epp_print_quote` | **Do not migrate** | Transient UI/handoff state (§2.7). Keep client-side. |
| `pmz_epp_quotes`, `pmz_pro_quotes`, `pmz_jobs`, `pmz_customer_draft` | **Do not migrate — confirm with Tom first** | Dead/orphaned (§2.8). |

### 8.3 🎯 The C-1 stored-key rename — a migration opportunity

Three stored status keys diverge from canonical labels (§3.2). Gavel R-4 deferred the rename *"at a natural touch"* under Law 48.

**Standing up the database is that natural touch** — arguably the best one that will ever occur, since you are already transforming every record.

If Tom gavels it, the additive shape is:

1. Add a `status_canonical` column alongside the existing `status`.
2. Backfill: `Ready for Approval → Sent for Acceptance`, `Approved → Accepted`, `In Progress → Work Order Active`. Other eight copy across unchanged.
3. Both columns live together; nothing is destroyed (Law 48).
4. Cut readers over surface by surface, each proven green.
5. Retire the legacy column only after every reader has moved — a separate, later commit.

**Do not do this unilaterally.** R-4 is a closed gavel; reopening it is Tom's call, and it touches the qualifying set (§4.1), the facts gate (§4.2), `STATUS_FLOW`, `LOCKED_STATUSES`, and every fence test. **It is a Tier 2 change under v0.2.1 Law 63 — stop, show the diff, wait.**

### 8.4 Migration hazards found in the code

- **Id generation** — `dedup_${Date.now()}_${Math.random()}` (`lib/quote-storage.ts:28`) and similar patterns. Not collision-safe across users. Move to UUIDs, but **preserve existing ids as-is** — they are referenced by `quoteId` on jobs and by `pmz_current_quote_id`.
- **Duplicate-id self-heal rewrites storage on read** (`lib/quote-storage.ts:20-39`). Existing data may already contain `dedup_*` ids. They are real ids; don't strip them.
- **Empty overhead chart is silently discarded on load** (`app/overhead-profit/page.tsx:104`). A migration reading "the current chart" may read a stale in-memory one.
- **Informal read-time fallback chains** substitute for migration on `pmz_current_estimate_v1` (`app/project-pricer/page.tsx:618-629`) and `pmz_current_lem_v1` (`:737-744`). Since neither should be migrated (§8.2), this is informational — but it shows the house style for shape drift.
- **Version-suffixed keys have no version in the payload** (§2). You cannot detect which "version" a record is; you must infer from field presence.
- **`pmz_epp_quotes` / `pmz_pro_quotes` grow unbounded** (§2.8). Check their size before any export-based migration — they may dominate an export and are pure dead weight.

### 8.5 Sequence

Per **v0.2.1 Law 18**: dated export first, migrate second, verify third, delete last — if ever. Per **Law 45**, the origin-scoping lesson of 2026-07-08 (a 26-key export/import to reunite data stranded under `:3000`) is exactly the class of problem a server removes; make sure it removes it rather than relocating it.

---

## 9. DELIBERATELY OUT OF SCOPE

These are **not** backlog items or oversights. Each is a gaveled decision. Building any of them is a regression.

### 9.1 QuickBooks stays read-only — forever

**v0.2.1 Law 59 (Read-Only Books):** *QuickBooks is never touched; PMZ is read-only w.r.t. the customer's books; no write-back to accounting systems.*

PMZ runs **parallel** to accounting and accounting **confirms** PMZ (**v0.2.1 Law 15**). The owner should be able to predict the bookkeeper's month-end report before it lands, *"and the two should coincide."* That check only means something if the two systems are independent. **A write-back would destroy the very reconciliation the product exists to provide.**

Note `Customer.externalIds` includes a `quickbooks?` field (`lib/pmz-types.ts`) — that is an **identifier for correlation**, not an integration hook. Do not build a sync on it.

### 9.2 The Pipeline writes nothing

**v0.2.1 Law 60 (Pipeline Writes Nothing):** *the Pipeline touches no pricing path, rate store, or QuickBooks; reads quotes + chart; writes nothing new.*

Verified in code: `lib/pipeline.ts` has **no write of any kind** — no `localStorage.setItem`, no mutation of its inputs. Every exported function is a pure read-and-project over the quotes array and the overhead chart.

**Backend rule:** pipeline endpoints are **read-only**. No `POST`, no `PATCH`, no derived-value writeback, no caching table that the pipeline itself populates.

### 9.3 No live P&L feed

**v0.2.1 Law 17 (Map Feed Law)** and gavel **R-1** (`BOOK-OF-LAWS.md:118`, Tom, Jul 17, verbatim):

> *"Rule 61 is canon, runbook rule 41 is removed. The dropped feed is the live-P&L feed; the confirmed-job feed stands per the Two-Gate Law."*

**Be precise about what was dropped:** the **live-P&L auto-population** is dead and stays dead. The **confirmed-job feed** into the Money Map is alive and required — the Map auto-feeds from foreman-confirmed jobs per the Two-Gate Law. These two are easy to conflate; one is forbidden, the other is mandatory.

Roadmap context — **v0.2.1 Law 61 (Overhead Intake Roadmap):** Phase 2 = chart-of-accounts **CSV import**; Phase 3 = live accounting integration auto-deciphered into buckets. So a *future* accounting integration exists on the roadmap for **intake**; it is still never a write-back (§9.1), and it is not this build.

### 9.4 Also out of scope

- **A pipeline grand total** — §4.3. Structurally forbidden.
- **A stored `tier` column** — §3.4. Tier is derived (Law 47).
- **Cost-derived price recomputation on save** — §4.6. The bug `lib/epp-line.ts` exists to prevent.
- **Markup anywhere in the pricing path** — **v0.2.1 Law 27 (Rule M-1)**: margin-only; overhead never multiplies onto cost.
- **Overhead splitting by work type** — **v0.2.1 Law 53 (Work-Type Split)**: the split touches only Revenue + Direct COGS; **overhead is never split.**

---

## 10. KNOWN DRIFT AND OPEN QUESTIONS

Found while writing this doc. Several are Tier 2 under **v0.2.2 Law 63** and need Tom's ruling. Listed so you don't inherit them blind.

**§10.1 and §10.2 were resolved on Jul 20 2026** — both are marked below with their fixing commits, and each keeps its original finding as history so the reasoning survives. Everything from §10.3 down is still open.

### 10.1 ✅ RESOLVED (`c8c05c7`, Jul 20 2026) — shadow `STATUS_LABELS` maps deleted

**Outcome:** superseded by a stronger gavel than the one this finding anticipated. Rather than pointing the documents at the canonical label map, Tom ruled that **customer-facing documents carry no lifecycle vocabulary at all** — *"we do not want our internal language on the street"* (v0.2.2 Law 19). Both shadow maps are deleted, both status pills removed, and the orphaned `STATUS_COLORS` imports and PDF pill styles went with them. The canonical-labels version was never committed.

**For the backend:** do not add status vocabulary to any customer document surface you build. The document being a Quote (or Estimate) is its own status. Lifecycle words are internal-surface only.

The original finding is preserved below as history.

---

#### (historical) Three shadow `STATUS_LABELS` maps disagree with the shared one

The shared map is `lib/pmz-types.ts:366-378` (§3.2). But **two local consts shadow that name** and do **not** import from it:

- `components/QuotePdfDocument.tsx:48-59`
- `components/QuotePreview.tsx:101-112`

Both map `"Ready for Approval" → "Awaiting acceptance"` (not "Sent for Acceptance") and `"In Progress" → "In progress"` (not "Work Order Active"), and **both omit `"Scheduled"` entirely** — so a Scheduled quote gets a null label and renders **no status pill** on the customer-facing document and PDF (`QuotePreview.tsx:113`, `QuotePdfDocument.tsx:224`, both `|| null`).

A **third** duplication: `PIPELINE_PHASES` labels are hand-written display strings (`lib/pipeline.ts:40,48`) rather than composed from `STATUS_LABELS`.

**Why it matters:** **v0.2.1 Law 19** says the canonical words are *"the only permitted status and phase vocabulary on any product surface"* — and a customer-facing PDF is the most public surface there is. `BOOK-OF-LAWS.md:143` already flags the remaining unfenced edge as *"status-label mapping on non-pipeline surfaces."* This is that gap, in code.

**Recommend:** one shared label map, imported everywhere; a fence asserting no local `STATUS_LABELS` exists. **Tom's call — Tier 2, touches customer-facing output.**

### 10.2 ✅ RESOLVED AND FENCED (`0196a9a` + `d246303`, Jul 20 2026) — Law 56 print-path violation

**Fixed:** `0196a9a` — `buildQuoteData` now takes `unitPrice` as persisted and derives line totals and the grand total from `lib/epp-line` (`eppLineTotal` / `eppTotalRevenue`), the same helpers the worksheet and the save path use. Printed === persisted by construction. All presentation-only rounding was removed from customer paper; amounts print to the cent (v0.2.2 Law 56, Law 57).

**Fenced:** `d246303` — `scripts/quote-document-fence.test.mjs` asserts printed total === persisted totalRevenue across manual line totals, overridden unit prices, cents, fractional quantities, a no-cost quote, scope-only and empty quotes; pins both owner-walk cases as regressions; and structurally bars `customerUnitPrice` / `roundToQuote` from `buildQuoteData`. Both halves were mutation-tested — each confirmed to FAIL when the defect is reintroduced.

**Verified on production Jul 20 2026.** The "print path is unfenced" note in §5.5 is superseded.

**Gavel of record (Tom, Jul 20):** the customer document prints the **QUOTED** price, never the Golden Formula recommendation; the recommendation is owner-facing coaching only. Round-dollar quoting, if ever wanted, rounds the **saved** price at entry — parked for a future gavel, never a print-time transform.

**For the backend, unchanged and still binding:** persist and serve the entered `unitPrice` and the `totalRevenue` derived from it. Never persist a recommendation as a price, never sum one into a document total, never return one as a quote's value. If you expose a recommendation, name it so it cannot be mistaken for the quote (`recommendedUnitPrice`, `recommendedTotal`).

The original finding is preserved below as history.

---

#### (historical) CONFIRMED DEFECT — the PDF prints the recommendation, not the quoted price

**Status at time of writing: CONFIRMED by owner walk, Jul 20 2026 (Tom), two cases. Mechanism identified.**

This is a **customer-facing** defect: the Quote Preview / PDF prints a **cost-derived Golden Formula recommended price** instead of the **persisted quoted price**. What the customer receives is not what was quoted.

#### The mechanism

Two different price bases feed two different surfaces:

- **Persisted / worksheet** — `totalRevenue` = `eppTotalRevenue(estimate.bidItems)`, the sum of **entered** `unitPrice` values (`app/project-pricer/page.tsx:1017-1019` display, `:1662` save). This is the quoted price and it is correct.
- **Printed document** — the total is built from `customerUnitPrice(item)`, a **cost-derived** price `cost / (1 - targetMargin/100)` (`app/project-pricer/page.tsx:1090-1096`), summed at `:2001-2002`. This is the *recommendation*, not the quote.

So the PDF renders guidance as if it were the agreed number.

#### The two owner-walk cases

**Case 1 — "Parking Lot Addition."** Worksheet total **$75,495.28**; **PDF prints $0.**
The quote carries no costs, so `lineBreakEvenCost` is 0, so the Golden Formula recommendation is `0 / (1 - margin)` = **$0**. A manually-priced quote with no costing entered prints a **zero-dollar customer document**.

**Case 2 — "Laydown/Parking Area."** Worksheet TOTAL REVENUE **$37,880.00**, screen showing *"Recommended @ 20%: $35,405.61"*; **PDF prints $35,406** — exactly the recommendation, rounded to whole dollars.
The contractor priced the job **above** the recommendation. The PDF printed the lower recommended figure — **$2,474 under the quoted price**, in the customer's favor, on the document the customer signs.

Case 2 is the diagnostic one: the printed figure matches the on-screen *recommendation* to the cent (pre-rounding), not the quoted total. That pins the mechanism beyond inference.

#### Why the existing fence did not catch it

Note that Case 1's worksheet total, **$75,495.28**, is the exact fixture total asserted in `scripts/epp-roundtrip.test.mjs:32,39`. That suite is green — and it is right to be green. It fences `serializeEppLine` → JSON round-trip → `eppTotalRevenue`, i.e. **the save/reload path only**. It never renders the document.

**The print path has no fence at all.** Law 56's fence covers half the law: *"a line's price and the quote total can never diverge"* is proven for storage and unproven for output. Per **v0.2.1 Law 72 (Fence Discipline)** — *proven, not assumed* — the fix should ship with a fence that asserts the rendered document total equals the persisted `totalRevenue`.

#### Related findings in the same area

- `eppMarkedUpBid` (`app/project-pricer/page.tsx:1552-1554`) is **computed inside the save handler and never read** — a grep returns only its own declaration and a test comment. Dead computation sitting in the save path.
- The Golden Formula has **four separate, unshared implementations**: `app/project-pricer/page.tsx:1090-1096`, `:1932-1934`, `:1552-1554`, and `lib/calculations.ts:130-132,392`. Four copies of the pricing rule is the structural cause of this class of bug — **v0.2.1 Law 56** wants one price path, and there is one for storage and a different one for print.
- Line seeding sets `unitPrice = cost / qty` — **break-even, unmarked** — until `priceOverridden` (`:965-981`).

#### For the backend

**Persist and serve the entered `unitPrice` and the `totalRevenue` derived from it.** Those are the quoted numbers and they are the correct ones. The Golden Formula recommendation is **display guidance** and should never be persisted as a price, never be summed into a document total, and never be returned by an API as the quote's value.

If you expose a recommendation at all, name it unambiguously (`recommendedUnitPrice`, `recommendedTotal`) so it can never be mistaken for the quote — the field naming discipline of **v0.2.1 Law 20** applied to pricing.

### 10.3 Exported types that don't describe stored data

`lib/pmz-types.ts` exports `LaborRate` (`:79-100`), `EquipmentRate` (`:112-142`), `MaterialRate` (`:144-154`), `WorkType` (`:163-169`). **None is the persisted shape** (§2). The real shapes are `lib/rate-store.ts:5-38` and `app/work-types/page.tsx:35-40`. There are **three** different `WorkType` declarations in the repo (adding `app/project-pricer/page.tsx:78-89`).

**Risk:** a backend engineer reasonably starts at `lib/pmz-types.ts` — the file named "types" — and models the wrong schema. **This is the most likely single cause of a wrong first draft.**

### 10.4 Smaller items

- **`realizedRoll` uses a positional index** — `PIPELINE_PHASES[3]` (`lib/pipeline.ts:157`). Reordering the array silently repoints the reconciliation anchor. A key lookup would be safer.
- **`tierOf` accepts `string`, not `QuoteStatus`** (`lib/pipeline.ts:22`) — a typo'd status silently returns `"PLANNING"` instead of failing.
- **`moneyMapForJob` guards `chart.monthlyRevenue > 0` without `num()`** (`lib/pipeline.ts:187`) — a string `"5000"` passes and produces a numeric result; junk yields rate 0.
- **`pnl-worksheet` passes `bucket` through unvalidated** (`lib/pnl-worksheet.ts:66`).
- **`superuser-status.test.mjs` mirrors rather than imports** the transform (§5.2) — a `lib/quote-lifecycle.ts` change wouldn't fail it.
- **Stale comment in `scripts/superuser-status.test.mjs:58-59`** — it describes the chain in *canonical* words (`Sent for Acceptance → Accepted → … → Work Order Active`) while the assertions directly below at `:60-66` use the *stored* keys (`Ready for Approval → Approved → … → In Progress`). Both are correct for their register (§3.2), but read together the comment looks like it contradicts the test. Harmless; mildly confusing on first read.
- **`README.md:3` says "Performance Margin Pricing Assistant."** **v0.2.1 Law 74 (PMZ Naming)** is explicit: the brand is *"Profit Margin Zone (PMZ)"* — **never** "Performance Margin." Wrong brand words in the most-read line of the repo, and the first thing a new engineer reads. Worth a one-line fix commit.
- **`lib/lem-detail.ts:50-55`** has a private `money()` duplicating `formatMoney` without the `$` — minor SSOT drift against **v0.2.1 Law 57**.

---

## 11. FIRST-DAY ORIENTATION

Suggested reading order:

1. **`BOOK-OF-LAWS.md`** (repo root) — the canon, v0.2.1, 78 laws. Per **Law 78** you get the file itself, never a summary. Read Chapters I (Money & Truth), II (Vocabulary), and VI (Data & Architecture) first.
2. **`CLAUDE.md`** — working agreements, approval tiers, the one-address rule.
3. **`lib/qualifying.ts`** (25 lines) then **`lib/pipeline.ts`** (200 lines) — the entire money model, small enough to read in one sitting. Between them they encode Laws 1, 2, 3, 11, 13, 14, 46, 47, 54, 55.
4. **`lib/pmz-types.ts:230-443`** — status, labels, flow, locks.
5. **`scripts/pipeline-fence.test.mjs`** — the fences, and the clearest statement of what must never break.
6. Then the specs: `BUILD-F-PIPELINE-SPEC.md`, `BUILD-F-SCOPING.md`, `SEGMENT-2-SPEC.md`.

Two working rules that will save you time:

- **v0.2.1 Law 63 (Two-Tier Change Control):** layout/CSS/copy — apply freely. Values, math, handlers, state, data models, shared stores, cross-surface effects — **stop, show the diff, wait.** When the tier is unclear, treat it as Tier 2 and stop.
- **v0.2.1 Law 72 (Fence Discipline):** any build outside a surface must prove that surface byte-identical via regression suite — *"proven, not assumed."*

---

*Written from the code at `8203f31`. Where this document and the code disagree, the code is right and this document is stale — fix it in the same commit, per the maintenance rule at `BOOK-OF-LAWS.md:5`.*
