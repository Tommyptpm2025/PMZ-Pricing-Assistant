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
  Info,
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

// Per-card honesty chip — a card earns LIVE only when its own source exists; otherwise SAMPLE.
// LIVE uses the Net Profit (green) token; SAMPLE is muted. Never shown without a real source.
function SourceTag({ live }: { live: boolean }) {
  return live ? (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, border: `1px solid ${BUCKET_COLORS["Net Profit"].border}` }}
    >
      LIVE
    </span>
  ) : (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
      SAMPLE
    </span>
  );
}

export default function OverviewPage() {
  // Boss View executive figures are computed honestly below (bossView) — no hardcoded constants.

  // Gate the snapshot's localStorage reads behind a post-mount flag so SSR and the first client render
  // both use the demo fallbacks above (no hydration mismatch); real values swap in after mount.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  // ── Boss View — per-card honest source (Boss View honesty pass) ─────────────
  // Each card earns LIVE or wears SAMPLE independently based on its OWN source.
  //  • Revenue / COGS / Gross / Net: from saved quotes at INVOICED status or beyond
  //    ONLY (invoiced-is-terminal — drafts/sent/declined never masquerade as
  //    performance). No invoiced quotes → fall back to the latest saved bid, clearly
  //    labelled. No saved quotes → the one sample seed.
  //  • Overhead / per-hour: from the saved Overhead chart (items + billable hours).
  //  • Every rung derives from the rungs above: Gross = Revenue − COGS,
  //    Net = Gross − Overhead. No hardcoded financial constant survives.
  const bossView = useMemo(() => {
    // The ONE sample seed (honestly labelled) — the former demo figures.
    const SAMPLE = { revenue: 185000, cogs: 112000, overhead: 28500, billableHours: 1420 }
    let revenue = SAMPLE.revenue, cogs = SAMPLE.cogs
    let salesTier: 'invoiced' | 'bid' | 'sample' = 'sample'
    let overhead = SAMPLE.overhead, billableHours = SAMPLE.billableHours
    let overheadLive = false

    if (hydrated) { try {
      const quotesRaw = localStorage.getItem("pmz_saved_quotes")
      const quotes: any[] = quotesRaw ? JSON.parse(quotesRaw) : []
      if (Array.isArray(quotes) && quotes.length > 0) {
        // Invoiced-is-terminal: only realized work (invoiced or beyond) counts as performance.
        const REALIZED = new Set(["Invoiced", "Paid", "Completed"])
        const invoiced = quotes.filter((q) => REALIZED.has(q?.status))
        if (invoiced.length > 0) {
          revenue = invoiced.reduce((s, q) => s + (Number(q.totalRevenue) || 0), 0)
          cogs = invoiced.reduce((s, q) => s + (Number(q.directCogsDollars) || 0) + (Number(q.indirectCogsDollars) || 0), 0)
          salesTier = 'invoiced'
        } else {
          const last = quotes[quotes.length - 1]
          revenue = Number(last.totalRevenue) || 0
          cogs = (Number(last.directCogsDollars) || 0) + (Number(last.indirectCogsDollars) || 0)
          salesTier = 'bid'
        }
      }
      const overheadRaw = localStorage.getItem("pmz_overhead_chart")
      const chart = overheadRaw ? JSON.parse(overheadRaw) : null
      if (chart && Array.isArray(chart.items)) {
        const total = chart.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
        if (total > 0) {
          overhead = total
          billableHours = Number(chart.billableHours) || 0
          overheadLive = true
        }
      }
    } catch {} }

    const grossProfit = revenue - cogs
    const netProfit = grossProfit - overhead
    const overheadPerHour = billableHours > 0 ? overhead / billableHours : 0
    const pct = (n: number) => (revenue > 0 ? (n / revenue) * 100 : 0)

    const salesLive = salesTier === 'invoiced'
    const perHourLive = overheadLive && billableHours > 0
    const netLive = salesLive && overheadLive
    const allLive = salesLive && overheadLive && perHourLive

    const salesSource = salesTier === 'invoiced' ? 'from invoiced quotes'
      : salesTier === 'bid' ? 'from your latest bid (not yet invoiced)'
      : 'Sample data'
    const overheadSource = overheadLive ? 'from your Overhead chart' : 'Sample data'
    const perHourSource = perHourLive ? 'from your Overhead chart'
      : overheadLive ? 'Set billable hours in your Overhead chart'
      : 'Sample data'
    const salesShort = salesTier === 'invoiced' ? 'invoiced quotes' : salesTier === 'bid' ? 'latest bid' : 'sample'
    const netSource = `${salesShort} · ${overheadLive ? 'Overhead chart' : 'sample'}`

    return {
      salesTier, salesLive, overheadLive, perHourLive, netLive, allLive,
      revenue, cogs, grossProfit, overhead, overheadPerHour, netProfit,
      grossProfitPercent: pct(grossProfit),
      overheadPercentOfRevenue: pct(overhead),
      netProfitPercent: pct(netProfit),
      salesSource, overheadSource, perHourSource, netSource,
    }
  }, [hydrated])

  // ── PMZ Money Map — one shared, honest source (Fix 3) ───────────────────────
  // Every rung derives from the rungs above it: Gross = Revenue − Direct − Indirect,
  // Net = Gross − Overhead. Every percentage is computed from the dollars, never
  // typed in — no rung carries a hardcoded ratio.
  //
  // Live path: the last saved quote supplies Revenue / Direct / Indirect COGS, and
  // the saved overhead chart supplies the overhead-of-revenue rate, allocated to
  // this bid's revenue. Only when BOTH exist is the ladder fully sourced (isLive).
  // Otherwise ONE clearly-labeled sample seed runs through the identical formula.
  const moneyMapSnapshot = useMemo(() => {
    // The ONE sample seed — raw inputs only (revenue + the three cost buckets).
    // Illustrative; replaced wholesale the moment a live, fully-sourced bid exists.
    const SAMPLE = { revenue: 185000, directCogs: 111000, indirectCogs: 14800, overhead: 22200 }

    let input = SAMPLE
    let isLive = false

    if (hydrated) { try {
      const quotesRaw = localStorage.getItem("pmz_saved_quotes")
      const quotes = quotesRaw ? JSON.parse(quotesRaw) : []
      const overheadRaw = localStorage.getItem("pmz_overhead_chart")
      const overheadChart = overheadRaw ? JSON.parse(overheadRaw) : null

      if (Array.isArray(quotes) && quotes.length > 0 && overheadChart) {
        const last = quotes[quotes.length - 1]
        const rev = Number(last.totalRevenue) || 0
        const direct = Number(last.directCogsDollars) || 0
        const indirect = Number(last.indirectCogsDollars) || 0
        // Overhead as a real allocation: (company overhead ÷ company revenue) × this bid.
        const totalOverhead = Array.isArray(overheadChart.items)
          ? overheadChart.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
          : 0
        const overheadRate = overheadChart.monthlyRevenue > 0 ? totalOverhead / overheadChart.monthlyRevenue : 0
        if (rev > 0) {
          input = { revenue: rev, directCogs: direct, indirectCogs: indirect, overhead: Math.round(rev * overheadRate) }
          isLive = true
        }
      }
    } catch {} }

    // The single ladder formula — identical for live data and the sample seed.
    const { revenue: rev, directCogs, indirectCogs, overhead } = input
    const grossProfit = rev - directCogs - indirectCogs
    const netProfit = grossProfit - overhead
    const pct = (n: number) => (rev > 0 ? Math.round((n / rev) * 1000) / 10 : 0)
    return {
      isLive,
      revenue: rev,
      directCogs, directPercent: pct(directCogs),
      indirectCogs, indirectPercent: pct(indirectCogs),
      grossProfit, grossPercent: pct(grossProfit),
      overhead, overheadPercent: pct(overhead),
      netProfit, netPercent: pct(netProfit),
    }
  }, [hydrated])

  const [showMoneyMap, setShowMoneyMap] = useState(false)
  const [highlightedBucket, setHighlightedBucket] = useState<string | null>(null)

  // Earned green: Net Profit shows green ONLY when it's live AND positive; muted for
  // sample/bid; destructive-red when negative. Green can't appear on unearned profit.
  const netEarnedGreen = bossView.netLive && bossView.netProfit > 0
  const netClass = bossView.netProfit < 0 ? "text-destructive" : (netEarnedGreen ? "" : "text-muted-foreground")
  const netStyle = netEarnedGreen ? { color: BUCKET_COLORS["Net Profit"].fg } : undefined

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Clean Executive Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground mb-2">
            {bossView.allLive
              ? "Executive Dashboard • Live from your libraries"
              : "Sample data shown — build bids and your overhead chart to see your own."}
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Boss View / Quick Read</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">Your true P&amp;L at a glance. Click any card for details.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/overhead-profit">Manage detailed overhead →</Link>
        </Button>
      </div>

      {/* The 6 Summary Cards — each earns LIVE or wears SAMPLE independently (Boss View honesty pass) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Revenue (Income) */}
        <div
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => alert('Revenue breakdown by Work Type would open here.\n\nA full build would show an editable breakdown by New Construction, Renovation, Service, etc.')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Revenue (Income)</div>
              <SourceTag live={bossView.salesLive} />
            </div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">click for breakdown →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(bossView.revenue)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">{bossView.salesSource}</div>
        </div>

        {/* Cost of Goods (COGS) */}
        <div
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => alert('Cost of Goods (COGS) = direct + indirect COGS, summed from your invoiced quotes.\n\nUntil you have invoiced quotes it shows your latest bid or sample data. This reconciles with the Money Map’s Direct + Indirect rungs.')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Cost of Goods (COGS)</div>
              <SourceTag live={bossView.salesLive} />
            </div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">click for breakdown →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(bossView.cogs)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">{bossView.salesSource} · sums direct + indirect COGS</div>
        </div>

        {/* Gross Profit (Left After the Work) */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Gross Profit (Left After the Work)</div>
            <SourceTag live={bossView.salesLive} />
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(bossView.grossProfit)}
          </div>
          <div className="text-sm text-muted-foreground mt-2 tabular-nums">{bossView.grossProfitPercent.toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{bossView.salesSource}</div>
        </div>

        {/* Overhead (Running the Business) — Clickable to detailed page */}
        <div
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => window.location.href = '/overhead-profit'}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[1.5px]" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Overhead (Running the Business)</div>
              <SourceTag live={bossView.overheadLive} />
            </div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">view details →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(bossView.overhead)}
          </div>
          <div className="text-sm text-muted-foreground mt-2 tabular-nums">{bossView.overheadPercentOfRevenue.toFixed(1)}% of Revenue</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{bossView.overheadSource}</div>
        </div>

        {/* Overhead per Billable Hour */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Overhead per Billable Hour</div>
            <SourceTag live={bossView.perHourLive} />
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(bossView.overheadPerHour)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">{bossView.perHourSource}</div>
        </div>

        {/* Net Profit (What You Keep) — earned green only */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Net Profit (What You Keep)</div>
            <SourceTag live={bossView.netLive} />
          </div>
          <div className={`text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4 ${netClass}`} style={netStyle}>
            {formatMoney(bossView.netProfit)}
          </div>
          <div className={`text-sm mt-2 tabular-nums ${netClass}`} style={netStyle}>{bossView.netProfitPercent.toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{bossView.netSource}</div>
        </div>
      </div>

      {/* Quick note */}
      <div className="text-center text-xs text-muted-foreground">
        {bossView.allLive
          ? "Live from your invoiced quotes and Overhead chart. "
          : "Some cards show sample data until you have invoiced quotes and an Overhead chart. "}
        Click Revenue or COGS cards above for breakdowns. Full drill-down editor lives in <Link href="/overhead-profit" className="text-primary underline">Overhead &amp; Profit</Link>.
      </div>

      {/* NEW: PMZ Money Map — Layer 1 Quick Snapshot (always visible, at-a-glance training tool) */}
      <Card className="card border-2 border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#EB3300]" /> PMZ Money Map — Quick Snapshot
                {moneyMapSnapshot.isLive ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, border: `1px solid ${BUCKET_COLORS["Net Profit"].border}` }}>LIVE</span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">SAMPLE DATA</span>
                )}
              </CardTitle>
              <CardDescription>
                {moneyMapSnapshot.isLive
                  ? "How your latest bid (from Project Pricer) maps to profit reality."
                  : "How a bid maps to profit reality. Build a bid in the Project Pricer to see your own numbers here."}
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => { setShowMoneyMap(true); setHighlightedBucket(null); }}>
              View Full Money Map &amp; Glossary
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
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
            {moneyMapSnapshot.isLive ? "Your latest bid is" : "This sample bid is"} allocating <strong>{moneyMapSnapshot.indirectPercent}%</strong> to Indirect Cost of Goods (Hidden Job Costs) — the bucket that quietly kills margins.
          </div>

          <div className="mt-2 text-[10px] text-muted-foreground">
            {moneyMapSnapshot.isLive
              ? "Pulled live from your last saved Project Pricer bid; overhead allocated from your Overhead chart. Click the button for the full educational ladder."
              : "Sample data — no saved bid yet. Build one in the Project Pricer (with an Overhead chart set) and it flows in here automatically. Click the button for the full educational ladder."}
          </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { setShowMoneyMap(false); setHighlightedBucket(null); }}>
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
              <Button variant="ghost" size="icon" onClick={() => { setShowMoneyMap(false); setHighlightedBucket(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-auto">
              {/* The Ladder - 6 rungs, clean stacked design */}
              <div className="max-w-lg mx-auto">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <div className="text-xs uppercase tracking-[1px] text-muted-foreground text-center">THE PROFIT LADDER (how every dollar flows)</div>
                  {moneyMapSnapshot.isLive ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: BUCKET_COLORS["Net Profit"].fg, backgroundColor: BUCKET_COLORS["Net Profit"].bg, border: `1px solid ${BUCKET_COLORS["Net Profit"].border}` }}>LIVE</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">SAMPLE DATA</span>
                  )}
                </div>
                {!moneyMapSnapshot.isLive && (
                  <div className="mb-2 text-center text-[11px] text-muted-foreground">
                    Sample figures shown — build a bid in the Project Pricer (with an Overhead chart set) to see your own.
                  </div>
                )}

                {/* Rung 1: Revenue (neutral — not a bucket) */}
                <div
                  onClick={() => setHighlightedBucket('revenue')}
                  className="cursor-pointer rounded-xl border bg-muted/40 p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                >
                  <div>
                    <div className="font-semibold">1. Revenue (Income)</div>
                    <div className="text-xs text-muted-foreground">Top line — what the customer pays you</div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">{formatMoney(moneyMapSnapshot.revenue)}</div>
                </div>

                {/* Rung 2: Cost of Goods (Direct Job Costs) — slate */}
                <div
                  onClick={() => setHighlightedBucket('direct')}
                  className="cursor-pointer rounded-xl border p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                  style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}
                >
                  <div>
                    <div className="font-semibold" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>2. Cost of Goods (Direct Job Costs)</div>
                    <div className="text-xs" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>Obvious job costs you see in the Pricer (L+E+M)</div>
                  </div>
                  <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{formatMoney(moneyMapSnapshot.directCogs)} <span className="text-xs">({moneyMapSnapshot.directPercent}%)</span></div>
                </div>

                {/* Rung 3: Indirect Cost of Goods (Hidden Job Costs) — brand maroon, the killer */}
                <div
                  onClick={() => setHighlightedBucket('indirect')}
                  className="cursor-pointer rounded-xl border-2 p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                  style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}
                >
                  <div>
                    <div className="font-semibold flex items-center gap-1.5" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>
                      3. Indirect Cost of Goods (Hidden Job Costs) <span className="text-[10px] px-1.5 py-0 rounded text-white font-medium" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].fg }}>SILENT KILLER</span>
                    </div>
                    <div className="text-xs" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>The hidden bucket: labor burden, shop supplies, small tools, untracked mobilization, admin creep, etc.</div>
                  </div>
                  <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>{formatMoney(moneyMapSnapshot.indirectCogs)} <span className="text-xs">({moneyMapSnapshot.indirectPercent}%)</span></div>
                </div>

                {/* Rung 4: Gross Profit — neutral (green reserved for kept money) */}
                <div
                  onClick={() => setHighlightedBucket('gross')}
                  className="cursor-pointer rounded-xl border bg-muted/40 p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                >
                  <div>
                    <div className="font-semibold">4. Gross Profit (Left After the Work)</div>
                    <div className="text-xs text-muted-foreground">What’s left after all job costs (Direct + Indirect COGS)</div>
                  </div>
                  <div className="text-right text-sm tabular-nums">{formatMoney(moneyMapSnapshot.grossProfit)} <span className="text-xs">({moneyMapSnapshot.grossPercent}%)</span></div>
                </div>

                {/* Rung 5: Overhead (Running the Business) — indigo */}
                <div
                  onClick={() => setHighlightedBucket('overhead')}
                  className="cursor-pointer rounded-xl border p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                  style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}
                >
                  <div>
                    <div className="font-semibold" style={{ color: BUCKET_COLORS["Overhead"].fg }}>5. Overhead (Running the Business)</div>
                    <div className="text-xs" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Fixed cost of running the business (see Overhead &amp; Profit pillar)</div>
                  </div>
                  <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(moneyMapSnapshot.overhead)} <span className="text-xs">({moneyMapSnapshot.overheadPercent}%)</span></div>
                </div>

                {/* Rung 6: Net Profit — green (kept money) */}
                <div
                  onClick={() => setHighlightedBucket('net')}
                  className="cursor-pointer rounded-xl border-2 p-4 flex items-center justify-between hover:shadow-sm transition"
                  style={{ backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}
                >
                  <div>
                    <div className="font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>6. Net Profit (What You Keep)</div>
                    <div className="text-xs" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>True owner profit after everything. The culture goal.</div>
                  </div>
                  <div className="text-right text-sm tabular-nums font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{formatMoney(moneyMapSnapshot.netProfit)} <span className="text-xs">({moneyMapSnapshot.netPercent}%)</span></div>
                </div>
              </div>

              {/* Subtle interactivity explain box */}
              {highlightedBucket && (
                <div className="mx-auto max-w-lg rounded-lg border bg-muted/60 p-4 text-sm">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <div>
                      {highlightedBucket === 'revenue' && "Revenue is the top line from your Project Pricer bid items total."}
                      {highlightedBucket === 'direct' && "Cost of Goods (Direct Job Costs) = the Labor + Equipment + Material costs you actively build in the Full Real LEM section of the Project Pricer."}
                      {highlightedBucket === 'indirect' && "Indirect Cost of Goods (Hidden Job Costs) hides in: labor burden rates (beyond base pay), shop supplies, small tools, unbillable time, mobilization “extras”, fuel surcharges not passed through, etc. It’s a subset of Cost of Goods — it rolls up to COGS on the P&L, but PMZ teaches the breakout. These rarely appear explicitly in your LEM table but destroy your target margin. This is the bucket the Money Map exists to kill."}
                      {highlightedBucket === 'gross' && "Gross Profit = Revenue minus (Direct + Indirect COGS). This is the number the Project Pricer’s Gross Profit % field is trying to protect."}
                      {highlightedBucket === 'overhead' && "Overhead (Running the Business) = fixed business costs (insurance, shop rent, admin salaries, etc.). Managed in the Overhead &amp; Profit pillar."}
                      {highlightedBucket === 'net' && "Net Profit = Gross minus Overhead. This is the true owner take-home. Everything else is just moving money between buckets."}
                    </div>
                  </div>
                  <button className="mt-2 text-xs text-muted-foreground underline" onClick={() => setHighlightedBucket(null)}>clear highlight</button>
                </div>
              )}

              {/* Decision tree */}
              <div className="pt-2">
                <div className="text-sm font-semibold mb-2">Which bucket? Ask a question</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div
                    onClick={() => setHighlightedBucket('direct')}
                    className="cursor-pointer rounded-lg border p-3 transition hover:shadow-sm"
                    style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}
                  >
                    <div className="font-medium" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>Cost of Goods (Direct Job Costs)</div>
                    <div className="text-xs mt-0.5" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>The obvious L+E+M you control per job in the Project Pricer Real LEM.</div>
                  </div>
                  <div
                    onClick={() => setHighlightedBucket('indirect')}
                    className="cursor-pointer rounded-lg border-2 p-3 transition hover:shadow-sm"
                    style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}
                  >
                    <div className="font-medium" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>Indirect Cost of Goods (Hidden Job Costs) <span className="text-[10px] align-super">(the killer)</span></div>
                    <div className="text-xs mt-0.5" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>Burden, supplies, unbillable, hidden mobilization. Where your margin quietly disappears.</div>
                  </div>
                  <div
                    onClick={() => setHighlightedBucket('overhead')}
                    className="cursor-pointer rounded-lg border p-3 transition hover:shadow-sm"
                    style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}
                  >
                    <div className="font-medium" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Overhead (Running the Business)</div>
                    <div className="text-xs mt-0.5" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Fixed cost of running the business. See the Overhead &amp; Profit tool for details.</div>
                  </div>
                </div>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">Click any bucket above (or in the ladder) for a quick explanation of where it lives in your Project Pricer workflow.</p>
              </div>

              {/* Mini glossary / culture note */}
              <div className="text-[11px] text-muted-foreground border-t pt-4">
                <strong>Quick Glossary:</strong> Cost of Goods (Direct Job Costs) = job-visible costs in LEM. Indirect Cost of Goods (Hidden Job Costs) = the invisible tax on every job — a subset of Cost of Goods that rolls up to COGS on the P&amp;L, but PMZ teaches the breakout. Overhead (Running the Business) = the price of being in business. Net Profit = the only number that pays the owner. The culture is to shrink Indirect Cost of Goods (Hidden Job Costs) first — it’s the fastest lever most contractors have.
              </div>
            </div>

            <div className="border-t bg-muted/30 px-6 py-3 text-xs flex items-center justify-between text-muted-foreground">
              <div>Close this anytime — it’s here to build the habit, not slow you down.</div>
              <Button size="sm" variant="outline" onClick={() => { setShowMoneyMap(false); setHighlightedBucket(null); }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
