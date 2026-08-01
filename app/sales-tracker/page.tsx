"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScorecardView } from "@/components/ScorecardView";
import { usePeople } from "@/lib/people";
import { loadJobs, jobActualCost, type Job } from "@/lib/jobs";
import type { SavedQuote } from "@/lib/pmz-types";
import {
  deriveTrackerRows,
  computeScoreboard,
  type TrackerRow,
  type TrackerBucket,
  type ScoreboardStats,
} from "@/lib/sales-tracker";

// Formatting — the page renders; all math lives in lib/sales-tracker.ts.
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const rate = (n: number) => `${((n || 0) * 100).toFixed(1)}%`; // n is a 0..1 ratio
const pct = (n: number) => `${(n || 0).toFixed(1)}%`;          // n is already a percent
const dateOf = (iso: string) => (iso ? new Date(iso).toLocaleDateString() : "—");

const BUCKET_LABEL: Record<TrackerBucket, string> = { BID: "Bid", ACCEPTED: "Accepted", LOST: "Lost" };

function BucketBadge({ bucket }: { bucket: TrackerBucket }) {
  if (bucket === "ACCEPTED") return <Badge className="border-primary/30 bg-primary/10 text-primary">Accepted</Badge>;
  if (bucket === "LOST") return <Badge variant="secondary">Lost</Badge>;
  return <Badge variant="outline">Bid</Badge>;
}

