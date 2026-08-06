"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Lock } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { selectOnFocusProps } from "@/lib/select-on-focus";
import { changeOrderTotalCost, type ChangeOrder } from "@/lib/change-orders";

/**
 * FOREMAN CHANGE ORDERS — the on-the-spot lane's screen, over the fence-proved math in
 * lib/change-orders.ts. Display only: this file computes no price and decides no status.
 *
 * ── THE HARD WALL ─────────────────────────────────────────────────────────────────────────────────
 * NO MARGIN PERCENTAGE APPEARS ANYWHERE ON THIS SCREEN. The foreman sees the COSTS they entered and
 * the PRICE to quote — never the relationship between them (COMPANY-ROSTER-AND-ROLES.md: "adds
 * resources to jobs and change orders. Never sets or sees margin").
 *
 * That wall is STRUCTURAL, not a promise kept by careful JSX: this component never receives the
 * margin. It is handed `computePrice(totalCost)`, a function the parent closes the margin over. There
 * is no margin in these props to leak, so no future edit here can leak one. If you ever find yourself
 * adding a `marginPct` prop, that is the wall coming down — price the number in the parent instead.
 *
 * The price is also READ-ONLY (Law 56, no second price path): it is rendered, never an input.
 */

export interface JobChangeOrdersProps {
  changeOrders: ChangeOrder[];
  /** Active roster people holding the foreman role. Attribution is PICKED, never typed. */
  foremen: Array<{ id: string; name: string }>;
  /** Owner-set on-the-spot ceiling, in dollars of COST. */
  ceiling: number;
  /** The parent's frozen margin lives in HERE, in the caller's closure — never in this component. */
  computePrice: (totalCost: number) => number;
  /** False when this job can't price a change order; `blockedReason` says why, in plain words. */
  canAdd: boolean;
  blockedReason?: string;
  /** Job is completed — the lane is closed. */
  locked?: boolean;
  onCreate: (input: {
    foremanId: string;
    lines: Array<{ description: string; qty: number; rate: number }>;
  }) => void;
  /** Roster name for an id, for the origin stamp. */
  personName: (id: string) => string;
}

interface DraftLine {
  key: string;
  description: string;
  qty: string;   // held as text so a foreman can type "1." and "0.5" without the field fighting them
  rate: string;
}

const blankLine = (): DraftLine => ({
  key: Math.random().toString(36).slice(2, 9),
  description: "",
  qty: "",
  rate: "",
});

