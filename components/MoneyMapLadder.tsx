"use client";

// Shared PMZ Money Map ladder — extracted from app/page.tsx so the Overview Money Map and the
// Quotes "Analyze" modal render the IDENTICAL ladder from one source (spec §3c). Presentation only:
// the numbers come in as a MoneyMapSnapshot (computed once in lib/pipeline.moneyMapForJob); this
// file moves NO math. Tier badge is always shown — never blended, never unlabeled.
import React from "react";
import { BUCKET_COLORS } from "@/lib/pmz-types";
import type { MoneyMapSnapshot, PipelineTier } from "@/lib/pipeline";

// Local money formatter (mirrors the Overview's — 2 decimals + thousands separators).
function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "$0.00";
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Per-rung "Details" copy (Fix 4) — each rung expands its own definition in place, one level deep.
export const RUNG_INFO: Record<string, string> = {
  revenue: "Revenue is the top line — what the customer pays you, from your Project Pricer bid total.",
  direct: "Cost of Goods (Direct Job Costs) = the Labor + Equipment + Material you actively build in the Full Real LEM section of the Project Pricer — the obvious L+E+M you control per job.",
  indirect: "Indirect Cost of Goods (Hidden Job Costs) hides in labor burden beyond base pay, shop supplies, small tools, unbillable time, mobilization “extras”, fuel surcharges not passed through, etc. It’s a subset of Cost of Goods — it rolls up to COGS on the P&L, but PMZ teaches the breakout. It rarely shows in your LEM table yet destroys your target margin. This is the bucket the Money Map exists to kill.",
  gross: "Gross Profit = Revenue − (Direct + Indirect COGS). This is the number the Project Pricer’s Gross Profit % field is trying to protect.",
  overhead: "Overhead (Running the Business) = fixed business costs (insurance, shop rent, admin salaries, etc.). Managed in the Overhead & Profit pillar.",
  net: "Net Profit = Gross − Overhead. The true owner take-home. Everything else is just moving money between buckets.",
};

// Quick Glossary (Fix 4) — one term per row, each expands its definition in place.
export const GLOSSARY_TERMS: { term: string; def: string }[] = [
  { term: "Cost of Goods (Direct Job Costs)", def: "Job-visible costs in your LEM — the Labor, Equipment, and Material you control per job." },
  { term: "Indirect Cost of Goods (Hidden Job Costs)", def: "The invisible tax on every job — a subset of Cost of Goods that rolls up to COGS on the P&L, but PMZ teaches the breakout. Shrink this first; it’s the fastest lever most contractors have." },
  { term: "Overhead (Running the Business)", def: "The price of being in business — fixed costs whether or not you have a job." },
  { term: "Net Profit (What You Keep)", def: "The only number that pays the owner. Gross Profit minus Overhead." },
];

// Tier badge — CONFIRMED (foreman-confirmed, Ready-to-Invoice+) reads green (kept-money palette);
// PLANNING (bid projection, below the facts gate) reads neutral gray so it can never be mistaken
// for earned/confirmed reality. Always rendered alongside a ladder — the "never unlabeled" rule.
const TIER_STYLE: Record<PipelineTier, { fg: string; bg: string; border: string }> = {
  CONFIRMED: BUCKET_COLORS["Net Profit"],
  PLANNING: { fg: "#475569", bg: "#F1F5F9", border: "#CBD5E1" },
};
export function TierBadge({ tier }: { tier: PipelineTier }) {
  const c = TIER_STYLE[tier];
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color: c.fg, backgroundColor: c.bg, border: `1px solid ${c.border}` }}
    >
      {tier}
    </span>
  );
}

// Rung-1 label obeys the vocabulary law: "Revenue" is reserved for CONFIRMED (Ready-to-Invoice+);
// a PLANNING ladder's top line reads "Bid Value (Projected)", never "Revenue".
function rung1Label(tier: PipelineTier): string {
  return tier === "PLANNING" ? "1. Bid Value (Projected)" : "1. Revenue (Income)";
}

