# PMZ Pricing Assistant — Implementation Plan

**Project:** PMZ Pricing Assistant  
**Vision:** A contractor-first SaaS that helps owners know their *true* cost of work so they can price with confidence and protect profit.  
**Core Philosophy (Home page headline):**  
> "Market prices are information. LEM costs are the truth."

LEM = Labor + Equipment + Materials.

---

## 1. Goals for This Initial Build (Phase 1)

- Deliver a clean, professional, trustworthy web app that *feels* like a serious contractor tool on first load.
- No auth or database yet (Supabase integration is Phase 2).
- Strong visual foundation + navigation that will scale.
- Interactive-enough "builder" experiences for the core four tools so the value is immediately obvious.
- All calculations are client-side (in-memory + optional localStorage persistence for demo).
- Mobile-responsive with a professional sidebar that collapses on small screens.

**Non-goals for v1:**
- Real user accounts or cloud sync
- PDF generation or exports (placeholders only)
- Complex multi-step wizards
- Dark mode (add later if requested)

---

## 2. Tech Stack & Tooling Decisions

- **Next.js 15** (App Router, latest stable as of 2026)
- **TypeScript** (strict mode)
- **Tailwind CSS** (v4 via `create-next-app`)
- **shadcn/ui** (new-york or default style — recommend "default" for more rounded contractor-friendly feel)
- **lucide-react** for icons
- **React Hook Form** + **Zod** (recommended for all future forms; add early)
- No heavy charting library yet (use simple Tailwind + CSS for v1; add Recharts or Tremor in Phase 2 if needed)
- Future: `@supabase/supabase-js`, server actions or Route Handlers for data

**Recommended scripts in package.json:**
- `dev`, `build`, `start`, `lint`, `typecheck`

---

## 3. Color Palette — Trustworthy Blue/Gray (Contractor Professional)

We will define these as CSS custom properties in `globals.css` and reference them via Tailwind.

```css
:root {
  --color-primary:        #1E3A8A;   /* Deep trustworthy navy blue */
  --color-primary-600:    #1E40AF;
  --color-accent:         #0EA5E9;   /* Sky blue for highlights / CTAs */
  --color-success:        #15803D;   /* Healthy profit green */
  --color-warning:        #B45309;   /* Amber for attention */
  --color-danger:         #B91C1C;

  --color-bg:             #F8FAFC;   /* Slate-50 — clean light background */
  --color-surface:        #FFFFFF;
  --color-surface-2:      #F1F5F9;   /* Subtle cards / sections */

  --color-border:         #E2E8F0;
  --color-text:           #0F172A;   /* Slate-900 */
  --color-text-muted:     #475569;   /* Slate-600 */
  --color-text-subtle:    #64748B;   /* Slate-500 */
}
```

Sidebar / header will use a slightly darker navy (`#0F172A` or `#1E2937`).

This palette reads as:
- Competent
- Calm
- Professional
- Not "construction orange" gimmicky

---

## 4. High-Level Folder & Route Structure

```
PMZ-Pricing-Assistant/
├── app/
│   ├── layout.tsx                 # Root layout + providers
│   ├── page.tsx                   # Home / Dashboard (the important one)
│   ├── labor-rates/
│   │   └── page.tsx
│   ├── equipment-rates/
│   │   └── page.tsx
│   ├── materials/
│   │   └── page.tsx
│   ├── overhead-profit/
│   │   └── page.tsx
│   ├── project-pricer/
│   │   └── page.tsx               # The "main" tool most owners will use daily
│   └── settings/
│       └── page.tsx
├── components/
│   ├── ui/                        # shadcn generated components
│   │   ├── button.tsx, card.tsx, input.tsx, table.tsx, ...
│   ├── layout/
│   │   ├── AppSidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── MainLayout.tsx
│   ├── shared/
│   │   ├── RateCard.tsx
│   │   ├── StatCard.tsx
│   │   ├── EmptyState.tsx
│   │   └── CalculationSummary.tsx
│   └── tools/
│       ├── LaborRateForm.tsx      # Interactive pieces
│       ├── EquipmentRateForm.tsx
│       └── ...
├── lib/
│   ├── utils.ts                   # cn() helper + formatting
│   ├── calculations.ts            # Pure functions for LEM math (easy to test later)
│   └── constants.ts               # Default burden rates, etc.
├── types/
│   └── index.ts                   # LaborRate, EquipmentRate, ProjectLineItem, etc.
├── public/
│   └── (logos, favicons later)
├── package.json
├── tailwind.config.ts (or not — v4 uses CSS)
├── components.json                  # shadcn config
└── PLAN.md
```

