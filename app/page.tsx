"use client";

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  Wrench,
  Package,
  Calculator,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  X,
} from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import { BUCKET_COLORS } from "@/lib/pmz-types"

interface ToolCardProps {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  featured?: boolean
}

function ToolCard({ href, icon: Icon, title, description, featured }: ToolCardProps) {
  return (
    <Link href={href} className="group block h-full">
      <Card className={`card card-hover h-full flex flex-col transition-all group-hover:border-primary/40 ${featured ? "ring-1 ring-primary/20" : ""}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={`rounded-lg p-2.5 ${featured ? "bg-primary text-primary-foreground" : "bg-surface-2"}`}>
              <Icon className="h-5 w-5" />
            </div>
            {featured && <Badge className="bg-primary/10 text-primary border-primary/20">Primary</Badge>}
          </div>
          <CardTitle className="text-lg mt-3 tracking-[-0.01em]">{title}</CardTitle>
          <CardDescription className="leading-snug">{description}</CardDescription>
        </CardHeader>
        <CardContent className="mt-auto pt-0">
          <div className="flex items-center text-sm font-medium text-primary group-hover:gap-1.5 transition-all">
            Open tool <ArrowRight className="ml-1 h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// Consistent currency formatter: always exactly 2 decimal places + thousands separators
function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "$0.00";
  }
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted}`;
}

// The ONE qualifying set for realized performance — invoiced-is-terminal. Shared by every card
// that reports sales performance (Revenue, COGS, Gross); no card computes its own set.
const REALIZED_STATUSES = new Set<string>(["Invoiced", "Paid", "Completed"]);
function qualifyingQuotes(quotes: unknown): any[] {
  return Array.isArray(quotes) ? quotes.filter((q: any) => REALIZED_STATUSES.has(q?.status)) : [];
}

// The Money Map populates from FOREMAN-CONFIRMED jobs: Ready to Invoice or beyond. This gate is
// one step earlier than the Boss View's invoiced gate — "Ready to Invoice" means the foreman has
// confirmed real costs, so the Map can honestly map the job to profit reality. Draft / Sent for
// Acceptance / Work Order Active never feed it.
const MAP_CONFIRMED_STATUSES = new Set<string>(["Ready to Invoice", "Invoiced", "Paid", "Completed"]);

// The only Boss View badge: LIVE — the number is earned from the owner's own realized data
// (invoiced-tier sales / a filled overhead chart). There is no bid tier and no sample: a card
// with no earned data shows an instructive empty state instead of a badge or a made-up number.
function SourceTag() {
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, border: `1px solid ${BUCKET_COLORS["Net Profit"].border}` }}
    >
      LIVE
    </span>
  );
}

// The instructive empty state shown in place of a number when a card has no earned data.
function CardEmpty({ text }: { text: string }) {
  return <div className="mt-4 text-sm text-muted-foreground leading-snug">{text}</div>;
}

// Money Map — per-rung "Details" copy (Fix 4). Folds the old shared explain-box + decision-tree
// guidance into the ladder itself: each rung expands its own definition in place, one level deep.
const RUNG_INFO: Record<string, string> = {
  revenue: "Revenue is the top line — what the customer pays you, from your Project Pricer bid total.",
  direct: "Cost of Goods (Direct Job Costs) = the Labor + Equipment + Material you actively build in the Full Real LEM section of the Project Pricer — the obvious L+E+M you control per job.",
  indirect: "Indirect Cost of Goods (Hidden Job Costs) hides in labor burden beyond base pay, shop supplies, small tools, unbillable time, mobilization “extras”, fuel surcharges not passed through, etc. It’s a subset of Cost of Goods — it rolls up to COGS on the P&L, but PMZ teaches the breakout. It rarely shows in your LEM table yet destroys your target margin. This is the bucket the Money Map exists to kill.",
  gross: "Gross Profit = Revenue − (Direct + Indirect COGS). This is the number the Project Pricer’s Gross Profit % field is trying to protect.",
  overhead: "Overhead (Running the Business) = fixed business costs (insurance, shop rent, admin salaries, etc.). Managed in the Overhead & Profit pillar.",
  net: "Net Profit = Gross − Overhead. The true owner take-home. Everything else is just moving money between buckets.",
};

