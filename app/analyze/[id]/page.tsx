"use client";

// /analyze/[id] — the app's ONE full-screen profit ladder (Segment 2, Call 5 Option A). Every door
// converges here: the Quotes "Analyze" action, the Overview Money Map's "View Full Money Map", and
// the pipeline phase drill-down (PLANNING + dead-lane jobs). Read-only: loads the quote by id and the
// overhead chart, derives the snapshot (lib/pipeline.moneyMapForJob) and tier (tierOf) — no writes,
// no new math. Tier is derived from status ONLY, never a toggle.
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moneyMapForJob, tierOf, type MoneyMapSnapshot } from "@/lib/pipeline";
import { MoneyMapLadderExpanded, TierBadge } from "@/components/MoneyMapLadder";
import { statusLabel, type QuoteStatus } from "@/lib/pmz-types";

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);

  const [loaded, setLoaded] = React.useState(false);
  const [quote, setQuote] = React.useState<any | null>(null);
  const [snap, setSnap] = React.useState<MoneyMapSnapshot | null>(null);

  React.useEffect(() => {
    try {
      const quotes = JSON.parse(localStorage.getItem("pmz_saved_quotes") || "[]");
      const q = Array.isArray(quotes) ? quotes.find((x: any) => x?.id === id) : null;
      if (q) {
        const chartRaw = localStorage.getItem("pmz_overhead_chart");
        const chart = chartRaw ? JSON.parse(chartRaw) : null;
        setQuote(q);
        setSnap(moneyMapForJob(q, chart));
      }
    } catch {}
    setLoaded(true);
  }, [id]);

  const tier = quote ? tierOf(quote.status) : "CONFIRMED";
  const jobName = quote?.jobName?.trim() || quote?.customerName || quote?.customer || "Untitled";

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      {/* Top bar — back + job identity + tier badge (never blended, never unlabeled). */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2 mb-1 text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] truncate">{loaded && quote ? jobName : "Analyze"}</h1>
            {loaded && quote && <TierBadge tier={tier} />}
          </div>
          {loaded && quote && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {statusLabel(quote.status as QuoteStatus)}
              {tier === "PLANNING" ? " · a projection from your bid, not yet foreman-confirmed" : " · foreman-confirmed"}
            </p>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !quote || !snap ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
          <div className="text-sm font-medium text-muted-foreground">That quote isn’t in your saved quotes.</div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/quotes")}>Go to Quotes</Button>
        </div>
      ) : (
        <MoneyMapLadderExpanded snap={snap} tier={tier} />
      )}
    </div>
  );
}
