"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { usePeople } from "@/lib/people";
import { useSalesGoals } from "@/lib/sales-goals";
import { loadJobs, jobActualCost, type Job } from "@/lib/jobs";
import type { SavedQuote } from "@/lib/pmz-types";
import { formatMoney } from "@/lib/format";
import {
  deriveTrackerRows,
  computeScorecard,
  computeScoreboard,
  rowsForYear,
  type TrackerRow,
} from "@/lib/sales-tracker";
import {
  loadChangeOrders,
  releasedTotalsByQuote,
  canDecideChangeOrder,
  CHANGE_ORDERS_KEY,
  type ChangeOrder,
} from "@/lib/change-orders";
import { readOverheadPlanning } from "@/lib/overhead-planning";
import {
  marginZone,
  classifyMargin,
  blendedMarginPct,
  gaugeFraction,
  zoneReadout,
  performedReadout,
  overheadCoverage,
  GAUGE_MAX_PCT,
  type MarginZone,
  type ZonePosition,
} from "@/lib/margin-zone";

/**
 * THE OVERVIEW — one question: ARE WE IN THE ZONE?
 *
 * Nothing else belongs on this page. Not a tool list, not a pipeline, not a card the owner has to
 * interpret. A tachometer, a fuel gauge, four numbers, and a link to the one thing waiting on them.
 *
 * ── EVERY NUMBER IS IMPORTED, NONE IS DERIVED HERE ────────────────────────────────────────────────
 * The dial reads computeScorecard's companyTotal (goal / actual / performed), computeScoreboard for
 * win rate, and lib/margin-zone for the band and its classification. This file divides nothing and
 * decides nothing — if a figure looks wrong, it is wrong in the reader, which is where the fence is.
 *
 * ── LAW 82 IN THE CHROME ──────────────────────────────────────────────────────────────────────────
 * The page states no advice and fires no trigger. Below the zone and above it are both reported as
 * out-of-zone, ranked equally: buying work on purpose and pricing out of work are both decisions an
 * owner makes, and neither is the software's to praise or flag.
 */

const YEARS = [2025, 2026, 2027];

const pct1 = (n: number | null): string => (n === null ? "—" : `${n.toFixed(1)}%`);
const money0 = (n: number | null): string =>
  n === null ? "—" : `$${Math.round(n).toLocaleString()}`;