// Compact 6-rung ladder (the Overview card view). Byte-identical markup to the former inline block
// when tier is CONFIRMED (the Money Map's only tier).
export function MoneyMapLadderCompact({ snap, tier = "CONFIRMED" }: { snap: MoneyMapSnapshot; tier?: PipelineTier }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-1.5">
        <div className="font-medium">{rung1Label(tier)}</div>
        <div className="tabular-nums font-semibold">{formatMoney(snap.revenue)}</div>
      </div>
      <div className="flex items-center justify-between rounded border px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}>
        <div className="font-medium" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>2. Cost of Goods (Direct Job Costs)</div>
        <div className="tabular-nums" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{formatMoney(snap.directCogs)} <span className="text-xs">({snap.directPercent}%)</span></div>
      </div>
      <div className="flex items-center justify-between rounded border-2 px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}>
        <div>
          <span className="font-medium" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>3. Indirect Cost of Goods (Hidden Job Costs)</span>
          <span className="ml-1 text-[10px] font-semibold" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>SILENT PROFIT KILLER</span>
        </div>
        <div className="tabular-nums" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>{formatMoney(snap.indirectCogs)} <span className="text-xs">({snap.indirectPercent}%)</span></div>
      </div>
      <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-1.5">
        <div className="font-medium">4. Gross Profit (Left After the Work)</div>
        <div className="tabular-nums">{formatMoney(snap.grossProfit)} <span className="text-xs text-muted-foreground">({snap.grossPercent}%)</span></div>
      </div>
      <div className="flex items-center justify-between rounded border px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}>
        <div className="font-medium" style={{ color: BUCKET_COLORS["Overhead"].fg }}>5. Overhead (Running the Business)</div>
        <div className="tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(snap.overhead)} <span className="text-xs">({snap.overheadPercent}%)</span></div>
      </div>
      <div className="flex items-center justify-between rounded border-2 px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}>
        <div className="font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>6. Net Profit (What You Keep)</div>
        <div className="tabular-nums font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{formatMoney(snap.netProfit)} <span className="text-xs">({snap.netPercent}%)</span></div>
      </div>
    </div>
  );
}

// Glossary def by rung key — only rungs that map to an existing approved term.
const RUNG_GLOSSARY: Record<string, string> = {
  direct: "Cost of Goods (Direct Job Costs)",
  indirect: "Indirect Cost of Goods (Hidden Job Costs)",
  overhead: "Overhead (Running the Business)",
  net: "Net Profit (What You Keep)",
};
function glossaryDef(term: string): string | undefined {
  return GLOSSARY_TERMS.find((g) => g.term === term)?.def;
}

