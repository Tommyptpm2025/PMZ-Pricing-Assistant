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
} from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BUCKET_COLORS, STATUS_COLORS, STATUS_LABELS, NET_LOSS_COLORS, type QuoteStatus } from "@/lib/pmz-types"
import { qualifyingQuotes } from "@/lib/qualifying"
import {
  confirmedJobs,
  moneyMapForJob,
  rollupPipeline,
  type PhaseRoll,
  type PhaseJob,
} from "@/lib/pipeline"
import { MoneyMapLadderCompact, TierBadge } from "@/components/MoneyMapLadder"

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

// Realized-performance qualifying set + rollup now live in lib/qualifying (shared with the P&L
// Organizer). REALIZED_STATUSES / qualifyingQuotes are imported above — behavior unchanged.

// The Money Map populates from FOREMAN-CONFIRMED jobs: Ready to Invoice or beyond. That facts gate
// now lives in lib/pipeline (CONFIRMED_STATUSES) — the single birthplace shared with the Profit
// Pipeline — so the Map and the Pipeline can never disagree on what "confirmed" means.

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

// Money Map per-rung copy + glossary now live in components/MoneyMapLadder (shared with the Quotes
// "Analyze" modal). RUNG_INFO / GLOSSARY_TERMS were relocated there verbatim.

// Empty-state action per pipeline phase — "earned numbers only; empty states name the action".
const PHASE_EMPTY_ACTION: Record<string, string> = {
  bidding: "Build a bid in the Project Pricer.",
  production: "Win a bid to fill this.",
  ready: "Move a job to Ready to Invoice.",
  realized: "Invoice a quote to see realized revenue.",
};