Use route groups `(dashboard)` later if we add marketing landing vs app, but for now keep flat.

---

## 5. Navigation (Sidebar)

Persistent left sidebar on desktop (collapsible), hamburger → sheet on mobile.

**Nav Items (in order):**

1. **Overview** — `/` (Home)
2. **Labor Rates** — `/labor-rates`
3. **Equipment Rates** — `/equipment-rates`
4. **Materials** — `/materials`
5. **Overhead & Profit** — `/overhead-profit`
6. **Project Pricer** — `/project-pricer` *(emphasized — primary CTA color)*
7. **Reports** (disabled / coming soon placeholder)
8. **Settings** — `/settings`

Each nav item: lucide icon + label. Active state with left accent bar in primary blue.

Topbar (across all pages):
- Logo "PMZ" (wordmark) + small tagline "Pricing Assistant"
- Current page title (or breadcrumb)
- Placeholder for user avatar + "Owner" (future Supabase user)
- "Export All Data" button (demo)

---

## 6. Home / Overview Page — Detailed Wireframe

**Hero / Value Statement (top of page)**
- Large, confident headline:  
  **"Market prices are information. LEM costs are the truth."**
- Subheadline: "Stop guessing your bid price. Know exactly what every hour of labor, every piece of equipment, and every material actually costs you — then add the profit you deserve."
- Primary CTA button: **"Open Project Pricer"** (links to `/project-pricer`)

**Three-column "The Problem" → "The Solution"**
- Left: "What most contractors do" (market pricing, gut feel, last job + 10%)
- Center: "What actually happens" (hidden losses on labor burden, underpriced equipment, overhead eating profit)
- Right: "What PMZ gives you" (true loaded rates + recommended bid price in minutes)

**Quick Access Grid** (6 cards)
- Labor Rate Builder
- Equipment Rate Builder
- Materials
- Overhead & Profit
- Project Pricer (larger / featured)
- View All Tools

Each card has:
- Icon
- Title
- One-sentence benefit
- "Open" button

**Bottom section**
- "Built for owners who have to get the numbers right the first time."
- Trust bar: "No spreadsheets. No guessing. Real ownership costs."

---

## 7. Tool Placeholders — Minimum Viable Interactivity

### 7.1 Labor Rate Builder (`/labor-rates`)

- Form to define a "Role" (Journeyman, Apprentice, Foreman, etc.)
- Inputs (all numeric, with sensible defaults):
  - Base hourly wage ($)
  - Employer payroll taxes (%)
  - Workers' compensation (%)
  - Health / retirement benefits (% or $)
  - Other burden (PTO, training, uniforms) (%)
  - Per-diem or vehicle allowance ($/hr)
- Big, prominent **Fully Loaded Labor Rate** output (large monospace number)
- "Add to My Rates" button → populates a nice table below
- Table columns: Role | Base | Burden % | Loaded $/hr | Actions (edit / duplicate / delete)
- Bonus: "What if I raise base wage $3?" live sensitivity line (simple math)

**Formulas (put in lib/calculations.ts):**
```ts
burdenMultiplier = 1 + (tax + wc + benefits + other)/100
loaded = (base + perDiem) * burdenMultiplier
```

Store rates in React state + localStorage under key `pmz_labor_rates`.

### 7.2 Equipment Rate Builder (`/equipment-rates`)

More sophisticated.

Inputs per piece:
- Description (e.g. "2022 Ford F-250 Service Truck")
- Purchase price or current market value
- Expected useful life (years or total operating hours)
- Salvage / resale value
- Annual insurance, storage, licensing
- Financing interest rate (if financed)
- Fuel / maintenance / tire cost per hour
- Utilization rate (% of year the equipment is actually billable)

Outputs (clearly separated):
- **Ownership Cost per Billable Hour**
- **Operating Cost per Hour**
- **Total Recommended Equipment Rate ($/hr)**

Table of saved equipment with ability to "Use in Project".

