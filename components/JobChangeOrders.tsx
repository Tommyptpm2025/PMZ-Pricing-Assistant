"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Lock } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { selectOnFocusProps } from "@/lib/select-on-focus";
import { type ChangeOrder } from "@/lib/change-orders";

/**
 * FOREMAN CHANGE ORDERS — the on-the-spot lane's screen, over the fence-proved math in
 * lib/change-orders.ts. Display only: this file computes no cost, no price and no status.
 *
 * ── THE HARD WALL ─────────────────────────────────────────────────────────────────────────────────
 * THE FOREMAN PICKS RESOURCES AND QUANTITIES. HE NEVER TYPES A DOLLAR, AND HE NEVER SEES ONE except
 * the single price he is authorized to quote. Quantities are field knowledge; dollars are office
 * knowledge. That is the whole design: hours and counts are what the man on the ground actually
 * knows, and a foreman-typed cost is a guess wearing work gloves.
 *
 * The wall is STRUCTURAL, not a promise kept by careful JSX. This component receives:
 *   • a CATALOG of resources carrying only { id, name, unit } — NO rates, at all; and
 *   • `evaluate(picks)`, which hands back exactly two facts: the price to quote, and whether the
 *     picks are inside the foreman's on-the-spot authority.
 * There is no rate, no cost and no margin in these props, so no future edit to this file can leak
 * one. If you find yourself adding a `rate`, `cost` or `marginPct` prop, that is the wall coming
 * down — resolve it in the parent instead.
 *
 * The price is also READ-ONLY (Law 56, no second price path): it is rendered, never an input.
 */

export type ChangeOrderResourceKind = "crew" | "labor" | "equipment" | "material" | "misc";

/** A pickable resource, stripped of money. `unit` is what the quantity is counted in. */
export interface ChangeOrderResource {
  id: string;
  name: string;
  unit: string;
}

export type ChangeOrderCatalog = Record<ChangeOrderResourceKind, ChangeOrderResource[]>;

/** What the foreman chose: which resource, and how much of it. No dollars cross this boundary. */
export interface ChangeOrderPick {
  kind: ChangeOrderResourceKind;
  id: string;
  qty: number;
}

const KIND_LABELS: Array<{ kind: ChangeOrderResourceKind; label: string }> = [
  { kind: "crew", label: "Crew" },
  { kind: "labor", label: "Labor" },
  { kind: "equipment", label: "Equipment" },
  { kind: "material", label: "Material" },
  { kind: "misc", label: "Misc" },
];

export interface JobChangeOrdersProps {
  changeOrders: ChangeOrder[];
  /** Active roster people holding the foreman role. Attribution is PICKED, never typed. */
  foremen: Array<{ id: string; name: string }>;
  /** The company's rate catalogs, with every dollar stripped out before they reach this screen. */
  catalog: ChangeOrderCatalog;
  /**
   * The two — and only two — money facts this screen may know. Costs are resolved in the parent from
   * the catalog rates; the ceiling comparison happens there too, against COST (the gaveled rule).
   */
  evaluate: (picks: ChangeOrderPick[]) => { price: number; withinCeiling: boolean };
  /** Owner-set on-the-spot ceiling, for the over-the-limit sentence. */
  ceiling: number;
  /** False when this job can't price a change order; `blockedReason` says why, in plain words. */
  canAdd: boolean;
  blockedReason?: string;
  /** Job is completed — the lane is closed. */
  locked?: boolean;
  onCreate: (input: { foremanId: string; picks: ChangeOrderPick[] }) => void;
  /** Roster name for an id, for the origin stamp. */
  personName: (id: string) => string;
}

interface DraftRow {
  key: string;
  kind: ChangeOrderResourceKind;
  id: string;
  qty: string; // held as text so a foreman can type "1." and "0.5" without the field fighting them
}

const blankRow = (): DraftRow => ({
  key: Math.random().toString(36).slice(2, 9),
  kind: "labor",
  id: "",
  qty: "",
});