// One Profit Pipeline phase row — expandable to the jobs behind its count (drill-down, Story A).
// The value carries its vocabulary-law label (bid value / contract value / Revenue) + source;
// PLANNING vs CONFIRMED is always badged. Every drilled job — both tiers — opens the one full-screen
// ladder at /analyze/[id] (Jul-17 gavel; supersedes Part A's CONFIRMED→Money-Map routing), so the
// same click yields the same shape of page regardless of job count. No row sums into another.
function PhaseRow({ ph, onAnalyze }: { ph: PhaseRoll; onAnalyze: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const empty = ph.count === 0;
  const routeJob = (id: string) => onAnalyze(id);
  const jobActionHint = "Analyze";
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={empty}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default"
        >
          {!empty && <span aria-hidden className="w-3 text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>}
          <TierBadge tier={ph.tier} />
          <span className="font-medium text-sm truncate">{ph.label}</span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{ph.count} {ph.count === 1 ? "job" : "jobs"}</span>
        </button>
        {!empty && (
          <div className="text-right shrink-0">
            <div className="tabular-nums font-semibold text-sm">{formatMoney(ph.value)}</div>
            <div className="text-[10px] text-muted-foreground">{ph.moneyLabel} · {ph.source}</div>
          </div>
        )}
      </div>
      {empty ? (
        <div className="mt-1 text-xs text-muted-foreground">{PHASE_EMPTY_ACTION[ph.key]}</div>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
            <span>Direct {formatMoney(ph.directCogs)}</span>
            <span style={{ color: BUCKET_COLORS["Indirect COGS"].fg }}>Indirect {formatMoney(ph.indirectCogs)}</span>
            <span>Gross {formatMoney(ph.gross)}</span>
          </div>
          {open && (
            <div className="mt-2 border-t pt-2 space-y-1">
              {ph.jobs.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => routeJob(j.id)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <StatusChip status={j.status} />
                    <span className="truncate">{j.name}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{formatMoney(j.value)} <span className="opacity-70">· {jobActionHint}</span></span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Canonical status chip — identical style + color to the Quotes-page status pills. Color comes only
// from STATUS_COLORS (Law 32, the single source of color truth; no new hex); label from STATUS_LABELS.
function StatusChip({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS["Draft"];
  const label = STATUS_LABELS[status as QuoteStatus] || status;
  return (
    <Badge variant="outline" title={label} className="font-medium text-xs shrink-0" style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.bg }}>
      {label}
    </Badge>
  );
}

// Dead lane — Declined / Lost. Lists its jobs; each opens the PLANNING Analyze as a failed-bid
// post-mortem (gavel 2). NEVER routes to the Money Map, and never prints the word "Revenue".
function DeadLaneRow({ dead, onAnalyze }: { dead: { count: number; jobs: PhaseJob[] }; onAnalyze: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5"><span aria-hidden className="w-3">{open ? "▾" : "▸"}</span> <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: NET_LOSS_COLORS.fg, backgroundColor: NET_LOSS_COLORS.bg, border: `1px solid ${NET_LOSS_COLORS.border}` }}>DEAD LANE</span> Declined · Lost <span className="opacity-70">— never in the pipeline</span></span>
        <span className="tabular-nums">{dead.count} {dead.count === 1 ? "job" : "jobs"}</span>
      </button>
      {open && (
        <div className="mt-1.5 border-t pt-1.5 space-y-1">
          {dead.jobs.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => onAnalyze(j.id)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 min-w-0">
                <StatusChip status={j.status} />
                <span className="truncate">{j.name}</span>
              </span>
              <span className="tabular-nums shrink-0">{formatMoney(j.value)} <span className="opacity-70">· Analyze</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

  // ── PMZ Money Map — dark until facts exist; now points at ANY confirmed job (picker) ────────
  // The Map populates ONLY from FOREMAN-CONFIRMED jobs (CONFIRMED_STATUSES, from lib/pipeline — the
  // single facts-gate birthplace). No confirmed job ⇒ confirmed:false and the render shows an empty
  // state; NO sample, NO bid pull. The picker points the lens at any confirmed job; default = the
  // latest (byte-identical to the pre-picker behavior). moneyMapForJob is the one ported allocation
  // formula (fence-guarded byte-identical): overhead = (company overhead ÷ company revenue) × job.
  const [selectedMapJobId, setSelectedMapJobId] = useState<string | null>(null)

  const mapData = useMemo(() => {
    let jobs: any[] = []
    let chart: any = null
    if (hydrated) { try {
      const quotes = JSON.parse(localStorage.getItem("pmz_saved_quotes") || "[]")
      jobs = confirmedJobs(quotes)
      const chartRaw = localStorage.getItem("pmz_overhead_chart")
      chart = chartRaw ? JSON.parse(chartRaw) : null
    } catch {} }
    return { jobs, chart }
  }, [hydrated])

  // The confirmed job the lens is pointed at: the picked one if still present, else the latest.
  const selectedMapJob = useMemo(() => {
    const jobs = mapData.jobs
    if (jobs.length === 0) return null
    if (selectedMapJobId) {
      const found = jobs.find((j) => j.id === selectedMapJobId)
      if (found) return found
    }
    return jobs[jobs.length - 1]
  }, [mapData, selectedMapJobId])

  const moneyMapSnapshot = useMemo(() => {
    const snap = moneyMapForJob(selectedMapJob || {}, mapData.chart)
    // confirmed only when a real job with revenue > 0 is in view (matches the pre-picker gate).
    const confirmed = !!selectedMapJob && snap.revenue > 0
    return { confirmed, ...snap }
  }, [selectedMapJob, mapData.chart])

  // ── Profit Pipeline — the phase accumulator. Per-phase subtotals ONLY (iron guard: no grand
  // total). Realized ties to the Boss View revenue by the same birthplace (fence-reconciled). ────
  const pipeline = useMemo(() => {
    if (!hydrated) return null
    try {
      const quotes = JSON.parse(localStorage.getItem("pmz_saved_quotes") || "[]")
      return rollupPipeline(quotes)
    } catch { return null }
  }, [hydrated])

  const router = useRouter()
  // Every drilled pipeline job — both tiers, and the dead lane — opens the one full-screen ladder at
  // /analyze/[id] (Jul-17 gavel reversing Part A's CONFIRMED→Money-Map routing). The Money Map keeps
  // its own CONFIRMED-only picker (Law 40); the drill-down no longer feeds it.
  const openAnalyze = (id: string) => router.push(`/analyze/${id}`)

  // Empty-state copy shown when no foreman-confirmed job exists yet.
  const MAP_EMPTY = "Move a job to Ready to Invoice — once your foreman confirms costs, this maps it to profit reality."

  // The Money Map's full view is the app's ONE full-screen ladder at /analyze/[id] (Call 5 Option A).
  // The old Layer-2 modal + its per-rung/glossary disclosure state were retired here; "View Full
  // Money Map" now routes to /analyze for the picked confirmed job.

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
                {moneyMapSnapshot.confirmed && <TierBadge tier="CONFIRMED" />}
              </CardTitle>
              <CardDescription>
                {moneyMapSnapshot.confirmed
                  ? "How this foreman-confirmed job maps to profit reality."
                  : "How a foreman-confirmed job maps to profit reality."}
              </CardDescription>
              {/* Job picker — point the lens at any confirmed job (default = latest). Confirmed-only:
                  the Map stays dark until a foreman-confirmed job exists, so PLANNING jobs never list here. */}
              {mapData.jobs.length > 0 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <label className="text-[11px] text-muted-foreground">Job:</label>
                  <select
                    value={selectedMapJob?.id ?? ""}
                    onChange={(e) => setSelectedMapJobId(e.target.value)}
                    className="h-7 rounded border bg-white px-2 text-xs max-w-[260px]"
                  >
                    {mapData.jobs.map((j: any, i: number) => (
                      <option key={j.id} value={j.id}>
                        {(j.jobName?.trim() || j.customerName || j.customer || "Untitled")}{i === mapData.jobs.length - 1 ? " (latest)" : ""}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground">confirmed jobs only</span>
                </div>
              )}
            </div>
            {moneyMapSnapshot.confirmed && selectedMapJob && (
              <Button asChild size="sm">
                <Link href={`/analyze/${selectedMapJob.id}`}>View Full Money Map</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!moneyMapSnapshot.confirmed ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
              <div className="text-sm font-medium text-muted-foreground">{MAP_EMPTY}</div>
            </div>
          ) : (
          <>
          {/* Compact 6-rung ladder (shared component — identical to the Analyze modal) */}
          <MoneyMapLadderCompact snap={moneyMapSnapshot} />

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

      {/* PMZ Profit Pipeline — capacity + pricing-power view. Per-phase subtotals ONLY (iron guard:
          no grand total). PLANNING (bid / contract value) and CONFIRMED (Revenue) never share a total. */}
      <Card className="card border-2 border-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Profit Pipeline
          </CardTitle>
          <CardDescription>
            Every saved job by phase — your capacity at a glance. A full pipeline is pricing power:
            price the next bid at a higher margin instead of giving work away and taxing the crews.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {!pipeline ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Save a job in the Project Pricer to start filling the pipeline.
            </div>
          ) : (
            <>
              {pipeline.phases.map((ph) => (
                <PhaseRow key={ph.key} ph={ph} onAnalyze={openAnalyze} />
              ))}
              {pipeline.dead.count > 0 && (
                <DeadLaneRow dead={pipeline.dead} onAnalyze={openAnalyze} />
              )}
              <p className="text-[10px] text-muted-foreground pt-1 leading-snug">
                Per-phase subtotals only — no grand total. “Revenue” means Ready-to-Invoice or beyond;
                earlier phases are bid / contract value. The Invoiced · Paid · Completed row ties to your Boss View revenue.
              </p>
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

    </div>
  )
}