// Money Map — Quick Glossary (Fix 4): one term per row, each expands its definition in place.
const GLOSSARY_TERMS: { term: string; def: string }[] = [
  { term: "Cost of Goods (Direct Job Costs)", def: "Job-visible costs in your LEM — the Labor, Equipment, and Material you control per job." },
  { term: "Indirect Cost of Goods (Hidden Job Costs)", def: "The invisible tax on every job — a subset of Cost of Goods that rolls up to COGS on the P&L, but PMZ teaches the breakout. Shrink this first; it’s the fastest lever most contractors have." },
  { term: "Overhead (Running the Business)", def: "The price of being in business — fixed costs whether or not you have a job." },
  { term: "Net Profit (What You Keep)", def: "The only number that pays the owner. Gross Profit minus Overhead." },
];

export default function OverviewPage() {
  // Boss View executive figures are computed honestly below (bossView) — no hardcoded constants.

  // Gate the snapshot's localStorage reads behind a post-mount flag so SSR and the first client render
  // both use the demo fallbacks above (no hydration mismatch); real values swap in after mount.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  // ── Boss View — starts at Invoiced (owner's final ruling) ────────────────────
  // A number is earned only from REALIZED data. There is NO latest-bid fallback and NO
  // sample: a card with no earned data shows an instructive empty state naming the action
  // that earns it.
  //  • Revenue / COGS / Gross: summed from qualifying (invoiced-or-beyond) quotes ONLY.
  //    Zero qualifying quotes ⇒ these cards are empty ("Invoice a quote to see this.").
  //  • Overhead / per-hour: from the saved Overhead chart (items / billable hours).
  //  • Derived cards compute ONLY when every input is earned: Gross needs invoiced sales;
  //    Net needs invoiced sales AND overhead. LIVE is the only badge.
  const bossView = useMemo(() => {
    let revenue = 0, cogs = 0
    let salesEarned = false
    let overhead = 0, billableHours = 0
    let overheadEarned = false, billableHoursEarned = false
    let overheadFromPnl = false  // provenance: overhead applied from the P&L Organizer handoff

    if (hydrated) { try {
      const quotesRaw = localStorage.getItem("pmz_saved_quotes")
      const quotes: any[] = quotesRaw ? JSON.parse(quotesRaw) : []
      // ONE shared qualifying set — Revenue, COGS, and Gross all read from exactly this list.
      // No fallback: a Draft / Work Order Active / Declined quote is never Boss View data.
      const qualifying = qualifyingQuotes(quotes)
      if (qualifying.length > 0) {
        revenue = qualifying.reduce((s, q) => s + (Number(q.totalRevenue) || 0), 0)
        cogs = qualifying.reduce((s, q) => s + (Number(q.directCogsDollars) || 0) + (Number(q.indirectCogsDollars) || 0), 0)
        salesEarned = true
      }
      const overheadRaw = localStorage.getItem("pmz_overhead_chart")
      const chart = overheadRaw ? JSON.parse(overheadRaw) : null
      if (chart && Array.isArray(chart.items)) {
        const total = chart.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
        if (total > 0) { overhead = total; overheadEarned = true; overheadFromPnl = chart.source === "pnl-organizer" }
        const bh = Number(chart.billableHours) || 0
        if (overheadEarned && bh > 0) { billableHours = bh; billableHoursEarned = true }
      }
    } catch {} }

    // Earned flags — a card is earned only when the owner's realized data produced it.
    const grossEarned = salesEarned                          // Gross = Revenue − COGS (invoiced sales)
    const perHourEarned = overheadEarned && billableHoursEarned
    const netEarned = salesEarned && overheadEarned          // every input earned; no blending

    const grossProfit = revenue - cogs
    const netProfit = grossProfit - overhead
    const overheadPerHour = perHourEarned ? overhead / billableHours : 0
    const pct = (n: number) => (revenue > 0 ? (n / revenue) * 100 : 0)

    const salesSource = 'from invoiced quotes'
    const netSource = 'invoiced quotes · Overhead chart'
    // Honesty: the overhead card names where its number came from (F2 Step 2 provenance).
    const overheadSource = overheadFromPnl ? 'from your P&L Organizer' : 'from your Overhead chart'

    // Banner — describes what's earned and what's still waiting (references invoicing, not bids).
    const waiting: string[] = []
    if (!salesEarned) waiting.push('an invoiced quote')
    if (!overheadEarned) waiting.push('your overhead chart')
    if (overheadEarned && !billableHoursEarned) waiting.push('billable hours in your overhead chart')
    const fullyLive = salesEarned && overheadEarned && billableHoursEarned
    const banner = fullyLive
      ? 'Live from your libraries — every number is earned from your data.'
      : `Waiting on ${waiting.join(', ')}.`

    return {
      salesEarned, grossEarned, overheadEarned, perHourEarned, netEarned, fullyLive, banner,
      revenue, cogs, grossProfit, overhead, overheadPerHour, netProfit,
      grossProfitPercent: pct(grossProfit),
      overheadPercentOfRevenue: pct(overhead),
      netProfitPercent: pct(netProfit),
      salesSource, netSource, overheadSource,
    }
  }, [hydrated])

  // ── PMZ Money Map — goes dark until facts exist (owner's ruling) ─────────────
  // The Map populates ONLY from the latest FOREMAN-CONFIRMED job (Ready to Invoice or
  // beyond). No qualifying quote ⇒ confirmed:false and the render shows an empty state;
  // there is NO sample seed and NO latest-bid pull. When confirmed, the job supplies
  // Revenue / Direct / Indirect COGS and the overhead chart supplies the overhead-of-
  // revenue rate, allocated to this job. Every rung derives: Gross = Revenue − Direct −
  // Indirect, Net = Gross − Overhead; every percentage is computed from the dollars.
  const moneyMapSnapshot = useMemo(() => {
    let confirmed = false
    let rev = 0, directCogs = 0, indirectCogs = 0, overhead = 0

    if (hydrated) { try {
      const quotes = JSON.parse(localStorage.getItem("pmz_saved_quotes") || "[]")
      const chartRaw = localStorage.getItem("pmz_overhead_chart")
      const chart = chartRaw ? JSON.parse(chartRaw) : null

      // Latest foreman-confirmed job (Ready to Invoice or beyond) — nothing earlier feeds it.
      const mapJobs = Array.isArray(quotes) ? quotes.filter((q: any) => MAP_CONFIRMED_STATUSES.has(q?.status)) : []
      if (mapJobs.length > 0) {
        const latest = mapJobs[mapJobs.length - 1]
        const r = Number(latest.totalRevenue) || 0
        if (r > 0) {
          rev = r
          directCogs = Number(latest.directCogsDollars) || 0
          indirectCogs = Number(latest.indirectCogsDollars) || 0
          // Overhead as a real allocation: (company overhead ÷ company revenue) × this job.
          const totalOverhead = chart && Array.isArray(chart.items)
            ? chart.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
            : 0
          const overheadRate = chart && chart.monthlyRevenue > 0 ? totalOverhead / chart.monthlyRevenue : 0
          overhead = Math.round(rev * overheadRate)
          confirmed = true
        }
      }
    } catch {} }

    const grossProfit = rev - directCogs - indirectCogs
    const netProfit = grossProfit - overhead
    const pct = (n: number) => (rev > 0 ? Math.round((n / rev) * 1000) / 10 : 0)
    return {
      confirmed,
      revenue: rev,
      directCogs, directPercent: pct(directCogs),
      indirectCogs, indirectPercent: pct(indirectCogs),
      grossProfit, grossPercent: pct(grossProfit),
      overhead, overheadPercent: pct(overhead),
      netProfit, netPercent: pct(netProfit),
    }
  }, [hydrated])

  // Empty-state copy shown when no foreman-confirmed job exists yet.
  const MAP_EMPTY = "Move a job to Ready to Invoice — once your foreman confirms costs, this maps it to profit reality."

  const [showMoneyMap, setShowMoneyMap] = useState(false)
  // Progressive disclosure (Fix 4) — per-rung and per-glossary-term expand-in-place state.
  // Independent toggles: expanding one leaves siblings collapsed. One level deep, no navigation.
  const [expandedRungs, setExpandedRungs] = useState<Set<string>>(new Set())
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set())
  const toggleRung = (k: string) => setExpandedRungs((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleTerm = (k: string) => setExpandedTerms((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const resetMapDisclosure = () => { setExpandedRungs(new Set()); setExpandedTerms(new Set()) }

  // Earned green: Net Profit shows green ONLY when earned AND positive; destructive-red when
  // negative; muted otherwise. Green can't appear on unearned profit. (Only used when netEarned.)
  const netEarnedGreen = bossView.netEarned && bossView.netProfit > 0
  const netClass = bossView.netProfit < 0 ? "text-destructive" : (netEarnedGreen ? "" : "text-muted-foreground")
  const netStyle = netEarnedGreen ? { color: BUCKET_COLORS["Net Profit"].fg } : undefined

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Clean Executive Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground mb-2">
            Executive Dashboard • {bossView.banner}
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Boss View / Quick Read</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">Your true P&amp;L at a glance. Click any card for details.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/overhead-profit">Manage detailed overhead →</Link>
        </Button>
      </div>

      {/* The 6 Summary Cards — ONLY earned numbers; unearned cards show an instructive empty state */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Revenue (Income) */}
        <div
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => alert('Revenue breakdown by Work Type would open here.\n\nA full build would show an editable breakdown by New Construction, Renovation, Service, etc.')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Revenue (Income)</div>
              {bossView.salesEarned && <SourceTag />}
            </div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">click for breakdown →</span>
          </div>
          {bossView.salesEarned ? (
            <>
              <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">{formatMoney(bossView.revenue)}</div>
              <div className="text-[11px] text-muted-foreground mt-2">{bossView.salesSource}</div>
            </>
          ) : (
            <CardEmpty text="Invoice a quote to see this." />
          )}
        </div>

        {/* Cost of Goods (COGS) */}
        <div
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => alert('Cost of Goods (COGS) = direct + indirect COGS, summed from your invoiced quotes.\n\nUntil you have invoiced quotes it shows your latest saved bid. This reconciles with the Money Map’s Direct + Indirect rungs.')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Cost of Goods (COGS)</div>
              {bossView.salesEarned && <SourceTag />}
            </div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">click for breakdown →</span>
          </div>
          {bossView.salesEarned ? (
            <>
              <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">{formatMoney(bossView.cogs)}</div>
              <div className="text-[11px] text-muted-foreground mt-2">{bossView.salesSource} · sums direct + indirect COGS</div>
            </>
          ) : (
            <CardEmpty text="Invoice a quote to see this." />
          )}
        </div>

        {/* Gross Profit (Left After the Work) */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Gross Profit (Left After the Work)</div>
            {bossView.grossEarned && <SourceTag />}
          </div>
          {bossView.grossEarned ? (
            <>
              <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">{formatMoney(bossView.grossProfit)}</div>
              <div className="text-sm text-muted-foreground mt-2 tabular-nums">{bossView.grossProfitPercent.toFixed(1)}%</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{bossView.salesSource}</div>
            </>
          ) : (
            <CardEmpty text="Invoice a quote to see this." />
          )}
        </div>

        {/* Overhead (Running the Business) — Clickable to detailed page */}
        <div
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => window.location.href = '/overhead-profit'}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[1.5px]" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Overhead (Running the Business)</div>
              {bossView.overheadEarned && <SourceTag />}
            </div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">view details →</span>
          </div>
          {bossView.overheadEarned ? (
            <>
              <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">{formatMoney(bossView.overhead)}</div>
              <div className="text-sm text-muted-foreground mt-2 tabular-nums">{bossView.overheadPercentOfRevenue.toFixed(1)}% of Revenue</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{bossView.overheadSource}</div>
            </>
          ) : (
            <CardEmpty text="Enter your overhead chart to see this." />
          )}
        </div>

        {/* Overhead per Billable Hour */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Overhead per Billable Hour</div>
            {bossView.perHourEarned && <SourceTag />}
          </div>
          {bossView.perHourEarned ? (
            <>
              <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">{formatMoney(bossView.overheadPerHour)}</div>
              <div className="text-[11px] text-muted-foreground mt-2">from your Overhead chart</div>
            </>
          ) : (
            <CardEmpty text="Add billable hours to your overhead chart." />
          )}
        </div>

        {/* Net Profit (What You Keep) — earned green only */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Net Profit (What You Keep)</div>
            {bossView.netEarned && <SourceTag />}
          </div>
          {bossView.netEarned ? (
            <>
              <div className={`text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4 ${netClass}`} style={netStyle}>{formatMoney(bossView.netProfit)}</div>
              <div className={`text-sm mt-2 tabular-nums ${netClass}`} style={netStyle}>{bossView.netProfitPercent.toFixed(1)}%</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{bossView.netSource}</div>
            </>
          ) : (
            <CardEmpty text="Needs your sales and overhead." />
          )}
        </div>
      </div>

      {/* Quick note */}
      <div className="text-center text-xs text-muted-foreground">
        {bossView.fullyLive
          ? "Live from your invoiced quotes and Overhead chart. "
          : "Cards fill in as you save bids, invoice quotes, and complete your overhead chart. "}
        Click Revenue or COGS cards above for breakdowns. Full drill-down editor lives in <Link href="/overhead-profit" className="text-primary underline">Overhead &amp; Profit</Link>.
      </div>

      {/* NEW: PMZ Money Map — Layer 1 Quick Snapshot (always visible, at-a-glance training tool) */}
      <Card className="card border-2 border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#EB3300]" /> PMZ Money Map — {moneyMapSnapshot.confirmed ? "This Job" : "Quick Snapshot"}
                {moneyMapSnapshot.confirmed && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, border: `1px solid ${BUCKET_COLORS["Net Profit"].border}` }}>CONFIRMED</span>
                )}
              </CardTitle>
              <CardDescription>
                {moneyMapSnapshot.confirmed
                  ? "How your latest foreman-confirmed job maps to profit reality."
                  : "How a foreman-confirmed job maps to profit reality."}
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => { setShowMoneyMap(true); resetMapDisclosure(); }}>
              View Full Money Map &amp; Glossary
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!moneyMapSnapshot.confirmed ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
              <div className="text-sm font-medium text-muted-foreground">{MAP_EMPTY}</div>
            </div>
          ) : (
          <>
          {/* Compact 6-rung ladder */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-1.5">
              <div className="font-medium">1. Revenue (Income)</div>
              <div className="tabular-nums font-semibold">{formatMoney(moneyMapSnapshot.revenue)}</div>
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}>
              <div className="font-medium" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>2. Cost of Goods (Direct Job Costs)</div>
              <div className="tabular-nums" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{formatMoney(moneyMapSnapshot.directCogs)} <span className="text-xs">({moneyMapSnapshot.directPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border-2 px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}>
              <div>
                <span className="font-medium" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>3. Indirect Cost of Goods (Hidden Job Costs)</span>
                <span className="ml-1 text-[10px] font-semibold" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>SILENT PROFIT KILLER</span>
              </div>
              <div className="tabular-nums" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>{formatMoney(moneyMapSnapshot.indirectCogs)} <span className="text-xs">({moneyMapSnapshot.indirectPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-1.5">
              <div className="font-medium">4. Gross Profit (Left After the Work)</div>
              <div className="tabular-nums">{formatMoney(moneyMapSnapshot.grossProfit)} <span className="text-xs text-muted-foreground">({moneyMapSnapshot.grossPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}>
              <div className="font-medium" style={{ color: BUCKET_COLORS["Overhead"].fg }}>5. Overhead (Running the Business)</div>
              <div className="tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(moneyMapSnapshot.overhead)} <span className="text-xs">({moneyMapSnapshot.overheadPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border-2 px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}>
              <div className="font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>6. Net Profit (What You Keep)</div>
              <div className="tabular-nums font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{formatMoney(moneyMapSnapshot.netProfit)} <span className="text-xs">({moneyMapSnapshot.netPercent}%)</span></div>
            </div>
          </div>

          <div className="mt-3 text-xs rounded px-3 py-2 border" style={{ color: BUCKET_COLORS["Indirect COGS"].fg, backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}>
            This confirmed job is allocating <strong>{moneyMapSnapshot.indirectPercent}%</strong> to Indirect Cost of Goods (Hidden Job Costs) — the bucket that quietly kills margins.
          </div>

          <div className="mt-2 text-[10px] text-muted-foreground">
            From foreman-confirmed jobs; overhead allocated from your Overhead chart. Click the button for the full educational ladder.
          </div>
          </>
          )}
        </CardContent>
      </Card>

      {/* Four Pillars of Profit — reference legend / key for the pillar-badged tools below */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">The Four Pillars of Profit</h2>
        <p className="text-sm text-muted-foreground mb-4">Every tool below is built on one of these four.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="card h-full" style={{ borderColor: "#EB3300", borderWidth: "6px" }}>
            <CardContent className="p-4">
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-[#EB3300]/40 text-[#EB3300]">PILLAR 1</Badge>
              <div className="mt-2.5 font-medium tracking-[-0.01em]">North Star</div>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">Your overhead and your profit target: what you must clear and what you aim to keep.</p>
            </CardContent>
          </Card>
          <Card className="card h-full" style={{ borderColor: "#7D1424", borderWidth: "6px" }}>
            <CardContent className="p-4">
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-[#7D1424]/40 text-[#7D1424]">PILLAR 2</Badge>
              <div className="mt-2.5 font-medium tracking-[-0.01em]">Revenue Filter</div>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">A margin target for every type of work you do.</p>
            </CardContent>
          </Card>
          <Card className="card h-full" style={{ borderColor: "#5A1818", borderWidth: "6px" }}>
            <CardContent className="p-4">
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-[#5A1818]/40 text-[#5A1818]">PILLAR 3</Badge>
              <div className="mt-2.5 font-medium tracking-[-0.01em]">Hard Science</div>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">Your real cost to do the work: labor, equipment, and material.</p>
            </CardContent>
          </Card>
          <Card className="card h-full" style={{ borderColor: "#212322", borderWidth: "6px" }}>
            <CardContent className="p-4">
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-[#212322]/40 text-[#212322]">PILLAR 4</Badge>
              <div className="mt-2.5 font-medium tracking-[-0.01em]">The Lock</div>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">Hold that margin when you build the bid.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tools grid - clean navigation */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-4">Your Tools</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ToolCard href="/labor-rates" icon={Users} title="Labor Rates" description="True burdened cost per billable hour for every role." />
          <ToolCard href="/equipment-rates" icon={Wrench} title="Equipment Rates" description="Ownership + operating cost per hour for every asset." />
          <ToolCard href="/material-rates" icon={Package} title="Material Rates" description="True landed cost per unit for every material." />
          <ToolCard href="/overhead-profit" icon={Calculator} title="Overhead &amp; Profit" description="Separate fixed overhead for accurate job costing." featured />
          <ToolCard href="/project-pricer" icon={TrendingUp} title="Project Pricer" description="The daily driver. Build accurate bids from your real costs." />
        </div>
      </section>

      {/* Layer 2: Full Money Map — modal (clean professional training view) */}
      {showMoneyMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { setShowMoneyMap(false); resetMapDisclosure(); }}>
          <div className="w-full max-w-4xl rounded-2xl bg-background shadow-2xl overflow-hidden border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xl font-semibold tracking-tight">PMZ Money Map — Full View &amp; Glossary</div>
                  <div className="text-xs text-muted-foreground">Profit isn’t a number. It’s a culture.</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setShowMoneyMap(false); resetMapDisclosure(); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-auto">
              {/* The Ladder - 6 rungs, clean stacked design */}
              <div className="max-w-lg mx-auto">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <div className="text-xs uppercase tracking-[1px] text-muted-foreground text-center">THE PROFIT LADDER (how every dollar flows)</div>
                  {moneyMapSnapshot.confirmed && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, border: `1px solid ${BUCKET_COLORS["Net Profit"].border}` }}>CONFIRMED</span>
                  )}
                </div>
                {!moneyMapSnapshot.confirmed ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm font-medium text-muted-foreground">
                    {MAP_EMPTY}
                  </div>
                ) : (
                <>

                {/* Rung 1: Revenue (neutral — not a bucket) */}
                <div className="rounded-xl border bg-muted/40 p-4 mb-1 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">1. Revenue (Income)</div>
                    <div className="text-xs text-muted-foreground">Top line — what the customer pays you</div>
                    <button type="button" onClick={() => toggleRung('revenue')} className="mt-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">{expandedRungs.has('revenue') ? 'Hide details' : 'Details'}</button>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">{formatMoney(moneyMapSnapshot.revenue)}</div>
                </div>
                {expandedRungs.has('revenue') && (
                  <div className="mb-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-snug">{RUNG_INFO.revenue}</div>
                )}

                {/* Rung 2: Cost of Goods (Direct Job Costs) — slate */}
                <div className="rounded-xl border p-4 mb-1 flex items-center justify-between" style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}>
                  <div>
                    <div className="font-semibold" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>2. Cost of Goods (Direct Job Costs)</div>
                    <div className="text-xs" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>Obvious job costs you see in the Pricer (L+E+M)</div>
                    <button type="button" onClick={() => toggleRung('direct')} className="mt-1 text-[11px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{expandedRungs.has('direct') ? 'Hide details' : 'Details'}</button>
                  </div>
                  <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{formatMoney(moneyMapSnapshot.directCogs)} <span className="text-xs">({moneyMapSnapshot.directPercent}%)</span></div>
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
                  <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>{formatMoney(moneyMapSnapshot.indirectCogs)} <span className="text-xs">({moneyMapSnapshot.indirectPercent}%)</span></div>
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
                  <div className="text-right text-sm tabular-nums">{formatMoney(moneyMapSnapshot.grossProfit)} <span className="text-xs">({moneyMapSnapshot.grossPercent}%)</span></div>
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
                  <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(moneyMapSnapshot.overhead)} <span className="text-xs">({moneyMapSnapshot.overheadPercent}%)</span></div>
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
                  <div className="text-right text-sm tabular-nums font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{formatMoney(moneyMapSnapshot.netProfit)} <span className="text-xs">({moneyMapSnapshot.netPercent}%)</span></div>
                </div>
                {expandedRungs.has('net') && (
                  <div className="mt-1 rounded-lg border-2 px-3 py-2 text-xs leading-snug" style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}>{RUNG_INFO.net}</div>
                )}
                </>
                )}
              </div>

              {/* Quick Glossary — one term per row, each expands in place (one level deep, Fix 4) */}
              <div className="border-t pt-4">
                <div className="text-sm font-semibold mb-2">Quick Glossary</div>
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
                <p className="mt-2 text-[11px] text-muted-foreground">Tap any rung’s <span className="font-medium">Details</span> above, or a term here, to expand it in place.</p>
              </div>
            </div>

            <div className="border-t bg-muted/30 px-6 py-3 text-xs flex items-center justify-between text-muted-foreground">
              <div>Close this anytime — it’s here to build the habit, not slow you down.</div>
              <Button size="sm" variant="outline" onClick={() => { setShowMoneyMap(false); resetMapDisclosure(); }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
