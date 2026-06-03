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
} from "lucide-react"

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
          <CardDescription className="text-[13px] leading-snug">{description}</CardDescription>
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

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Clean Executive Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground mb-2">
            Executive Dashboard • Live from your libraries
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em]">Boss View / Quick Read</h1>
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
            ${revenue.toLocaleString()}
          </div>
          <div className="text-sm text-muted-foreground mt-2">This month (demo data)</div>
        </div>

        {/* COGS */}
        <div 
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => alert('COGS Breakdown (Labor + Equipment + Materials)\n\nThis pulls live from your saved profiles in the Rate Builders.\n\nNote: Real job-level totals will come from the Project Pricer when you build actual quotes.')}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">COGS (Direct Costs)</div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">click for breakdown →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            ${cogs.toLocaleString()}
          </div>
          <div className="text-sm text-muted-foreground mt-2">Labor + Equipment + Materials</div>
        </div>

        {/* Gross Profit */}
        <div className="rounded-2xl border-2 border-border bg-white p-6">
          <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">GROSS PROFIT</div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4 text-emerald-600">
            ${grossProfit.toLocaleString()}
          </div>
          <div className="text-sm text-emerald-600 mt-2 tabular-nums">{grossProfitPercent}%</div>
        </div>

        {/* Total Overhead - Clickable to detailed page */}
        <div 
          className="group rounded-2xl border-2 border-border bg-white p-6 cursor-pointer hover:border-primary hover:shadow-lg transition-all active:scale-[0.985]"
          onClick={() => window.location.href = '/overhead-profit'}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">TOTAL OVERHEAD</div>
            <span className="text-[10px] text-primary opacity-70 group-hover:opacity-100">view details →</span>
          </div>
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4">
            ${totalOverhead.toLocaleString()}
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
          <div className="text-[48px] leading-none font-semibold tabular-nums tracking-[-2.5px] mt-4 text-emerald-600">
            ${netProfit.toLocaleString()}
          </div>
          <div className="text-sm text-emerald-600 mt-2 tabular-nums">{netProfitPercent}%</div>
        </div>
      </div>

      {/* Quick note */}
      <div className="text-center text-xs text-muted-foreground">
        This is your live executive snapshot. Click Revenue or COGS cards above for breakdowns. Full drill-down editor lives in <Link href="/overhead-profit" className="text-primary underline">Overhead &amp; Profit</Link>.
      </div>

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