// Layout 1a — the full-screen Expandable Profit Ladder (the single ladder behind /analyze/[id], the
// app's one full-view). A Net Profit hero band up top, then six stacked rungs; tap a rung to expand
// its breakdown + glossary in place, ONE rung open at a time. The Silent Killer strip sits on rung 3
// (always visible). Tier gates every label: PLANNING never prints the word "Revenue" (rung 1 →
// "Bid Value") nor an unqualified "Net Profit" (hero + rung 6 → "Projected Net Profit").
//
// COPY LAW (9b): only owner-approved strings render. The per-rung "worked example" and "how to
// improve" slots are intentionally NOT rendered — they are teaching strings that ship only with
// owner approval; no prose is invented here. Everything shown reuses copy already approved and live.
export function MoneyMapLadderExpanded({ snap, tier = "CONFIRMED" }: { snap: MoneyMapSnapshot; tier?: PipelineTier }) {
  const [openRung, setOpenRung] = React.useState<string | null>(null);
  const toggle = (k: string) => setOpenRung((cur) => (cur === k ? null : k));
  const planning = tier === "PLANNING";
  const netLabel = planning ? "Projected Net Profit" : "Net Profit";
  const revBreakdown = planning
    ? "This is your BID total (projected) — what you’d collect if you win the job. It only becomes Revenue once the job is foreman-confirmed at Ready to Invoice."
    : RUNG_INFO.revenue;

  type Rung = {
    key: string; label: string; value: number; pct: number | null;
    color?: { fg: string; bg: string; border: string }; emphasized?: boolean;
    breakdown: string; silentKiller?: boolean;
  };
  const rungs: Rung[] = [
    { key: "revenue", label: rung1Label(tier), value: snap.revenue, pct: null, breakdown: revBreakdown },
    { key: "direct", label: "2. Cost of Goods (Direct Job Costs)", value: snap.directCogs, pct: snap.directPercent, color: BUCKET_COLORS["Direct COGS"], breakdown: RUNG_INFO.direct },
    { key: "indirect", label: "3. Indirect Cost of Goods (Hidden Job Costs)", value: snap.indirectCogs, pct: snap.indirectPercent, color: BUCKET_COLORS["Indirect COGS"], emphasized: true, breakdown: RUNG_INFO.indirect, silentKiller: true },
    { key: "gross", label: "4. Gross Profit (Left After the Work)", value: snap.grossProfit, pct: snap.grossPercent, breakdown: RUNG_INFO.gross },
    { key: "overhead", label: "5. Overhead (Running the Business)", value: snap.overhead, pct: snap.overheadPercent, color: BUCKET_COLORS["Overhead"], breakdown: RUNG_INFO.overhead },
    { key: "net", label: planning ? "6. Projected Net Profit" : "6. Net Profit (What You Keep)", value: snap.netProfit, pct: snap.netPercent, color: BUCKET_COLORS["Net Profit"], emphasized: true, breakdown: RUNG_INFO.net },
  ];

  return (
    <div>
      {/* Net Profit hero band — tier-aware label (Projected Net Profit in PLANNING). */}
      <div className="rounded-2xl border-2 p-6 mb-4 text-center" style={{ backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}>
        <div className="text-xs uppercase tracking-[1.5px]" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{netLabel}</div>
        <div className="text-[44px] leading-none font-semibold tabular-nums tracking-[-2px] mt-2" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{formatMoney(snap.netProfit)}</div>
        <div className="text-sm tabular-nums mt-1" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{snap.netPercent}%</div>
      </div>

      {/* Six stacked rungs — accordion, one open at a time. */}
      <div className="space-y-1.5">
        {rungs.map((r) => {
          const open = openRung === r.key;
          const c = r.color;
          const term = RUNG_GLOSSARY[r.key];
          const def = term ? glossaryDef(term) : undefined;
          return (
            <div key={r.key} className={`rounded-xl ${r.emphasized ? "border-2" : "border"}`} style={c ? { backgroundColor: c.bg, borderColor: c.border } : undefined}>
              <button type="button" onClick={() => toggle(r.key)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2 flex-wrap" style={c ? { color: c.fg } : undefined}>
                    {r.label}
                    {r.silentKiller && (
                      <span className="text-[10px] px-1.5 py-0 rounded text-white font-medium" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].fg }}>SILENT KILLER</span>
                    )}
                  </div>
                  {/* Silent Killer strip (rung 3) — always visible; reuses the live approved subline. */}
                  {r.silentKiller && (
                    <div className="text-xs mt-0.5" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>The hidden bucket: labor burden, shop supplies, small tools, untracked mobilization, admin creep, etc.</div>
                  )}
                </div>
                <div className="text-right shrink-0 tabular-nums" style={c ? { color: c.fg } : undefined}>
                  <div className="font-semibold">{formatMoney(r.value)}</div>
                  {r.pct !== null && <div className="text-xs">({r.pct}%)</div>}
                </div>
              </button>
              {open && (
                <div className="px-4 pb-4 -mt-1 space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Breakdown</div>
                    <div className="text-xs leading-snug text-muted-foreground">{r.breakdown}</div>
                  </div>
                  {def && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Glossary — {term}</div>
                      <div className="text-xs leading-snug text-muted-foreground">{def}</div>
                    </div>
                  )}
                  {/* COPY LAW: "Worked example" and "How to improve" slots await owner-approved copy. */}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