### 7.3 Materials (`/materials`)

Simpler for v1:
- Quick add form: Name, Unit cost, Unit (ea, lf, sf, lb, etc.), Typical markup %
- Table of materials
- "Apply default markup" global control

Future: supplier price lists import.

### 7.4 Overhead & Profit (`/overhead-profit`)

- Annual fixed overhead input (office, admin salaries, marketing, software, owner draw target, etc.)
- Desired net profit margin target (%)
- Allocation method selector (radio): 
  - Per labor hour
  - % of direct cost
  - % of revenue
- Live calculator: "For a $48k direct cost job with 420 labor hours → overhead applied + profit target = recommended total price and margin"

### 7.5 Project Pricer (`/project-pricer`) — Most Important

This is the page owners will live in.

**Layout (two column or stacked on mobile):**

Left / top:
- Job info (name, client, date — local only)
- "Add Labor Line" — select from saved labor roles + hours
- "Add Equipment Line"
- "Add Material Line" (quick or from library)

Right / bottom:
- **Live Cost Summary Card** (always visible, sticky on desktop)
  - Labor subtotal
  - Equipment subtotal
  - Materials subtotal
  - Direct Costs total
  - + Applied Overhead
  - + Target Profit
  - =================================
  - **Recommended Bid Price** (huge, confident number)
  - Your margin at that price: XX%

Controls:
- Sliders or inputs for "Profit target override" and "Overhead multiplier"
- "What-if" section: "If I bid $X, my margin becomes Y%"

Buttons:
- "Save as Quote" (local)
- "Duplicate Job"
- "Clear"

This page alone will make the value obvious.

---

## 8. shadcn/ui Component Plan (Initial Set)

Run `npx shadcn@latest init` then add:

- `button`, `card`, `input`, `label`, `form`, `table`, `tabs`, `select`, `slider`, `dialog`, `sheet`, `badge`, `separator`, `tooltip`, `alert`, `skeleton`

Also add the shadcn **Sidebar** component if available in the version at time of init (very good for this layout).

---

## 9. Implementation Phases & Recommended Order

**Phase 1 (Current task)**
1. Install Node (winget), create Next.js project, init Tailwind + TypeScript
2. shadcn init + add core components
3. Define color system + typography scale
4. Build persistent MainLayout + AppSidebar + Topbar
5. Build beautiful Overview page with the core message
6. Create all route stubs + basic empty states
7. Implement **Labor Rate Builder** as fully working interactive prototype
8. Implement **Equipment Rate Builder** (slightly lighter)
9. Implement **Project Pricer** with live math using the above
10. Add localStorage persistence + nice "data saved" feedback
11. Polish, responsive, consistent spacing, loading states

**Phase 2 (Next)**
- Supabase project + auth (email + magic link ideal for contractors)
- Persist all rate data and projects per user
- Real RLS policies
- More sophisticated calculation engine + validation
- PDF quote export
- Multiple saved "scenarios" per project

**Phase 3**
- Team / crew management
- Historical actual vs estimate tracking
- Industry benchmark data (opt-in)
- Mobile PWA feel

---

## 10. Non-Functional Requirements

- Fast first load (< 1.5s on 4g)
- All numbers clearly formatted with commas + 2 decimals where money
- Every input has helpful helper text or tooltip ("This is your fully burdened cost including taxes and benefits")
- Keyboard friendly (contractors sometimes use desktops in the truck)
- Print-friendly (many owners still print proposals)

---

## 11. Deliverables at End of This Session

- Fully running `npm run dev` project at `http://localhost:3007`
- All navigation working
- At least Labor + Equipment + Project Pricer interactive
- Professional visual design matching the brief
- Clean, commented calculation functions
- This PLAN.md updated with any deviations + "What's Next" section

---

## 12. Open Questions (to resolve with user)

- Exact company / product name styling ("PMZ", "PMZ Pricing", full name)?
- Do you have existing logo / brand colors we should incorporate?
- Preferred default units (imperial only for now?)
- Any specific burden rate defaults that are common in your market?
- Future multi-user / crew sharing priority?

---

**Status:** Ready to execute once Node.js installation completes.

This plan gives us a rock-solid, extensible foundation that will feel like a real product on day one and will not require major rewrites when we add Supabase.