// Dial geometry — a 180° arc. Fraction 0..1 maps left to right across the top.
const DIAL = { cx: 200, cy: 170, r: 130, stroke: 22 };
function polar(fraction: number, radius: number) {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, fraction))); // 0 → left, 1 → right
  return { x: DIAL.cx + radius * Math.cos(angle), y: DIAL.cy - radius * Math.sin(angle) };
}
function arcPath(from: number, to: number, radius: number): string {
  const a = polar(from, radius);
  const b = polar(to, radius);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const POSITION_LABEL: Record<ZonePosition, string> = {
  below: "BELOW THE ZONE",
  in: "IN THE ZONE",
  above: "ABOVE THE ZONE",
};

function Tach({
  bookedPct,
  performedPct,
  zone,
  position,
}: {
  bookedPct: number | null;
  performedPct: number | null;
  zone: MarginZone | null;
  position: ZonePosition | null;
}) {
  const bookedF = gaugeFraction(bookedPct);
  const performedF = gaugeFraction(performedPct);
  const lowF = zone ? gaugeFraction(zone.lowPct) : null;
  const highF = zone ? gaugeFraction(zone.highPct) : null;
  const needle = bookedF === null ? null : polar(bookedF, DIAL.r - 4);
  const perfInner = performedF === null ? null : polar(performedF, DIAL.r - DIAL.stroke / 2 - 12);
  const perfOuter = performedF === null ? null : polar(performedF, DIAL.r + DIAL.stroke / 2 - 12);

  return (
    <svg viewBox="0 0 400 210" className="w-full max-w-[440px]" role="img" aria-label="Blended margin on won work">
      {/* The face */}
      <path d={arcPath(0, 1, DIAL.r - DIAL.stroke / 2)} fill="none" stroke="#E5E7EB" strokeWidth={DIAL.stroke} />
      {/* THE ZONE — a band, not a line. Absent entirely when no goals are entered. */}
      {lowF !== null && highF !== null && (
        <path d={arcPath(lowF, highF, DIAL.r - DIAL.stroke / 2)} fill="none" stroke="#047857" strokeWidth={DIAL.stroke} opacity={0.28} />
      )}
      {/* The quieter second mark: PERFORMED. A tick, so it never competes with the needle. */}
      {perfInner && perfOuter && (
        <line x1={perfInner.x} y1={perfInner.y} x2={perfOuter.x} y2={perfOuter.y} stroke="#7D1424" strokeWidth={3} opacity={0.65} />
      )}
      {/* THE NEEDLE: booked blended margin. */}
      {needle && (
        <>
          <line x1={DIAL.cx} y1={DIAL.cy} x2={needle.x} y2={needle.y} stroke="#111827" strokeWidth={3} />
          <circle cx={DIAL.cx} cy={DIAL.cy} r={6} fill="#111827" />
        </>
      )}
      {/* Face ends, labelled so the scale is never a guess. */}
      <text x={DIAL.cx - DIAL.r} y={DIAL.cy + 18} textAnchor="middle" fontSize="11" fill="#6B7280">0%</text>
      <text x={DIAL.cx + DIAL.r} y={DIAL.cy + 18} textAnchor="middle" fontSize="11" fill="#6B7280">{GAUGE_MAX_PCT}%</text>
      {/* The reading */}
      <text x={DIAL.cx} y={DIAL.cy - 34} textAnchor="middle" fontSize="42" fontWeight="600" fill="#111827">
        {pct1(bookedPct)}
      </text>
      {position && (
        <text x={DIAL.cx} y={DIAL.cy - 12} textAnchor="middle" fontSize="12" letterSpacing="1" fill="#6B7280">
          {POSITION_LABEL[position]}
        </text>
      )}
    </svg>
  );
}

export default function OverviewPage() {
  const { people } = usePeople();
  const { goals } = useSalesGoals();
  const [year, setYear] = React.useState(2026);
  const [quotes, setQuotes] = React.useState<SavedQuote[]>([]);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [changeOrders, setChangeOrders] = React.useState<ChangeOrder[]>([]);
  const [annualOverhead, setAnnualOverhead] = React.useState(0);

  // Client-only load, refreshed on cross-surface writes (never read during render — SSR).
  React.useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem("pmz_saved_quotes");
        setQuotes(raw ? (JSON.parse(raw) as SavedQuote[]) : []);
      } catch {
        setQuotes([]);
      }
      setJobs(loadJobs());
      setChangeOrders(loadChangeOrders());
      // THE ONLY ANNUAL OVERHEAD FIGURE IN THE SYSTEM: the owner-entered planning pool
      // (pmz_work_type_planning_v1.annualOverhead), read through its existing reader. The overhead
      // CHART holds monthly amounts with no annual field, and multiplying it by twelve to manufacture
      // a year is exactly the fabricated denominator the gauge refuses to draw.
      try {
        setAnnualOverhead(readOverheadPlanning().pool || 0);
      } catch {
        setAnnualOverhead(0);
      }
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pmz_saved_quotes" || e.key === "pmz_jobs_v1" || e.key === CHANGE_ORDERS_KEY || e.key === "pmz_work_type_planning_v1") load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The same joins the Sales Tracker makes — jobs for actual cost, released extras for company money.
  const jobByQuoteId = React.useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) if (j.quoteId) m.set(j.quoteId, j);
    return m;
  }, [jobs]);
  const extrasByQuoteId = React.useMemo(() => releasedTotalsByQuote(changeOrders), [changeOrders]);

  const rows: TrackerRow[] = React.useMemo(() => {
    const inputs = quotes.map((q) => {
      const job = jobByQuoteId.get(q.id);
      const extras = extrasByQuoteId.get(q.id);
      const withExtras = extras
        ? { ...q, changeOrderRevenue: extras.revenue, changeOrderCost: extras.cost, changeOrderGpDollars: extras.gpDollars }
        : q;
      if (!job) return withExtras;
      const { cost, complete } = jobActualCost(job);
      return { ...withExtras, actualCost: cost, actualCostComplete: complete };
    });
    return deriveTrackerRows(inputs, people);
  }, [quotes, people, jobByQuoteId, extrasByQuoteId]);

  const card = React.useMemo(() => computeScorecard(rows, goals, people, year), [rows, goals, people, year]);
  // Win rate scoped through the SAME year rule the scorecard uses — computeScoreboard takes no year.
  const board = React.useMemo(() => computeScoreboard(rowsForYear(rows, year)), [rows, year]);

  const total = card.companyTotal;
  const targetPct = blendedMarginPct(total.goal?.marginDollars, total.goal?.salesDollars);
  const bookedPct = blendedMarginPct(total.actual.gpDollars, total.actual.salesDollars);
  const performedPct = blendedMarginPct(total.performed.gpDollars, total.performed.costedSalesDollars);
  const zone = marginZone(targetPct);
  const position = classifyMargin(bookedPct, zone);

  // The overhead gauge's numerator is the YEAR'S recognized GP — the same performed figure the dial
  // reads, not an all-time total.
  const coverage = overheadCoverage(total.performed.gpDollars, annualOverhead);

  const waiting = React.useMemo(() => changeOrders.filter(canDecideChangeOrder).length, [changeOrders]);

  return (
    <div className="max-w-4xl space-y-6 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Are we in the zone?</h1>
          {/* LAW 82 IN THE CHROME — the frame, stated once. */}
          <p className="mt-1 text-sm text-muted-foreground">
            PMZ shows where the needle sits. You decide what to do with the gas.
          </p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="Year"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* THE TACH — blended margin on won work. */}
      <Card className="card">
        <CardContent className="flex flex-col items-center pt-6">
          <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">
            Blended margin on won work — {year}
          </div>
          <Tach bookedPct={bookedPct} performedPct={performedPct} zone={zone} position={position} />
          <div className="mt-1 max-w-prose text-center text-sm">{zoneReadout(bookedPct, zone, year)}</div>
          <div className="mt-1 max-w-prose text-center text-sm text-muted-foreground">
            {performedReadout(bookedPct, performedPct)}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: "#111827" }} /> Needle — booked</span>
            <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: "#7D1424", opacity: 0.65 }} /> Mark — performed</span>
            <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: "#047857", opacity: 0.28 }} /> Band — your goal</span>
          </div>
          {!zone && (
            <Link href="/goals-entry" className="mt-2 text-xs text-primary underline underline-offset-2">
              Enter margin goals to set the zone →
            </Link>
          )}
        </CardContent>
      </Card>

      {/* THE OVERHEAD GAUGE — gross profit earned this year against the year's overhead. */}
      <Card className="card">
        <CardContent className="pt-5">
          <div className="flex items-baseline justify-between">
            <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">
              Overhead covered — {year}
            </div>
            {coverage && (
              <div className="text-sm tabular-nums">
                {money0(coverage.gpEarned)} <span className="text-muted-foreground">of</span> {money0(coverage.annualOverhead)}
              </div>
            )}
          </div>
          {coverage ? (
            <>
              <div className="relative mt-3 h-6 w-full overflow-hidden rounded-md bg-muted">
                <div
                  className="h-full"
                  style={{
                    width: `${(coverage.fraction * 100).toFixed(2)}%`,
                    backgroundColor: coverage.covered ? "#047857" : "#B45309",
                    opacity: 0.75,
                  }}
                />
                {/* THE CROSSOVER — where GP has covered overhead and the next dollar is profit. */}
                <div className="absolute inset-y-0 right-0 w-[2px]" style={{ backgroundColor: "#111827" }} />
              </div>
              <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
                <span>
                  {coverage.covered
                    ? "Overhead covered — the next gross-profit dollar is profit."
                    : `${money0(coverage.remaining)} of gross profit still to earn before overhead is covered.`}
                </span>
                <span>Crossover at {money0(coverage.annualOverhead)}</span>
              </div>
            </>
          ) : (
            /* NEVER A FABRICATED DENOMINATOR — say what is missing and where it is entered. */
            <div className="mt-3 rounded-md border border-dashed bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              No annual overhead entered, so there is nothing to measure against. Set{" "}
              <span className="font-medium text-foreground">Planned Annual Overhead</span> on{" "}
              <Link href="/work-types" className="text-primary underline underline-offset-2">Work Types</Link>.
              <div className="mt-1 text-xs">
                The overhead chart on Overhead &amp; Profit holds MONTHLY amounts and carries no annual
                figure — this gauge will not multiply one to invent a year.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* THE NUMBERS ROW — four items, thin. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="card">
          <CardContent className="pt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Booked vs goal</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{money0(total.actual.salesDollars)}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {total.goal ? `of ${money0(total.goal.salesDollars)} goal` : "no goal entered"}
            </div>
          </CardContent>
        </Card>
        <Card className="card">
          <CardContent className="pt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Performed</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{money0(total.performed.salesDollars)}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {pct1(performedPct)} margin · {total.performed.costedJobCount} of {total.performed.jobCount} costed
            </div>
          </CardContent>
        </Card>
        <Card className="card">
          <CardContent className="pt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Win rate</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {(board.all.winRateByDollars * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              by dollars · {board.all.wonCount} of {board.all.wonCount + board.all.lostCount} by count
            </div>
          </CardContent>
        </Card>
        <Card className="card">
          <CardContent className="pt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Waiting on you</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{waiting}</div>
            <div className="text-xs">
              {waiting > 0 ? (
                <Link href="/jobs" className="text-primary underline underline-offset-2">
                  change order{waiting === 1 ? "" : "s"} to decide →
                </Link>
              ) : (
                <span className="text-muted-foreground">no change orders pending</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
