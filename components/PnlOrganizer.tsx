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

// Phase 1 unification: the Organizer is a CONTROLLED editor of the owner's overhead entry.
// Revenue and Cost of Goods are read-only (earned from invoiced quotes); the only editable
// surface is the Overhead bucket, whose lines ARE the Overhead chart's items (single door).
type CostBehavior = "Fixed" | "Variable";
export interface OverheadLine { id: string; category: string; amount: number; behavior: CostBehavior }

interface Props {
  overheadItems: OverheadLine[];
  invoiced: { revenue: number; cogs: number; directCogs: number; indirectCogs: number; count: number };
  suggestions: string[];
  onAdd: (category?: string) => void;
  onEditAmount: (id: string, amount: number) => void;
  onEditCategory: (id: string, category: string) => void;
  onToggleBehavior: (id: string) => void;
  onRemove: (id: string) => void;
}

export function PnlOrganizer({
  overheadItems, invoiced, suggestions,
  onAdd, onEditAmount, onEditCategory, onToggleBehavior, onRemove,
}: Props) {
  const [newCat, setNewCat] = React.useState("");

  const hasSales = invoiced.count > 0;
  const overhead = overheadItems.reduce((s, i) => s + (i.amount || 0), 0);
  const revenue = invoiced.revenue;
  const cogs = invoiced.cogs;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - overhead;
  const overheadRemaining = Math.max(0, overhead - grossProfit);

  // Standard categories not already used — offered as tap-to-add chips (not a fixed list).
  const openSuggestions = suggestions.filter(
    (s) => !overheadItems.some((i) => i.category.trim().toLowerCase() === s.toLowerCase())
  );

  const addTyped = () => { const n = newCat.trim(); if (n) { onAdd(n); setNewCat(""); } };

  return (
    <Card className="card">
      <CardHeader>
        <CardTitle className="text-xl">P&amp;L Organizer</CardTitle>
        <CardDescription>
          Your Revenue and Cost of Goods are earned from your invoiced quotes — you don’t type them.
          Enter your Overhead below; it flows straight to your Overhead chart and the Boss View.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revenue + COGS — read-only, earned from invoiced quotes */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-sm font-medium">Revenue (money in)</Label>
            {hasSales ? (
              <>
                <div className="mt-1.5 text-2xl font-semibold tabular-nums">{formatMoney(revenue)}</div>
                <div className="text-[11px] text-muted-foreground">from invoiced quotes</div>
              </>
            ) : (
              <div className="mt-1.5 text-sm text-muted-foreground">Invoice a quote to see this.</div>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium">Cost of Goods (COGS)</Label>
            {hasSales ? (
              <>
                <div className="mt-1.5 text-2xl font-semibold tabular-nums">{formatMoney(cogs)}</div>
                <div className="text-[11px] text-muted-foreground">from invoiced quotes · Direct {formatMoney(invoiced.directCogs)} + Indirect {formatMoney(invoiced.indirectCogs)}</div>
              </>
            ) : (
              <div className="mt-1.5 text-sm text-muted-foreground">Invoice a quote to see this.</div>
            )}
          </div>
        </div>

        {/* Overhead — the ONE thing you enter */}
        <div className="rounded-xl border p-4" style={{ borderColor: BUCKET_COLORS["Overhead"].border }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Running the Business (Overhead)</div>
              <div className="text-xs text-muted-foreground">Office, rent, insurance, admin — costs you whether or not you have a job. This is the one thing you enter.</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-muted-foreground">Subtotal</div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(overhead)}</div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {overheadItems.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleBehavior(l.id)}
                  title={l.behavior === "Fixed"
                    ? "Fixed: costs you whether you do a dollar of work or a million. Click to change."
                    : "Variable: no work, no cost. Click to change."}
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
                <Input value={l.category} onChange={(e) => onEditCategory(l.id, e.target.value)} placeholder="Line name (e.g. Rent)" className="flex-1" />
                <CurrencyInput value={l.amount} onChange={(v) => onEditAmount(l.id, v)} wrapperClassName="h-9 w-36 shrink-0" className="text-sm" />
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => onRemove(l.id)} aria-label="Remove line">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTyped(); }}
                placeholder="New overhead line (e.g. Recruiting)"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={() => (newCat.trim() ? addTyped() : onAdd())}>
                <Plus className="mr-2 h-4 w-4" /> Add line
              </Button>
            </div>
            {openSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-muted-foreground mr-1">Suggestions:</span>
                {openSuggestions.map((s) => (
                  <button key={s} type="button" onClick={() => onAdd(s)} className="text-[11px] rounded-full border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* F/V legend */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
          <span><span className="font-bold text-foreground">F</span> Fixed — costs you whether you do a dollar of work or a million</span>
          <span><span className="font-bold text-primary">V</span> Variable — no work, no cost</span>
        </div>

        {/* The five true numbers */}
        <div className="rounded-xl border bg-surface-2 p-5">
          <div className="text-sm font-semibold tracking-wider text-muted-foreground mb-3">THE FIVE TRUE NUMBERS</div>
          <div className="divide-y divide-border/60">
            <SummaryRow label="Money in (Revenue)" value={revenue} earned={hasSales} />
            <SummaryRow label="What the work cost (Cost of Goods)" value={cogs} earned={hasSales} />
            <SummaryRow label="Left after the work (Gross Profit)" value={grossProfit} earned={hasSales} />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Running the Business (Overhead)</span>
              <span className="text-lg font-semibold tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(overhead)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium">What you actually keep (Net Profit)</span>
              <span
                className={cn("text-xl font-bold tabular-nums", hasSales && netProfit < 0 && "text-destructive")}
                style={hasSales && netProfit >= 0 ? { color: BUCKET_COLORS["Net Profit"].fg } : undefined}
              >
                {hasSales ? formatMoney(netProfit) : "—"}
              </span>
            </div>
          </div>

          {/* Overhead Recovery Countdown — needs earned sales AND entered overhead */}
          {(() => {
            if (!hasSales) {
              return (
                <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold tracking-wider text-muted-foreground">OVERHEAD RECOVERY COUNTDOWN</div>
                  <div className="mt-1 text-lg font-medium text-muted-foreground">Invoice a quote to start the countdown.</div>
                </div>
              );
            }
            if (overhead <= 0) {
              return (
                <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold tracking-wider text-muted-foreground">OVERHEAD RECOVERY COUNTDOWN</div>
                  <div className="mt-1 text-lg font-medium text-muted-foreground">Enter your overhead to start the countdown.</div>
                </div>
              );
            }
            const covered = overheadRemaining <= 0;
            const tone = covered ? BUCKET_COLORS["Net Profit"] : COUNTDOWN_UNCOVERED;
            return (
              <div className="mt-4 rounded-lg border p-4" style={{ borderColor: tone.border, backgroundColor: tone.bg }}>
                <div className="text-xs font-semibold tracking-wider" style={{ color: tone.fg }}>OVERHEAD RECOVERY COUNTDOWN</div>
                <div className="mt-1 text-lg font-bold" style={{ color: tone.fg }}>
                  {covered
                    ? "Overhead covered — every dollar after this is profit."
                    : <>You need <span className="tabular-nums">{formatMoney(overheadRemaining)}</span> more to cover overhead.</>}
                </div>
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value, earned }: { label: string; value: number; earned: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{earned ? formatMoney(value) : "—"}</span>
    </div>
  );
}
