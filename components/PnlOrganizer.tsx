"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { BUCKET_COLORS, COUNTDOWN_UNCOVERED } from "@/lib/pmz-types";
import {
  loadWorksheet,
  saveWorksheet,
  computeSummary,
  bucketTotal,
  newLine,
  type PnlWorksheet,
  type PnlBucket,
} from "@/lib/pnl-worksheet";

const BUCKETS: { key: PnlBucket; title: string; hint: string }[] = [
  {
    key: "Direct COGS",
    title: "Cost of Goods (Direct Job Costs)",
    hint: "Materials, labor, and equipment that go straight into the job.",
  },
  {
    key: "Indirect COGS",
    title: "Indirect Cost of Goods (Hidden Job Costs)",
    hint: "The silent killers — supervision, small tools, unbillable time.",
  },
  {
    key: "Overhead",
    title: "Overhead (Running the Business)",
    hint: "Office, rent, insurance, admin — costs you whether or not you have a job.",
  },
];

export function PnlOrganizer({ onRequestApply }: { onRequestApply?: (ws: PnlWorksheet) => void } = {}) {
  // Start empty (deterministic) for SSR/first render; load the saved worksheet after mount.
  const [ws, setWs] = React.useState<PnlWorksheet>({ revenue: 0, lines: [] });
  const loaded = React.useRef(false);

  React.useEffect(() => {
    setWs(loadWorksheet());
    loaded.current = true;
  }, []);

  React.useEffect(() => {
    if (loaded.current) saveWorksheet(ws);
  }, [ws]);

  const summary = React.useMemo(() => computeSummary(ws), [ws]);

  const setRevenue = (v: number) => setWs((p) => ({ ...p, revenue: Math.max(0, v) }));
  const addLine = (bucket: PnlBucket) => setWs((p) => ({ ...p, lines: [...p.lines, newLine(bucket)] }));
  const removeLine = (id: string) => setWs((p) => ({ ...p, lines: p.lines.filter((l) => l.id !== id) }));
  const setLabel = (id: string, label: string) =>
    setWs((p) => ({ ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, label } : l)) }));
  const setAmount = (id: string, amount: number) =>
    setWs((p) => ({ ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, amount: Math.max(0, amount) } : l)) }));
  const toggleBehavior = (id: string) =>
    setWs((p) => ({
      ...p,
      lines: p.lines.map((l) =>
        l.id === id ? { ...l, behavior: l.behavior === "Fixed" ? "Variable" : "Fixed" } : l
      ),
    }));

  return (
    <Card className="card">
      <CardHeader>
        <CardTitle className="text-xl">P&amp;L Organizer</CardTitle>
        <CardDescription>
          Type the Profit &amp; Loss numbers below. We reorganize them into your true numbers as you go —
          your accounting program is never touched.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revenue — the top line (not one of the three cost buckets) */}
        <div className="max-w-xs">
          <Label className="text-sm font-medium">Revenue (money in)</Label>
          <CurrencyInput value={ws.revenue} onChange={setRevenue} className="mt-1.5 font-semibold" />
        </div>

        {/* Three cost buckets */}
        {BUCKETS.map((b) => {
          const lines = ws.lines.filter((l) => l.bucket === b.key);
          return (
            <div key={b.key} className="rounded-xl border p-4" style={{ borderColor: BUCKET_COLORS[b.key].border }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold" style={{ color: BUCKET_COLORS[b.key].fg }}>{b.title}</div>
                  <div className="text-xs text-muted-foreground">{b.hint}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">Subtotal</div>
                  <div className="text-lg font-semibold tabular-nums" style={{ color: BUCKET_COLORS[b.key].fg }}>{formatMoney(bucketTotal(ws, b.key))}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleBehavior(l.id)}
                      title={
                        l.behavior === "Fixed"
                          ? "Fixed: costs you whether you do a dollar of work or a million. Click to change."
                          : "Variable: no work, no cost. Click to change."
                      }
                      aria-label={`Cost type: ${l.behavior}. Click to toggle.`}
                      className={cn(
                        "shrink-0 grid place-items-center w-6 h-6 rounded text-xs font-bold border transition-colors",
                        l.behavior === "Fixed"
                          ? "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                          : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                      )}
                    >
                      {l.behavior === "Fixed" ? "F" : "V"}
                    </button>
                    <Input
                      value={l.label}
                      onChange={(e) => setLabel(l.id, e.target.value)}
                      placeholder="Line name (e.g. Rent)"
                      className="flex-1"
                    />
                    <CurrencyInput
                      value={l.amount}
                      onChange={(v) => setAmount(l.id, v)}
                      wrapperClassName="h-9 w-36 shrink-0"
                      className="text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeLine(l.id)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addLine(b.key)}>
                  <Plus className="mr-2 h-4 w-4" /> Add line
                </Button>
              </div>
            </div>
          );
        })}

        {/* Fixed/Variable legend — plain-language definitions live in the UI */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            <span className="font-bold text-foreground">F</span> Fixed — costs you whether you do a dollar of work or a million
          </span>
          <span>
            <span className="font-bold text-primary">V</span> Variable — no work, no cost
          </span>
        </div>

        {/* The five true numbers — headline output */}
        <div className="rounded-xl border bg-surface-2 p-5">
          <div className="text-sm font-semibold tracking-wider text-muted-foreground mb-3">THE FIVE TRUE NUMBERS</div>
          <div className="divide-y divide-border/60">
            <SummaryRow label="Money in (Revenue)" value={summary.revenue} />
            <SummaryRow label="What the work cost (Cost of Goods)" value={summary.costOfGoods} />
            <SummaryRow label="Left after the work (Gross Profit)" value={summary.grossProfit} />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Running the Business (Overhead)</span>
              <span className="text-lg font-semibold tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(summary.overhead)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium">What you actually keep (Net Profit)</span>
              <span
                className={cn("text-xl font-bold tabular-nums", summary.netProfit < 0 && "text-destructive")}
                style={summary.netProfit >= 0 ? { color: BUCKET_COLORS["Net Profit"].fg } : undefined}
              >
                {formatMoney(summary.netProfit)}
              </span>
            </div>
          </div>

          {/* Overhead Recovery Countdown — three states, computed from the live five numbers.
              Empty (no overhead entered): NEUTRAL/muted — green must be EARNED, never shown on a
              blank slate. Short: amber warning (COUNTDOWN_UNCOVERED). Covered: green (Net Profit). */}
          {(() => {
            // No real overhead yet → neutral prompt, short-circuit before any green/amber verdict.
            if (summary.overhead <= 0) {
              return (
                <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold tracking-wider text-muted-foreground">
                    OVERHEAD RECOVERY COUNTDOWN
                  </div>
                  <div className="mt-1 text-lg font-medium text-muted-foreground">
                    Enter your overhead to start the countdown.
                  </div>
                </div>
              );
            }
            const covered = summary.overheadRemaining <= 0;
            const tone = covered ? BUCKET_COLORS["Net Profit"] : COUNTDOWN_UNCOVERED;
            return (
              <div
                className="mt-4 rounded-lg border p-4"
                style={{ borderColor: tone.border, backgroundColor: tone.bg }}
              >
                <div className="text-xs font-semibold tracking-wider" style={{ color: tone.fg }}>
                  OVERHEAD RECOVERY COUNTDOWN
                </div>
                <div className="mt-1 text-lg font-bold" style={{ color: tone.fg }}>
                  {covered ? (
                    "Overhead covered — every dollar after this is profit."
                  ) : (
                    <>You need <span className="tabular-nums">{formatMoney(summary.overheadRemaining)}</span> more to cover overhead.</>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Overhead handoff (F2 Step 2) — one-way, explicit. Disabled until there's real overhead
            to apply, so an empty Organizer can never wipe a real Overhead chart. */}
        {onRequestApply && (() => {
          const overheadTotal = bucketTotal(ws, "Overhead");
          const canApply = overheadTotal > 0;
          return (
            <div className="rounded-xl border bg-surface-2 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">Send your overhead to the Overhead chart</div>
                  <div className="text-xs text-muted-foreground">
                    {canApply
                      ? <>Replaces the chart’s overhead lines with these ({formatMoney(overheadTotal)}). You’ll confirm first.</>
                      : "Add overhead lines above to enable this — an empty Organizer can’t replace your chart."}
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!canApply}
                  onClick={() => onRequestApply(ws)}
                  className="shrink-0"
                >
                  Use these as my Overhead chart
                </Button>
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}
