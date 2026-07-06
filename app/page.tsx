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

export default function OverviewPage() {
  // Demo data for the executive dashboard (in real use this would come from saved profiles + overhead chart)
  const revenue = 185000
  const cogs = 112000
  const grossProfit = revenue - cogs
  const grossProfitPercent = ((grossProfit / revenue) * 100).toFixed(1)
  const totalOverhead = 28500
  const overheadPercent = ((totalOverhead / revenue) * 100).toFixed(1)
  const billableHours = 1420
  const overheadPerHour = (totalOverhead / billableHours).toFixed(2)
  const netProfit = grossProfit - totalOverhead
  const netProfitPercent = ((netProfit / revenue) * 100).toFixed(1)

  // Gate the snapshot's localStorage reads behind a post-mount flag so SSR and the first client render
  // both use the demo fallbacks above (no hydration mismatch); real values swap in after mount.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  // Money Map snapshot data — pulls live from Project Pricer (current estimate or last saved quote) when available
  const moneyMapSnapshot = useMemo(() => {
    let currentRevenue = revenue
    let currentGpPercent = parseFloat(grossProfitPercent)
    let indirectPercent = 8 // illustrative "silent killer" % from typical bids
    if (hydrated) { try {
      const estRaw = localStorage.getItem("pmz_current_estimate_v1")
      if (estRaw) {
        const est = JSON.parse(estRaw)
        if (est.bidItems && est.bidItems.length > 0) {
          currentRevenue = est.bidItems.reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0)
        }
      }
      const quotesRaw = localStorage.getItem("pmz_saved_quotes")
      if (quotesRaw) {
        const qs = JSON.parse(quotesRaw)
        if (qs.length > 0) {
          const last = qs[qs.length - 1]
          if (last.totalRevenue) currentRevenue = last.totalRevenue
          if (last.targetMargin) currentGpPercent = last.targetMargin
        }
      }
    } catch {} }
    const directCogs = Math.round(currentRevenue * 0.65)
    const indirectCogs = Math.round(currentRevenue * (indirectPercent / 100))
    const gross = Math.round(currentRevenue * (currentGpPercent / 100))
    const overhead = Math.round(currentRevenue * 0.12)
    const net = gross - overhead
    const netPct = currentRevenue > 0 ? Math.round((net / currentRevenue) * 100) : 10
    return {
      revenue: currentRevenue,
      directCogs,
      directPercent: 65,
      indirectCogs,
      indirectPercent,
      grossProfit: gross,
      grossPercent: currentGpPercent,
      overhead,
      overheadPercent: 12,
      netProfit: net,
      netPercent: netPct,
    }
  }, [revenue, grossProfitPercent, hydrated])

  const [showMoneyMap, setShowMoneyMap] = useState(false)
  const [highlightedBucket, setHighlightedBucket] = useState<string | null>(null)

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Clean Executive Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground mb-2">
            Executive Dashboard • Live from your libraries
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Boss View / Quick Read</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">Your true P&amp;L at a glance. Click any card for details.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/overhead-profit">Manage detailed overhead →</Link>
        </Button>
      </div>

      {/* The 6 Large Clickable Summary Cards - True Executive P&L Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Revenue */}
        <div 
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => alert('Revenue breakdown by Work Type would open here (demo).\n\nIn a full build this would show editable breakdown by New Construction, Renovation, Service, etc. and let you adjust allocation.')}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">REVENUE</div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">click for breakdown →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(revenue)}
          </div>
          <div className="text-sm text-muted-foreground mt-2">This month (demo data)</div>
        </div>

        {/* COGS */}
        <div 
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => alert('COGS Breakdown (Labor + Equipment + Materials)\n\nThis pulls live from your saved profiles in the Rate Builders.\n\nNote: Real job-level totals will come from the Project Pricer when you build actual quotes.')}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">Cost of Goods (COGS)</div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">click for breakdown →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(cogs)}
          </div>
          <div className="text-sm text-muted-foreground mt-2">Labor + Equipment + Materials</div>
        </div>

        {/* Gross Profit */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">GROSS PROFIT</div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(grossProfit)}
          </div>
          <div className="text-sm text-muted-foreground mt-2 tabular-nums">{grossProfitPercent}%</div>
        </div>

        {/* Total Overhead - Clickable to detailed page */}
        <div 
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => window.location.href = '/overhead-profit'}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[1.5px]" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Running the Business (Overhead)</div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">view details →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            {formatMoney(totalOverhead)}
          </div>
          <div className="text-sm text-muted-foreground mt-2 tabular-nums">{overheadPercent}% of Revenue</div>
        </div>

        {/* Overhead per Billable Hour */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">OVERHEAD PER BILLABLE HOUR</div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4 text-primary">
            ${overheadPerHour}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">Auto-calculated from Labor &amp; Equipment profiles</div>
        </div>

        {/* Net Profit */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">NET PROFIT (after Overhead)</div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>
            {formatMoney(netProfit)}
          </div>
          <div className="text-sm mt-2 tabular-nums" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{netProfitPercent}%</div>
        </div>
      </div>

      {/* Quick note */}
      <div className="text-center text-xs text-muted-foreground">
        This is your live executive snapshot. Click Revenue or COGS cards above for breakdowns. Full drill-down editor lives in <Link href="/overhead-profit" className="text-primary underline">Overhead &amp; Profit</Link>.
      </div>

      {/* NEW: PMZ Money Map — Layer 1 Quick Snapshot (always visible, at-a-glance training tool) */}
      <Card className="card border-2 border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#EB3300]" /> PMZ Money Map — Quick Snapshot
              </CardTitle>
              <CardDescription>
                How your current bid (from Project Pricer) maps to profit reality.
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
              <div className="font-medium">1. Revenue</div>
              <div className="tabular-nums font-semibold">{formatMoney(moneyMapSnapshot.revenue)}</div>
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}>
              <div className="font-medium" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>2. Direct Job Costs (Direct COGS)</div>
              <div className="tabular-nums" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{formatMoney(moneyMapSnapshot.directCogs)} <span className="text-xs">({moneyMapSnapshot.directPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border-2 px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}>
              <div>
                <span className="font-medium" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>3. Hidden Job Costs (Indirect COGS)</span>
                <span className="ml-1 text-[10px] font-semibold" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>SILENT PROFIT KILLER</span>
              </div>
              <div className="tabular-nums" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>{formatMoney(moneyMapSnapshot.indirectCogs)} <span className="text-xs">({moneyMapSnapshot.indirectPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-1.5">
              <div className="font-medium">4. Gross Profit</div>
              <div className="tabular-nums">{formatMoney(moneyMapSnapshot.grossProfit)} <span className="text-xs text-muted-foreground">({moneyMapSnapshot.grossPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}>
              <div className="font-medium" style={{ color: BUCKET_COLORS["Overhead"].fg }}>5. Running the Business (Overhead)</div>
              <div className="tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(moneyMapSnapshot.overhead)} <span className="text-xs">({moneyMapSnapshot.overheadPercent}%)</span></div>
            </div>
            <div className="flex items-center justify-between rounded border-2 px-3 py-1.5" style={{ backgroundColor: BUCKET_COLORS["Net Profit"].bg, borderColor: BUCKET_COLORS["Net Profit"].border }}>
              <div className="font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>6. Net Profit (what you keep)</div>
              <div className="tabular-nums font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>{formatMoney(moneyMapSnapshot.netProfit)} <span className="text-xs">({moneyMapSnapshot.netPercent}%)</span></div>
            </div>
          </div>

          <div className="mt-3 text-xs rounded px-3 py-2 border" style={{ color: BUCKET_COLORS["Indirect COGS"].fg, backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}>
            Your current bid is allocating <strong>{moneyMapSnapshot.indirectPercent}%</strong> to Hidden Job Costs (Indirect COGS) — the bucket that quietly kills margins.
          </div>

          <div className="mt-2 text-[10px] text-muted-foreground">
            Values pulled live from Project Pricer current bid (or demo). Click the button for the full educational ladder.
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
                <div className="text-xs uppercase tracking-[1px] text-muted-foreground mb-2 text-center">THE PROFIT LADDER (how every dollar flows)</div>

                {/* Rung 1: Revenue (neutral — not a bucket) */}
                <div
                  onClick={() => setHighlightedBucket('revenue')}
                  className="cursor-pointer rounded-xl border bg-muted/40 p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                >
                  <div>
                    <div className="font-semibold">1. Revenue</div>
                    <div className="text-xs text-muted-foreground">Top line — what the customer pays you</div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">{formatMoney(moneyMapSnapshot.revenue)}</div>
                </div>

                {/* Rung 2: Direct Job Costs (Direct COGS) — slate */}
                <div
                  onClick={() => setHighlightedBucket('direct')}
                  className="cursor-pointer rounded-xl border p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                  style={{ backgroundColor: BUCKET_COLORS["Direct COGS"].bg, borderColor: BUCKET_COLORS["Direct COGS"].border }}
                >
                  <div>
                    <div className="font-semibold" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>2. Direct Job Costs (Direct COGS)</div>
                    <div className="text-xs" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>Obvious job costs you see in the Pricer (L+E+M)</div>
                  </div>
                  <div className="text-right text-sm tabular-nums" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>{formatMoney(moneyMapSnapshot.directCogs)} <span className="text-xs">({moneyMapSnapshot.directPercent}%)</span></div>
                </div>

                {/* Rung 3: Hidden Job Costs (Indirect COGS) — brand maroon, the killer */}
                <div
                  onClick={() => setHighlightedBucket('indirect')}
                  className="cursor-pointer rounded-xl border-2 p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                  style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}
                >
                  <div>
                    <div className="font-semibold flex items-center gap-1.5" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>
                      3. Hidden Job Costs (Indirect COGS) <span className="text-[10px] px-1.5 py-0 rounded text-white font-medium" style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].fg }}>SILENT KILLER</span>
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
                    <div className="font-semibold">4. Gross Profit</div>
                    <div className="text-xs text-muted-foreground">What’s left after all job costs (Direct + Indirect COGS)</div>
                  </div>
                  <div className="text-right text-sm tabular-nums">{formatMoney(moneyMapSnapshot.grossProfit)} <span className="text-xs">({moneyMapSnapshot.grossPercent}%)</span></div>
                </div>

                {/* Rung 5: Running the Business (Overhead) — indigo */}
                <div
                  onClick={() => setHighlightedBucket('overhead')}
                  className="cursor-pointer rounded-xl border p-4 mb-1 flex items-center justify-between hover:shadow-sm transition"
                  style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}
                >
                  <div>
                    <div className="font-semibold" style={{ color: BUCKET_COLORS["Overhead"].fg }}>5. Running the Business (Overhead)</div>
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
                    <div className="font-semibold" style={{ color: BUCKET_COLORS["Net Profit"].fg }}>6. Net Profit — What You Keep</div>
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
                      {highlightedBucket === 'direct' && "Direct Job Costs (Direct COGS) = the Labor + Equipment + Material costs you actively build in the Full Real LEM section of the Project Pricer."}
                      {highlightedBucket === 'indirect' && "Hidden Job Costs (Indirect COGS) hides in: labor burden rates (beyond base pay), shop supplies, small tools, unbillable time, mobilization “extras”, fuel surcharges not passed through, etc. These rarely appear explicitly in your LEM table but destroy your target margin. This is the bucket the Money Map exists to kill."}
                      {highlightedBucket === 'gross' && "Gross Profit = Revenue minus (Direct + Indirect COGS). This is the number the Project Pricer’s Gross Profit % field is trying to protect."}
                      {highlightedBucket === 'overhead' && "Running the Business (Overhead) = fixed business costs (insurance, shop rent, admin salaries, etc.). Managed in the Overhead &amp; Profit pillar."}
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
                    <div className="font-medium" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>Direct Job Costs (Direct COGS)</div>
                    <div className="text-xs mt-0.5" style={{ color: BUCKET_COLORS["Direct COGS"].fg }}>The obvious L+E+M you control per job in the Project Pricer Real LEM.</div>
                  </div>
                  <div
                    onClick={() => setHighlightedBucket('indirect')}
                    className="cursor-pointer rounded-lg border-2 p-3 transition hover:shadow-sm"
                    style={{ backgroundColor: BUCKET_COLORS["Indirect COGS"].bg, borderColor: BUCKET_COLORS["Indirect COGS"].border }}
                  >
                    <div className="font-medium" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>Hidden Job Costs (Indirect COGS) <span className="text-[10px] align-super">(the killer)</span></div>
                    <div className="text-xs mt-0.5" style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>Burden, supplies, unbillable, hidden mobilization. Where your margin quietly disappears.</div>
                  </div>
                  <div
                    onClick={() => setHighlightedBucket('overhead')}
                    className="cursor-pointer rounded-lg border p-3 transition hover:shadow-sm"
                    style={{ backgroundColor: BUCKET_COLORS["Overhead"].bg, borderColor: BUCKET_COLORS["Overhead"].border }}
                  >
                    <div className="font-medium" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Running the Business (Overhead)</div>
                    <div className="text-xs mt-0.5" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Fixed cost of running the business. See the Overhead &amp; Profit tool for details.</div>
                  </div>
                </div>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">Click any bucket above (or in the ladder) for a quick explanation of where it lives in your Project Pricer workflow.</p>
              </div>

              {/* Mini glossary / culture note */}
              <div className="text-[11px] text-muted-foreground border-t pt-4">
                <strong>Quick Glossary:</strong> Direct Job Costs (Direct COGS) = job-visible costs in LEM. Hidden Job Costs (Indirect COGS) = the invisible tax on every job. Running the Business (Overhead) = the price of being in business. Net Profit = the only number that pays the owner. The culture is to shrink Hidden Job Costs (Indirect COGS) first — it’s the fastest lever most contractors have.
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
