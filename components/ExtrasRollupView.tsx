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
import { Layers } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { ExtrasRollup, ExtrasGroup } from "@/lib/change-orders";

/**
 * THE EXTRAS LEDGER — owner-facing. Every released change order, grouped by the foreman who wrote it
 * and by the job it was written on.
 *
 * ── WHAT THIS VIEW IS, AND WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * It is a LEDGER, not a bonus calculation, and it must never quietly become one. Extras belong to the
 * company (gaveled, Tom 2026-08-07); how they are credited is the owner's decision, made from this
 * visible pool, outside the software (Law 82). Grouping by foreman answers "who is finding this work"
 * — the fact the owner needs in front of them to make that call. It does not propose an answer, and no
 * future edit should add a suggested split, a percentage, or a payout column here.
 *
 * Display only: every number arrives from buildExtrasRollup. This file computes nothing.
 */

const dateOf = (iso: string) => (iso ? new Date(iso).toLocaleDateString() : "—");

function dateRange(g: ExtrasGroup): string {
  const first = dateOf(g.firstAt);
  const last = dateOf(g.lastAt);
  return first === last ? first : `${first} – ${last}`;
}

function GroupTable({
  rollup,
  groups,
  firstColumn,
}: {
  rollup: ExtrasRollup;
  groups: ExtrasGroup[];
  firstColumn: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{firstColumn}</TableHead>
            <TableHead className="text-right">Extras</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">GP at frozen margin</TableHead>
            <TableHead className="text-right">Dates</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                No released change orders yet.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {groups.map((g) => (
                <TableRow key={g.key}>
                  <TableCell className="font-medium">{g.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(g.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(g.gpDollars)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">{dateRange(g)}</TableCell>
                </TableRow>
              ))}
              {/* Both groupings total the same money — the arithmetic guarantee that neither drops
                  nor double-counts an extra. */}
              <TableRow className="border-t-2 bg-muted/50 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{rollup.totals.count}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(rollup.totals.revenue)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(rollup.totals.gpDollars)}</TableCell>
                <TableCell />
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function ExtrasRollupView({ rollup }: { rollup: ExtrasRollup }) {
  const { pending, declined, converted } = rollup.notCounted;
  const notCountedTotal = pending + declined + converted;

  return (
    <div className="space-y-6">
      <Card className="card">
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Extras</CardTitle>
              <CardDescription>
                Released change orders — the work the crew picked up on site, priced from each job&rsquo;s
                frozen bid margin (Law 83). Company money: these never appear on a salesperson&rsquo;s
                personal scorecard row.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* The one context line the ruling requires. It is the whole point of the view. */}
          <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm">
            The owner decides how extras are credited — PMZ keeps the ledger.
          </div>
          {notCountedTotal > 0 && (
            /* COUNTS ONLY, deliberately. A pending extra is not revenue waiting to be claimed, and a
               dollar figure here would invite exactly that reading. */
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
              <span>Not counted:</span>
              {pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-700">{pending} waiting for approval</Badge>}
              {declined > 0 && <Badge variant="outline" className="border-red-500 text-red-700">{declined} declined</Badge>}
              {converted > 0 && <Badge variant="outline" className="border-[#7D1424] text-[#7D1424]">{converted} moved to a quote</Badge>}
              <span>— no dollars from these are in any total above or below.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">By Foreman</CardTitle>
          <CardDescription>Who is finding this work. A record of fact, not a proposed split.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupTable rollup={rollup} groups={rollup.byForeman} firstColumn="Foreman" />
        </CardContent>
      </Card>

      <Card className="card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">By Job</CardTitle>
          <CardDescription>The same money grouped the other way — which jobs grew after the bid.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupTable rollup={rollup} groups={rollup.byJob} firstColumn="Job" />
        </CardContent>
      </Card>
    </div>
  );
}

export default ExtrasRollupView;