export default function SalesTrackerPage() {
  const { people } = usePeople();
  const [quotes, setQuotes] = React.useState<SavedQuote[]>([]);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [wtFilter, setWtFilter] = React.useState<string>("all");
  const [bucketFilter, setBucketFilter] = React.useState<string>("all");

  // Client-only load (localStorage), refreshed on cross-surface writes. Never read during render (SSR).
  React.useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem("pmz_saved_quotes");
        setQuotes(raw ? (JSON.parse(raw) as SavedQuote[]) : []);
      } catch {
        setQuotes([]);
      }
      setJobs(loadJobs());
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pmz_saved_quotes" || e.key === "pmz_jobs_v1") load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The quote→job link is job.quoteId. RULING (see lib/sales-tracker.ts): actuals come from the JOB
  // (Law 9), recognized only at Invoiced+. Here we join each quote to its job and pass the job's actual
  // COST (and whether it's complete) in; deriveTrackerRows applies the recognition + GP rule. No linked
  // job ⇒ no cost data ⇒ GP blank (revenue still recognized at Invoiced+ from the frozen bid).
  const jobByQuoteId = React.useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) if (j.quoteId) m.set(j.quoteId, j);
    return m;
  }, [jobs]);

  const rows: TrackerRow[] = React.useMemo(() => {
    const inputs = quotes.map((q) => {
      const job = jobByQuoteId.get(q.id);
      if (!job) return q;
      const { cost, complete } = jobActualCost(job);
      return { ...q, actualCost: cost, actualCostComplete: complete };
    });
    return deriveTrackerRows(inputs, people);
  }, [quotes, people, jobByQuoteId]);
  const scoreboard = React.useMemo(() => computeScoreboard(rows), [rows]);

  // How many rows have an existing linked job — surfaces the "actuals pending" reality honestly.
  const linkedJobCount = React.useMemo(
    () => rows.filter((r) => jobByQuoteId.has(r.quoteId)).length,
    [rows, jobByQuoteId]
  );

  const workTypeOptions = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.workType))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filteredRows = React.useMemo(
    () =>
      rows.filter(
        (r) => (wtFilter === "all" || r.workType === wtFilter) && (bucketFilter === "all" || r.bucket === bucketFilter)
      ),
    [rows, wtFilter, bucketFilter]
  );

  const scoreboardRows: Array<{ label: string; stats: ScoreboardStats }> = [
    ...Object.keys(scoreboard.byWorkType)
      .sort((a, b) => a.localeCompare(b))
      .map((wt) => ({ label: wt, stats: scoreboard.byWorkType[wt] })),
    { label: "All work types", stats: scoreboard.all },
  ];

  return (
    <div className="max-w-7xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
          <BarChart3 className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Sales Tracker</h1>
          <p className="mt-1 text-muted-foreground">
            A view, not a ledger — every row derives from a saved quote. Drafts never appear.
          </p>
        </div>
      </div>

      <Tabs defaultValue="bids" className="w-full">
        <TabsList>
          <TabsTrigger value="bids">Bids &amp; Jobs</TabsTrigger>
          <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
        </TabsList>

        {/* Bids & Jobs — the tracker rows + scoreboard (acceptance rates live here, not on the Scorecard) */}
        <TabsContent value="bids" className="space-y-8">
          {rows.length === 0 ? (
            <Card className="card">
              <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
                <p className="text-lg font-medium">Your tracker builds itself as you save and send bids.</p>
                <p className="text-sm text-muted-foreground">Draft quotes stay invisible here until they&rsquo;re sent.</p>
              </CardContent>
            </Card>
          ) : (
            <>
          {/* Scoreboard first */}
          <Card className="card">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Scoreboard</CardTitle>
              <CardDescription>
                Win rate is decided-only (won ÷ won+lost); outstanding bids are reported alongside, never
                dragging the rate down.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Type</TableHead>
                      <TableHead className="text-right">Win % ($)</TableHead>
                      <TableHead className="text-right">Win % (count)</TableHead>
                      <TableHead className="text-right">Won (count / $)</TableHead>
                      <TableHead className="text-right">Lost (count / $)</TableHead>
                      <TableHead className="text-right">Outstanding bids (count / $)</TableHead>
                      <TableHead className="text-right">Accepted GP $</TableHead>
                      <TableHead className="text-right">Blended margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scoreboardRows.map(({ label, stats }, i) => (
                      <TableRow key={label} className={i === scoreboardRows.length - 1 ? "bg-muted/50 font-semibold border-t-2" : undefined}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell className="text-right tabular-nums">{rate(stats.winRateByDollars)}</TableCell>
                        <TableCell className="text-right tabular-nums">{rate(stats.winRateByCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{stats.wonCount} / {money(stats.wonDollars)}</TableCell>
                        <TableCell className="text-right tabular-nums">{stats.lostCount} / {money(stats.lostDollars)}</TableCell>
                        <TableCell className="text-right tabular-nums">{stats.bidCount} / {money(stats.bidDollars)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(stats.acceptedGpDollars)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(stats.blendedMarginPercent)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Rows table */}
          <Card className="card">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Bids &amp; Jobs</CardTitle>
                  <CardDescription>
                    {rows.length} bid{rows.length === 1 ? "" : "s"} · {linkedJobCount} with a linked job ·
                    actuals recognized at Invoiced+ (earned facts)
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <select
                    value={wtFilter}
                    onChange={(e) => setWtFilter(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="all">All work types</option>
                    {workTypeOptions.map((wt) => (
                      <option key={wt} value={wt}>{wt}</option>
                    ))}
                  </select>
                  <select
                    value={bucketFilter}
                    onChange={(e) => setBucketFilter(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="BID">Bid</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bid Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Job Name</TableHead>
                      <TableHead>Work Type</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-right">Bid Amount</TableHead>
                      <TableHead className="text-right">GP at Bid</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actual Rev</TableHead>
                      <TableHead className="text-right">Actual GP</TableHead>
                      <TableHead>Objection</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="h-24 text-center text-sm text-muted-foreground">
                          No bids match these filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((r) => (
                        <TableRow key={r.quoteId}>
                          <TableCell className="whitespace-nowrap tabular-nums">{dateOf(r.date)}</TableCell>
                          <TableCell className="max-w-[160px] truncate" title={r.customer}>{r.customer}</TableCell>
                          <TableCell className="max-w-[160px] truncate" title={r.jobName ?? ""}>{r.jobName ?? "—"}</TableCell>
                          <TableCell>{r.workType}</TableCell>
                          <TableCell className={r.salesperson === "—" ? "text-muted-foreground" : undefined}>{r.salesperson}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.bidAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.gpAtBid)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(r.margin)}</TableCell>
                          <TableCell><BucketBadge bucket={r.bucket} /></TableCell>
                          <TableCell className="text-right tabular-nums">{r.actuals ? money(r.actuals.revenue) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.actuals && r.actuals.gpDollars != null ? money(r.actuals.gpDollars) : "—"}</TableCell>
                          <TableCell className="max-w-[140px] truncate text-muted-foreground" title={r.objection ?? ""}>{r.objection ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </TabsContent>

        {/* Scorecard — goals vs booked actuals, its own view (separate from the tracker rows) */}
        <TabsContent value="scorecard">
          <ScorecardView rows={rows} people={people} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