const num = (s: string): number => {
  const n = parseFloat((s || "").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const stampDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

// The one sentence for a resource that simply is not in the company's catalog. There is deliberately
// NO free-typed cost escape hatch beside it: adding one would put a guessed number into the money,
// which is exactly the wall this screen exists to hold.
const NOT_IN_CATALOG =
  "That resource isn’t in your company’s rate catalog — the office can add it under Resources/rates, then it can be priced here.";

export default function JobChangeOrders({
  changeOrders,
  foremen,
  catalog,
  evaluate,
  ceiling,
  canAdd,
  blockedReason,
  locked,
  onCreate,
  personName,
}: JobChangeOrdersProps) {
  const [open, setOpen] = React.useState(false);
  const [foremanId, setForemanId] = React.useState("");
  const [rows, setRows] = React.useState<DraftRow[]>([blankRow()]);

  const picks: ChangeOrderPick[] = rows
    .filter((r) => r.id && num(r.qty) > 0)
    .map((r) => ({ kind: r.kind, id: r.id, qty: num(r.qty) }));
  const { price, withinCeiling } = evaluate(picks);
  const canSave = !!foremanId && picks.length > 0;
  // A category the office has never filled in is the commonest way a foreman hits the catalog wall.
  const emptyKinds = KIND_LABELS.filter(({ kind }) => (catalog[kind] || []).length === 0).map((k) => k.label);

  function reset() {
    setOpen(false);
    setForemanId("");
    setRows([blankRow()]);
  }

  function save() {
    if (!canSave) return;
    onCreate({ foremanId, picks });
    reset();
  }

  function patch(i: number, next: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...next } : r)));
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

          {/* WHAT IT TOOK. Pick the resource from the company's catalog; enter the quantity. Nothing
              else is enterable, because nothing else is the foreman's to know. */}
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            What it took — pick the resource, enter the quantity
          </div>
          <div className="mt-1 space-y-1.5">
            {rows.map((r, i) => {
              const options = catalog[r.kind] || [];
              const chosen = options.find((o) => o.id === r.id);
              const unit = chosen?.unit || (r.kind === "material" || r.kind === "misc" ? "" : "hrs");
              return (
                <div key={r.key} className="grid grid-cols-[6.5rem_1fr_5rem_3.5rem_1.75rem] items-center gap-1.5">
                  <select
                    value={r.kind}
                    onChange={(e) => patch(i, { kind: e.target.value as ChangeOrderResourceKind, id: "" })}
                    aria-label="Resource type"
                    className="h-8 rounded border bg-white px-1 text-sm"
                    style={{ borderColor: "#7D1424", color: "#333333" }}
                  >
                    {KIND_LABELS.map((k) => (
                      <option key={k.kind} value={k.kind}>{k.label}</option>
                    ))}
                  </select>
                  <select
                    value={r.id}
                    onChange={(e) => patch(i, { id: e.target.value })}
                    aria-label="Resource"
                    className="h-8 w-full min-w-0 rounded border bg-white px-1 text-sm"
                    style={{ borderColor: "#7D1424", color: "#333333" }}
                  >
                    <option value="">
                      {options.length > 0 ? "Select…" : "Nothing in this catalog yet"}
                    </option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <Input
                    {...selectOnFocusProps}
                    value={r.qty}
                    onChange={(e) => patch(i, { qty: e.target.value })}
                    inputMode="decimal"
                    placeholder={r.kind === "material" || r.kind === "misc" ? "Qty" : "Hours"}
                    className="h-8 text-right text-sm"
                  />
                  <div className="truncate text-[11px] text-muted-foreground">{unit}</div>
                  <button
                    type="button"
                    aria-label="Remove line"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                    disabled={rows.length === 1}
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
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
            onClick={() => setRows((prev) => [...prev, blankRow()])}
          >
            <Plus className="mr-1 h-3 w-3" /> Add resource
          </Button>

          {/* THE ONE DOLLAR FIGURE ON THIS SCREEN. Not what it cost — what to quote. */}
          <div className="mt-3 space-y-1 border-t pt-2">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Price to the customer</span>
              <span className="tabular-nums text-base font-semibold" style={{ color: "#7D1424" }}>
                {formatMoney(price)}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Priced automatically from this job’s original bid and your company’s rates. You don’t set this number.
            </div>
          </div>

          {/* THE CEILING, IN PLAIN SENTENCES. Same price either way — only the authority differs. */}
          {picks.length > 0 && (
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
              <span className="text-[11px] text-muted-foreground">Enter at least one resource with a quantity.</span>
            )}
          </div>

          {/* THE CATALOG WALL, said plainly — and with no free-typed cost offered as a way around it. */}
          <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
            Used something that isn’t on these lists? {NOT_IN_CATALOG}
            {emptyKinds.length > 0 && (
              <div className="mt-0.5">
                Nothing saved yet under: {emptyKinds.join(", ")}.
              </div>
            )}
          </div>
        </div>
      )}

      {/* THE LIST. Additive only in this pass — a priced change order is never edited here. The lines
          show WHAT and HOW MUCH; the only money is the price the foreman quoted. */}
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
                    <span className="truncate">{l.description || "Resource"}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{l.qty}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-baseline justify-end border-t pt-1.5">
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
