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

// Full ladder with per-rung "Details" toggles (the modal view). Disclosure state is owned by the
// caller so each surface keeps independent expand state.
export function MoneyMapLadderFull({
  snap, expandedRungs, toggleRung, tier = "CONFIRMED",
}: {
  snap: MoneyMapSnapshot;
  expandedRungs: Set<string>;
  toggleRung: (k: string) => void;
  tier?: PipelineTier;
}) {
  const planning = tier === "PLANNING";
  const revDesc = planning ? "What you’d collect if you win it — your bid total (projected)" : "Top line — what the customer pays you";
  const revInfo = planning
    ? "This is your BID total (projected) — what you’d collect if you win the job. It only becomes Revenue once the job is foreman-confirmed at Ready to Invoice."
    : RUNG_INFO.revenue;
  return (
    <div className="max-w-lg mx-auto">
      {/* Rung 1: Revenue / Bid Value (neutral — not a bucket) */}
      <div className="rounded-xl border bg-muted/40 p-4 mb-1 flex items-center justify-between">
        <div>
          <div className="font-semibold">{rung1Label(tier)}</div>
          <div className="text-xs text-muted-foreground">{revDesc}</div>
          <button type="button" onClick={() => toggleRung('revenue')} className="mt-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">{expandedRungs.has('revenue') ? 'Hide details' : 'Details'}</button>
        </div>
        <div className="text-right text-sm font-semibold tabular-nums">{formatMoney(snap.revenue)}</div>
      </div>
      {expandedRungs.has('revenue') && (
        <div className="mb-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-snug">{revInfo}</div>
      )}

      {/* Rung 2: Cost of Goods (Direct Job Costs) — slate */}
      <div className="rounded-xl border p-4 mb-1 flex items-center justify-between" style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}>
        <div>
          <div className="font-semibold" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>2. Cost of Goods (Direct Job Costs)</div>
          <div className="text-xs" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>Obvious job costs you see in the Pricer (L+E+M)</div>
          <button type="button" onClick={() => toggleRung('direct')} className="mt-1 text-[11px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{expandedRungs.has('direct') ? 'Hide details' : 'Details'}</button>
        </div>
        <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{formatMoney(snap.directCogs)} <span className="text-xs">({snap.directPercent}%)</span></div>
      </div>
      {expandedRungs.has('direct') && (
        <div className="mb-1 rounded-lg border px-3 py-2 text-xs leading-snug" style={{ color: BUCKET_COLORS["Direct COGS"].fg, backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}>{RUNG_INFO.direct}</div>
      )}

      {/* Rung 3: Indirect Cost of Goods (Hidden Job Costs) — brand maroon, the killer */}
      <div className="rounded-xl border-2 p-4 mb-1 flex items-center justify-between" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}>
        <div>
          <div className="font-semibold flex items-center gap-1.5" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>
            3. Indirect Cost of Goods (Hidden Job Costs) <span className="text-[10px] px-1.5 py-0 rounded text-white font-medium" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].fg }}>SILENT KILLER</span>
          </div>
          <div className="text-xs" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>The hidden bucket: labor burden, shop supplies, small tools, untracked mobilization, admin creep, etc.</div>
          <button type="button" onClick={() => toggleRung('indirect')} className="mt-1 text-[11px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>{expandedRungs.has('indirect') ? 'Hide details' : 'Details'}</button>
        </div>
        <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>{formatMoney(snap.indirectCogs)} <span className="text-xs">({snap.indirectPercent}%)</span></div>
      </div>
      {expandedRungs.has('indirect') && (
        <div className="mb-1 rounded-lg border-2 px-3 py-2 text-xs leading-snug" style={{ color: BUCKET_COLORS["Indirect COGS"].fg, backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}>{RUNG_INFO.indirect}</div>
      )}

      {/* Rung 4: Gross Profit — neutral (green reserved for kept money) */}
      <div className="rounded-xl border bg-muted/40 p-4 mb-1 flex items-center justify-between">
        <div>
          <div className="font-semibold">4. Gross Profit (Left After the Work)</div>
          <div className="text-xs text-muted-foreground">What’s left after all job costs (Direct + Indirect COGS)</div>
          <button type="button" onClick={() => toggleRung('gross')} className="mt-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">{expandedRungs.has('gross') ? 'Hide details' : 'Details'}</button>
        </div>
        <div className="text-right text-sm tabular-nums">{formatMoney(snap.grossProfit)} <span className="text-xs">({snap.grossPercent}%)</span></div>
      </div>
      {expandedRungs.has('gross') && (
        <div className="mb-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-snug">{RUNG_INFO.gross}</div>
      )}

      {/* Rung 5: Overhead (Running the Business) — indigo */}
      <div className="rounded-xl border p-4 mb-1 flex items-center justify-between" style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}>
        <div>
          <div className="font-semibold" style={{ color: BUCKET_COLORS["Overhead"].fg }}>5. Overhead (Running the Business)</div>
          <div className="text-xs" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Fixed cost of running the business (see Overhead &amp; Profit pillar)</div>
          <button type="button" onClick={() => toggleRung('overhead')} className="mt-1 text-[11px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{expandedRungs.has('overhead') ? 'Hide details' : 'Details'}</button>
        </div>
        <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(snap.overhead)} <span className="text-xs">({snap.overheadPercent}%)</span></div>
      </div>
      {expandedRungs.has('overhead') && (
        <div className="mb-1 rounded-lg border px-3 py-2 text-xs leading-snug" style={{ color: BUCKET_COLORS["Overhead"].fg, backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}>{RUNG_INFO.overhead}</div>
      )}

      {/* Rung 6: Net Profit — green (kept money) */}
      <div className="rounded-xl border-2 p-4 flex items-center justify-between" style={{ backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}>
        <div>
          <div className="font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>6. Net Profit (What You Keep)</div>
          <div className="text-xs" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>True owner profit after everything. The culture goal.</div>
          <button type="button" onClick={() => toggleRung('net')} className="mt-1 text-[11px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{expandedRungs.has('net') ? 'Hide details' : 'Details'}</button>
        </div>
        <div className="text-right text-sm tabular-nums font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{formatMoney(snap.netProfit)} <span className="text-xs">({snap.netPercent}%)</span></div>
      </div>
      {expandedRungs.has('net') && (
        <div className="mt-1 rounded-lg border-2 px-3 py-2 text-xs leading-snug" style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}>{RUNG_INFO.net}</div>
      )}
    </div>
  );
}

// Quick Glossary block — one term per row, each expands in place. Caller owns expand state.
export function MoneyMapGlossary({
  expandedTerms, toggleTerm,
}: {
  expandedTerms: Set<string>;
  toggleTerm: (k: string) => void;
}) {
  return (
    <div className="divide-y divide-border/60 rounded-lg border">
      {GLOSSARY_TERMS.map((g) => {
        const open = expandedTerms.has(g.term);
        return (
          <div key={g.term}>
            <button
              type="button"
              onClick={() => toggleTerm(g.term)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
              aria-expanded={open}
            >
              <span>{g.term}</span>
              <span aria-hidden className="text-muted-foreground text-xs">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
              <div className="px-3 pb-3 text-xs text-muted-foreground leading-snug">{g.def}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