const num = (s: string): number => {
  const n = parseFloat((s || "").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const stampDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

export default function JobChangeOrders({
  changeOrders,
  foremen,
  ceiling,
  computePrice,
  canAdd,
  blockedReason,
  locked,
  onCreate,
  personName,
}: JobChangeOrdersProps) {
  const [open, setOpen] = React.useState(false);
  const [foremanId, setForemanId] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([blankLine()]);

  const parsedLines = lines.map((l) => ({
    description: l.description.trim(),
    qty: num(l.qty),
    rate: num(l.rate),
  }));
  const totalCost = changeOrderTotalCost(parsedLines);
  const price = computePrice(totalCost);
  // The SAME comparison the record's status uses (lib/change-orders.ts) — at or under is inside the
  // foreman's authority. Shown live so the wording never surprises anyone at the moment they save.
  const withinCeiling = totalCost <= ceiling;
  const hasWork = parsedLines.some((l) => l.description !== "" || l.qty > 0 || l.rate > 0);
  const canSave = !!foremanId && hasWork && totalCost > 0;

  function reset() {
    setOpen(false);
    setForemanId("");
    setLines([blankLine()]);
  }

  function save() {
    if (!canSave) return;
    onCreate({
      foremanId,
      lines: parsedLines.filter((l) => l.description !== "" || l.qty > 0 || l.rate > 0),
    });
    reset();
  }

  return (
    <div className="mt-6 wo-noprint">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium tracking-wider text-muted-foreground">CHANGE ORDERS</div>
        {!open && !locked && canAdd && (
          <Button size="sm" variant="outline" className="px-2 text-xs" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Change Order
          </Button>
        )}
      </div>

      {/* A job that cannot price a change order says so plainly rather than offering a dead button. */}
      {!canAdd && !locked && (
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {blockedReason || "This job can’t take a change order."}
        </div>
      )}
      {locked && (
        <div className="flex items-center gap-1.5 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Job is completed — no new change orders.
        </div>
      )}

      {open && (
        <div className="rounded-lg border bg-white p-3 text-xs" style={{ borderColor: "#7D1424" }}>
          {/* WHO. Picked from the roster, never typed — beta builds attribution, not logins. */}
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Foreman <span className="text-[#EB3300]">required</span>
            </div>
            <select
              value={foremanId}
              onChange={(e) => setForemanId(e.target.value)}
              aria-label="Foreman"
              className="mt-1 h-8 w-full max-w-xs rounded border bg-white px-2 text-sm"
              style={{ borderColor: "#7D1424", color: "#333333" }}
            >
              <option value="">Select the foreman…</option>
              {foremen.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {foremen.length === 0 && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Nobody on the roster holds the foreman role yet — add one in Company Setup → Company Roster.
              </div>
            )}
          </div>

          {/* WHAT IT TOOK. Resources only — the foreman enters costs and nothing else. */}
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            What it took — description, quantity, and your cost per unit
          </div>
          <div className="mt-1 space-y-1.5">
            {lines.map((l, i) => {
              const cost = Math.round(num(l.qty) * num(l.rate) * 100) / 100;
              return (
                <div key={l.key} className="grid grid-cols-[1fr_5rem_6rem_6rem_1.75rem] items-center gap-1.5">
                  <Input
                    value={l.description}
                    onChange={(e) =>
                      setLines((prev) => prev.map((p, j) => (j === i ? { ...p, description: e.target.value } : p)))
                    }
                    placeholder="e.g. Extra base course"
                    className="h-8 text-sm"
                  />
                  <Input
                    {...selectOnFocusProps}
                    value={l.qty}
                    onChange={(e) => setLines((prev) => prev.map((p, j) => (j === i ? { ...p, qty: e.target.value } : p)))}
                    inputMode="decimal"
                    placeholder="Qty"
                    className="h-8 text-right text-sm"
                  />
                  <Input
                    {...selectOnFocusProps}
                    value={l.rate}
                    onChange={(e) => setLines((prev) => prev.map((p, j) => (j === i ? { ...p, rate: e.target.value } : p)))}
                    inputMode="decimal"
                    placeholder="Cost/unit"
                    className="h-8 text-right text-sm"
                  />
                  <div className="text-right tabular-nums text-sm">{formatMoney(cost)}</div>
                  <button
                    type="button"
                    aria-label="Remove line"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-6 px-1 text-xs"
            onClick={() => setLines((prev) => [...prev, blankLine()])}
          >
            <Plus className="mr-1 h-3 w-3" /> Add line
          </Button>

          {/* THE TWO NUMBERS THE FOREMAN SEES: what it cost, and what to quote. Never the step between. */}
          <div className="mt-3 space-y-1 border-t pt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Your cost</span>
              <span className="tabular-nums font-medium">{formatMoney(totalCost)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Price to the customer</span>
              <span className="tabular-nums text-base font-semibold" style={{ color: "#7D1424" }}>
                {formatMoney(price)}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Priced automatically from this job’s original bid. You don’t set this number.
            </div>
          </div>

          {/* THE CEILING, IN PLAIN SENTENCES. Same price either way — only the authority differs. */}
          {totalCost > 0 && (
            <div
              className="mt-2 rounded-md border p-2"
              style={
                withinCeiling
                  ? { borderColor: "#047857", color: "#065F46", backgroundColor: "#ECFDF5" }
                  : { borderColor: "#B45309", color: "#78350F", backgroundColor: "#FFFBEB" }
              }
            >
              {withinCeiling ? (
                <div className="font-medium">Quote this price to the customer: {formatMoney(price)}</div>
              ) : (
                <>
                  <div className="font-medium">Over the {formatMoney(ceiling)} on-the-spot limit.</div>
                  <div className="mt-0.5">
                    Saved and waiting for approval — check with the salesperson or boss before quoting.
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="h-7 px-2 text-xs font-semibold text-white"
              style={{ backgroundColor: "#EB3300" }}
              disabled={!canSave}
              onClick={save}
            >
              {withinCeiling ? "Save & quote this price" : "Save for approval"}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={reset}>
              Cancel
            </Button>
            {!foremanId && <span className="text-[11px] text-muted-foreground">Pick the foreman first.</span>}
            {foremanId && !canSave && (
              <span className="text-[11px] text-muted-foreground">Enter at least one resource with a quantity and a cost.</span>
            )}
          </div>
        </div>
      )}

      {/* THE LIST. Additive only in this pass — a priced change order is never edited here. */}
      {changeOrders.length > 0 && (
        <div className="mt-2 space-y-2">
          {changeOrders.map((co) => (
            <div key={co.id} className="rounded-lg border bg-muted/10 p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* THE ORIGIN STAMP, IN PLAIN WORDS. These extras are typically high-margin work and
                    must stay LABELED in history — never blending invisibly into year-end (Law 5). */}
                <div className="text-muted-foreground">
                  Added by <span className="font-medium text-foreground">{personName(co.foremanId)}</span>
                  {" — "}{stampDate(co.createdAt)}
                  {co.autoPriced ? ", auto-priced" : ""}
                </div>
                {co.status === "quoted" ? (
                  <Badge variant="outline" className="border-emerald-500 text-emerald-700 text-[10px]">Quoted</Badge>
                ) : co.status === "pending_approval" ? (
                  <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">Waiting for approval</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] capitalize">{co.status}</Badge>
                )}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {co.lines.map((l) => (
                  <div key={l.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">
                      {l.description || "Resource"}
                      <span className="ml-1 text-muted-foreground">
                        {l.qty} × {formatMoney(l.rate)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(l.cost)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-baseline justify-between border-t pt-1.5">
                <span className="text-muted-foreground">Cost {formatMoney(co.totalCost)}</span>
                <span className="tabular-nums font-semibold" style={{ color: "#7D1424" }}>
                  Price {formatMoney(co.priceCharged)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
