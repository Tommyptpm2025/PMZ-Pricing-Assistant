"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2,
  RefreshCw,
  Send,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAllQuotes,
  deleteQuote,
  updateQuote,
  saveQuote,
} from "@/lib/quote-storage";
import { STATUS_FLOW, isStatusLocked, type QuoteStatus, type SavedQuote } from "@/lib/pmz-types";
import { canTransition, applyStatusChange as libApplyStatusChange } from "@/lib/quote-lifecycle";

const STATUS_OPTIONS = ["Draft", "Ready for Approval", "Approved", "Declined"] as const;

// All nine lifecycle statuses, in forward order — for the super-user direct-jump control.
const ALL_STATUSES = Object.keys(STATUS_FLOW) as QuoteStatus[];

// Super-user gate (PART C). Hard-coded for now; when the role hierarchy arrives, flip this
// single switch to a real permission check — nothing else needs to change.
const isSuperUser = true;

// Back-half statuses that advance via a single forward "Advance →" control.
// (Draft → Send for Acceptance; Ready for Approval → Mark Accepted/Declined are
// handled separately; Paid/Declined are terminal.)
const ADVANCE_STATUSES: QuoteStatus[] = [
  "Approved",
  "In Progress",
  "Completed",
  "Ready to Invoice",
  "Invoiced",
];

// The single legal next status for an advanceable quote, else null.
function advanceNext(status: QuoteStatus): QuoteStatus | null {
  if (!ADVANCE_STATUSES.includes(status)) return null;
  return STATUS_FLOW[status]?.[0] ?? null;
}

// The immediately prior status — the reverse of STATUS_FLOW (each status is a forward
// target of exactly one other, so this is unambiguous). Null for Draft (nothing before it).
// Yields: Paid->Invoiced->Ready to Invoice->Completed->In Progress->Approved->Ready for
// Approval->Draft, and Declined->Ready for Approval.
function statusBack(status: QuoteStatus): QuoteStatus | null {
  for (const s of ALL_STATUSES) {
    if ((STATUS_FLOW[s] || []).includes(status)) return s;
  }
  return null;
}

function formatMoney(amount: number): string {
  return (amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

// Functional status palette — light tint bg / darker readable text per lifecycle stage.
// Intentionally separate from the brand palette; Declined's rose stays distinct from brand red.
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  "Draft": { bg: "#F1F1F1", fg: "#555555" },              // grey
  "Ready for Approval": { bg: "#FEF3C7", fg: "#92600E" }, // amber
  "Approved": { bg: "#DBEAFE", fg: "#1E40AF" },           // blue
  "In Progress": { bg: "#E0E7FF", fg: "#3730A3" },        // indigo
  "Completed": { bg: "#CCFBF1", fg: "#115E59" },          // teal
  "Ready to Invoice": { bg: "#FFEDD5", fg: "#9A3412" },   // orange
  "Invoiced": { bg: "#E0F2FE", fg: "#075985" },           // sky
  "Paid": { bg: "#DCFCE7", fg: "#166534" },               // green
  "Declined": { bg: "#FFE4E6", fg: "#9F1239" },           // deep rose (≠ brand red #EB3300)
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS["Draft"];
  return (
    <Badge
      variant="outline"
      className="font-medium text-xs"
      style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.fg }}
    >
      {status}
    </Badge>
  );
}

export default function QuotesPage() {
  const router = useRouter();
  const [allQuotes, setAllQuotes] = React.useState<SavedQuote[]>([]);
  const [deleteTarget, setDeleteTarget] = React.useState<SavedQuote | null>(null);
  const [previewTarget, setPreviewTarget] = React.useState<SavedQuote | null>(null);
  // Optional note captured with an acceptance decision (e.g. "10% deposit received 6/20")
  const [decisionNote, setDecisionNote] = React.useState("");
  // Quote pending a forward lifecycle advance (confirm dialog target)
  const [advanceTarget, setAdvanceTarget] = React.useState<SavedQuote | null>(null);

  // EPP list filters (independent)
  const [eppStatus, setEppStatus] = React.useState<string[]>([]);
  const [eppCustomer, setEppCustomer] = React.useState("");
  const [eppWorkType, setEppWorkType] = React.useState("");
  const [eppJobSearch, setEppJobSearch] = React.useState("");
  const [eppDateFrom, setEppDateFrom] = React.useState("");
  const [eppDateTo, setEppDateTo] = React.useState("");

  // Full list filters (independent)
  const [fullStatus, setFullStatus] = React.useState<string[]>([]);
  const [fullCustomer, setFullCustomer] = React.useState("");
  const [fullWorkType, setFullWorkType] = React.useState("");
  const [fullJobSearch, setFullJobSearch] = React.useState("");
  const [fullDateFrom, setFullDateFrom] = React.useState("");
  const [fullDateTo, setFullDateTo] = React.useState("");

  React.useEffect(() => {
    setAllQuotes(getAllQuotes());
  }, []);

  function refresh() {
    setAllQuotes(getAllQuotes());
  }

  const eppBase = React.useMemo(
    () => allQuotes.filter((q) => q.quoteType === "EPP"),
    [allQuotes]
  );
  const fullBase = React.useMemo(
    () => allQuotes.filter((q) => q.quoteType === "Full"),
    [allQuotes]
  );

  const eppWorkTypes = React.useMemo(() => {
    const s = new Set(eppBase.map((q) => q.workType).filter((w) => !!w && w.trim() !== ''));
    return Array.from(s).sort();
  }, [eppBase]);

  const fullWorkTypes = React.useMemo(() => {
    const s = new Set(fullBase.map((q) => q.workType).filter((w) => !!w && w.trim() !== ''));
    return Array.from(s).sort();
  }, [fullBase]);

  function toggleStatus(list: "epp" | "full", st: string) {
    const isEpp = list === "epp";
    const current = isEpp ? eppStatus : fullStatus;
    const setter = isEpp ? setEppStatus : setFullStatus;
    if (current.includes(st)) {
      setter(current.filter((s) => s !== st));
    } else {
      setter([...current, st]);
    }
  }

  function clearFilters(list: "epp" | "full") {
    if (list === "epp") {
      setEppStatus([]);
      setEppCustomer("");
      setEppWorkType("");
      setEppJobSearch("");
      setEppDateFrom("");
      setEppDateTo("");
    } else {
      setFullStatus([]);
      setFullCustomer("");
      setFullWorkType("");
      setFullJobSearch("");
      setFullDateFrom("");
      setFullDateTo("");
    }
  }

  const filteredEpp = React.useMemo(() => {
    let list = [...eppBase];
    if (eppStatus.length > 0) {
      list = list.filter((q) => eppStatus.includes(q.status));
    }
    if (eppCustomer.trim()) {
      const s = eppCustomer.trim().toLowerCase();
      list = list.filter((q) => (q.customer || "").toLowerCase().includes(s));
    }
    if (eppWorkType) {
      list = list.filter((q) => q.workType === eppWorkType);
    }
    if (eppJobSearch.trim()) {
      const s = eppJobSearch.trim().toLowerCase();
      list = list.filter((q) => (q.jobName || "").toLowerCase().includes(s));
    }
    if (eppDateFrom) {
      const from = new Date(eppDateFrom);
      list = list.filter((q) => new Date(q.createdAt) >= from);
    }
    if (eppDateTo) {
      const to = new Date(eppDateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((q) => new Date(q.createdAt) <= to);
    }
    return list;
  }, [
    eppBase,
    eppStatus,
    eppCustomer,
    eppWorkType,
    eppJobSearch,
    eppDateFrom,
    eppDateTo,
  ]);

  const filteredFull = React.useMemo(() => {
    let list = [...fullBase];
    if (fullStatus.length > 0) {
      list = list.filter((q) => fullStatus.includes(q.status));
    }
    if (fullCustomer.trim()) {
      const s = fullCustomer.trim().toLowerCase();
      list = list.filter((q) => (q.customer || "").toLowerCase().includes(s));
    }
    if (fullWorkType) {
      list = list.filter((q) => q.workType === fullWorkType);
    }
    if (fullJobSearch.trim()) {
      const s = fullJobSearch.trim().toLowerCase();
      list = list.filter((q) => (q.jobName || "").toLowerCase().includes(s));
    }
    if (fullDateFrom) {
      const from = new Date(fullDateFrom);
      list = list.filter((q) => new Date(q.createdAt) >= from);
    }
    if (fullDateTo) {
      const to = new Date(fullDateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((q) => new Date(q.createdAt) <= to);
    }
    return list;
  }, [
    fullBase,
    fullStatus,
    fullCustomer,
    fullWorkType,
    fullJobSearch,
    fullDateFrom,
    fullDateTo,
  ]);

  function openQuote(quote: SavedQuote) {
    try {
      const estimateData = {
        jobName: quote.jobName || "",
        workTypeName: quote.workType || "",
        salesperson: quote.salesperson || "",
        estimatedRevenue: quote.totalRevenue || 0,
        bidItems: (quote.eppLineItems || []).map((it: any) => ({ ...it })),
        customer: quote.customer || "",
      };
      localStorage.setItem("pmz_current_estimate_v1", JSON.stringify(estimateData));

      // Identify the quote so the Pricer updates THIS record on Save (no duplicate).
      localStorage.setItem("pmz_current_quote_id", quote.id);

      if (quote.proLemItems && quote.proLemItems.length > 0) {
        localStorage.setItem(
          "pmz_current_lem_v1",
          JSON.stringify(quote.proLemItems.map((it: any) => ({ ...it })))
        );
      } else {
        localStorage.removeItem("pmz_current_lem_v1");
      }

      if (quote.locked) {
        localStorage.setItem("pmz_current_quote_readonly", "true");
      } else {
        localStorage.removeItem("pmz_current_quote_readonly");
      }
    } catch {
      // ignore storage errors
    }
    router.push("/project-pricer");
  }

  function duplicateQuote(quote: SavedQuote) {
    const now = new Date().toISOString();
    const copy: SavedQuote = {
      ...quote,
      id: `copy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      jobName: `${quote.jobName || "Untitled"} (Copy)`,
      quoteNumber: Date.now().toString().slice(-7),
      status: "Draft",
      locked: false,
      statusHistory: [{ status: "Draft", at: now }],
      sentAt: undefined,
      decidedAt: undefined,
      decisionNote: undefined,
      createdAt: now,
      updatedAt: now,
    };
    try {
      saveQuote(copy);
    } catch {
      // fallback direct
      const key = "pmz_saved_quotes";
      const raw = localStorage.getItem(key);
      const arr: SavedQuote[] = raw ? JSON.parse(raw) : [];
      arr.push(copy);
      localStorage.setItem(key, JSON.stringify(arr));
    }
    refresh();
    openQuote(copy);
  }

  // Apply a status change via the shared lifecycle transform (single source of
  // truth — same path the Project Pricer uses), then persist + refresh the list.
  function applyStatusChange(
    quote: SavedQuote,
    newStatus: QuoteStatus,
    extra?: { sentAt?: string; decidedAt?: string; decisionNote?: string }
  ): SavedQuote {
    const updated = libApplyStatusChange(quote, newStatus, extra);
    updateQuote(updated);
    refresh();
    return updated;
  }

  function changeStatus(quote: SavedQuote, newStatus: SavedQuote["status"]) {
    applyStatusChange(quote, newStatus as QuoteStatus);
  }

  // ---- Super-user status override (dev/test tool — PART A & B) ----

  // PART A — jump to ANY status (backward, forward, any). Reuses the shared transition
  // transform for the statusHistory append, then sets `locked` to match the CHOSEN status
  // (a super-user can move backward, so the normal forward-only latch doesn't apply here).
  function superUserSetStatus(quote: SavedQuote, newStatus: QuoteStatus) {
    const transformed = libApplyStatusChange(quote, newStatus);
    const updated: SavedQuote = { ...transformed, locked: isStatusLocked(newStatus) };
    updateQuote(updated);
    refresh();
    setPreviewTarget((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  // Back — step exactly one status backward (mirror of forward Advance). Reuses the same
  // jump path (libApplyStatusChange + lock rule + persist); no-op at Draft.
  function superUserBack(quote: SavedQuote) {
    const prev = statusBack(quote.status);
    if (!prev) return;
    superUserSetStatus(quote, prev);
  }

  // PART B — reset to a genuinely fresh Draft: clear the lifecycle fields and re-seed
  // statusHistory. Bid data (line items, customer, totals) is untouched.
  function superUserResetToDraft(quote: SavedQuote) {
    const now = new Date().toISOString();
    const reset: SavedQuote = {
      ...quote,
      status: "Draft",
      locked: false,
      statusHistory: [{ status: "Draft", at: now }],
      sentAt: undefined,
      decidedAt: undefined,
      decisionNote: undefined,
      updatedAt: now,
    };
    updateQuote(reset);
    refresh();
    setPreviewTarget((prev) => (prev && prev.id === reset.id ? reset : prev));
  }

  // PART A — send a tallied bid out for acceptance. Only a Draft quote can be sent.
  function sendForAcceptance(quote: SavedQuote) {
    if (quote.status !== "Draft" || !canTransition("Draft", "Ready for Approval")) return;
    const now = new Date().toISOString();
    const updated = applyStatusChange(quote, "Ready for Approval", { sentAt: now });
    setPreviewTarget((prev) => (prev && prev.id === quote.id ? updated : prev));
  }

  // PART B — record the customer's decision on a quote that is out for acceptance.
  function recordDecision(quote: SavedQuote, accepted: boolean, note: string) {
    if (quote.status !== "Ready for Approval") return;
    const next: QuoteStatus = accepted ? "Approved" : "Declined";
    if (!canTransition("Ready for Approval", next)) return;
    const now = new Date().toISOString();
    const updated = applyStatusChange(quote, next, {
      decidedAt: now,
      decisionNote: note.trim() || undefined,
    });
    setDecisionNote("");
    setPreviewTarget((prev) => (prev && prev.id === quote.id ? updated : prev));
  }

  // PART A — advance a quote forward through the back half of the lifecycle
  // (Approved → … → Paid). Forward-only; confirmed before applying.
  function confirmAdvance() {
    if (!advanceTarget) return;
    const next = advanceNext(advanceTarget.status);
    if (!next) { setAdvanceTarget(null); return; }
    const updated = applyStatusChange(advanceTarget, next);
    setPreviewTarget((prev) => (prev && prev.id === updated.id ? updated : prev));
    setAdvanceTarget(null);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteQuote(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  }

  function renderFilters(list: "epp" | "full") {
    const isEpp = list === "epp";
    const statusSel = isEpp ? eppStatus : fullStatus;
    const cust = isEpp ? eppCustomer : fullCustomer;
    const wt = isEpp ? eppWorkType : fullWorkType;
    const jobS = isEpp ? eppJobSearch : fullJobSearch;
    const dFrom = isEpp ? eppDateFrom : fullDateFrom;
    const dTo = isEpp ? eppDateTo : fullDateTo;
    const wts = isEpp ? eppWorkTypes : fullWorkTypes;

    const setCust = isEpp ? setEppCustomer : setFullCustomer;
    const setWt = isEpp ? setEppWorkType : setFullWorkType;
    const setJob = isEpp ? setEppJobSearch : setFullJobSearch;
    const setFrom = isEpp ? setEppDateFrom : setFullDateFrom;
    const setTo = isEpp ? setEppDateTo : setFullDateTo;

    return (
      <div className="rounded-lg border bg-white p-3 space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
          {/* Status multi-select via toggle chips */}
          <div className="min-w-[240px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status (multi-select)</div>
            <div className="flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((st) => {
                const active = statusSel.includes(st);
                return (
                  <button
                    key={st}
                    onClick={() => toggleStatus(list, st)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded border transition-colors",
                      active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"
                    )}
                  >
                    {st}
                  </button>
                );
              })}
              {statusSel.length > 0 && (
                <button
                  onClick={() => (isEpp ? setEppStatus([]) : setFullStatus([]))}
                  className="text-xs px-1.5 text-muted-foreground underline"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          {/* Customer text search */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Customer</div>
            <Input
              value={cust}
              onChange={(e) => setCust(e.target.value)}
              placeholder="Search customer..."
              className="h-8 w-44 text-sm"
            />
          </div>

          {/* Work Type dropdown */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Work Type</div>
            <Select value={wt || "__all__"} onValueChange={(v) => setWt(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="All work types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All work types</SelectItem>
                {wts.filter((w) => !!w && w.trim() !== '').map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Name search */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Job Name</div>
            <Input
              value={jobS}
              onChange={(e) => setJob(e.target.value)}
              placeholder="Search job name..."
              className="h-8 w-44 text-sm"
            />
          </div>

          {/* Date range (created) */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Created date</div>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={dFrom}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-32 text-xs"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                value={dTo}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-32 text-xs"
              />
            </div>
          </div>

          <div className="self-end pb-0.5">
            <Button variant="ghost" size="sm" onClick={() => clearFilters(list)} className="h-8">
              Clear filters
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderTable(quotes: SavedQuote[], typeLabel: string) {
    return (
      <Card className="overflow-hidden border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="min-w-[160px]">Job Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Work Type</TableHead>
                <TableHead>Salesperson</TableHead>
                <TableHead className="text-right">Total Revenue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                    No {typeLabel} quotes match the current filters.
                    {allQuotes.length === 0 && " Create quotes using the Save buttons inside Project Pricer."}
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((quote) => (
                  <TableRow key={quote.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium">{quote.jobName || "Untitled"}</TableCell>
                    <TableCell className="text-sm">{quote.customerName || quote.customer || "—"}</TableCell>
                    <TableCell className="text-sm">{quote.workType || "—"}</TableCell>
                    <TableCell className="text-sm">{quote.salesperson || "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      ${formatMoney(quote.totalRevenue)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={quote.status} />
                        {/* Single status control — native <select>. Options are the forward ACTIONS
                            for the current status (reusing the exact same handlers the old row buttons
                            called): Draft → Send for Acceptance; Ready for Approval → Mark Accepted /
                            Declined; mid-stages → Advance to [next] (with its confirm). Then the
                            SUPER USER optgroup. Auto-resets to the placeholder. */}
                        <select
                          value=""
                          aria-label="Change status"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            if (v === "act:send") sendForAcceptance(quote);
                            else if (v === "act:advance") setAdvanceTarget(quote);
                            else if (v === "act:accept") recordDecision(quote, true, "");
                            else if (v === "act:decline") recordDecision(quote, false, "");
                            else if (v.startsWith("jump:")) superUserSetStatus(quote, v.slice(5) as QuoteStatus);
                            else if (v === "su-back") superUserBack(quote);
                            else if (v === "su-reset") superUserResetToDraft(quote);
                          }}
                          className="h-6 w-24 rounded border px-1 text-[10px] bg-white"
                          style={{ borderColor: "#7D1424", color: "#333333" }}
                        >
                          <option value="" disabled>Change…</option>
                          {quote.status === "Draft" && (
                            <option value="act:send">Mark Ready for Approval</option>
                          )}
                          {quote.status === "Ready for Approval" && (
                            <>
                              <option value="act:accept">Mark Accepted</option>
                              <option value="act:decline">Mark Declined</option>
                            </>
                          )}
                          {advanceNext(quote.status) && (
                            <option value="act:advance">Advance to {advanceNext(quote.status)}</option>
                          )}
                          {isSuperUser && (
                            <optgroup label="──  SUPER USER  ──">
                              {ALL_STATUSES.filter((s) => s !== quote.status).map((s) => (
                                <option key={`jump-${s}`} value={`jump:${s}`}>Jump → {s}</option>
                              ))}
                              {statusBack(quote.status) && (
                                <option value="su-back">◄ Back to {statusBack(quote.status)}</option>
                              )}
                              <option value="su-reset">↺ Reset to Draft</option>
                            </optgroup>
                          )}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(quote.updatedAt || quote.createdAt)}
                    </TableCell>
                    <TableCell className="text-right pr-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Status actions now live in the Change dropdown (status column). */}
                        {/* Secondary actions — plain native <select> (reliable; NOT the custom
                            Select). Reuses the existing preview / openQuote / duplicate handlers.
                            Controlled value="" auto-resets to the placeholder after each pick. */}
                        <select
                          value=""
                          aria-label="Quote actions"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "preview") setPreviewTarget(quote);
                            else if (v === "edit") openQuote(quote);
                            else if (v === "duplicate") duplicateQuote(quote);
                          }}
                          className="h-7 rounded border px-1.5 text-xs bg-white"
                          style={{ color: "#333333", borderColor: "#7D1424" }}
                        >
                          <option value="" disabled>Actions…</option>
                          <option value="preview">Preview</option>
                          <option value="edit">Edit</option>
                          <option value="duplicate">Duplicate</option>
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(quote); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">Quotes</h1>
            <Badge variant="outline" className="text-[10px] tracking-wider">LIBRARY</Badge>
          </div>
          <p className="mt-1 text-muted-foreground max-w-2xl">
            All saved EPP and Full quotes from the Project Pricer. Use filters, change status, preview or edit, duplicate or delete.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh from storage
        </Button>
      </div>

      {/* EPP Quotes */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2 px-0.5">
          <div className="font-semibold tracking-tight text-lg">EPP Quotes</div>
          <div className="text-sm text-muted-foreground">
            {filteredEpp.length} shown / {eppBase.length} total
          </div>
        </div>
        {renderFilters("epp")}
        {renderTable(filteredEpp, "EPP")}
      </div>

      {/* Full Quotes */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2 px-0.5">
          <div className="font-semibold tracking-tight text-lg">Full Quotes</div>
          <div className="text-sm text-muted-foreground">
            {filteredFull.length} shown / {fullBase.length} total
          </div>
        </div>
        {renderFilters("full")}
        {renderTable(filteredFull, "Full")}
      </div>

      {/* Preview centered Dialog (modal) */}
      <Dialog open={!!previewTarget} onOpenChange={(open) => { if (!open) { setPreviewTarget(null); setDecisionNote(""); } }}>
        <DialogContent className="w-[92%] sm:w-[85%] md:w-[72%] lg:w-[60%] xl:w-[55%] max-w-[920px] !max-w-none">
          <DialogClose asChild>
            <button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
              aria-label="Close"
            >
              <span className="text-xl leading-none">×</span>
              <span className="sr-only">Close</span>
            </button>
          </DialogClose>
          <DialogHeader>
            <DialogTitle>Quote Preview — {previewTarget?.quoteType}</DialogTitle>
            <DialogDescription>
              Read-only view. Click Edit to load into Project Pricer for changes.
            </DialogDescription>
          </DialogHeader>
          {previewTarget && (
            <>
              <div className="overflow-y-auto max-h-[65vh] pr-2">
                <div className="space-y-4 py-4 text-sm">
                  <div className="grid grid-cols-1 gap-y-2">
                    <div><span className="font-medium text-muted-foreground">Job Name:</span> <span className="font-semibold">{previewTarget.jobName || "Untitled"}</span></div>
                    <div><span className="font-medium text-muted-foreground">Customer:</span> {previewTarget.customerName || previewTarget.customer || "—"}</div>
                    <div><span className="font-medium text-muted-foreground">Work Type:</span> {previewTarget.workType || "—"}</div>
                    <div><span className="font-medium text-muted-foreground">Salesperson:</span> {previewTarget.salesperson || "—"}</div>
                    <div><span className="font-medium text-muted-foreground">Status:</span> <StatusBadge status={previewTarget.status} /></div>
                    <div><span className="font-medium text-muted-foreground">Created:</span> {formatDate(previewTarget.createdAt)}</div>
                    <div><span className="font-medium text-muted-foreground">Last Updated:</span> {formatDate(previewTarget.updatedAt || previewTarget.createdAt)}</div>
                    {previewTarget.sentAt && (
                      <div><span className="font-medium text-muted-foreground">Sent for acceptance:</span> {formatDate(previewTarget.sentAt)}</div>
                    )}
                    {previewTarget.decidedAt && (
                      <div><span className="font-medium text-muted-foreground">Decision recorded:</span> {formatDate(previewTarget.decidedAt)}</div>
                    )}
                    {previewTarget.decisionNote && (
                      <div><span className="font-medium text-muted-foreground">Decision note:</span> {previewTarget.decisionNote}</div>
                    )}
                  </div>

                  {previewTarget.quoteType === "Full" && previewTarget.proLemItems && previewTarget.proLemItems.length > 0 && (() => {
                    const items = previewTarget.proLemItems;
                    let labor = 0, equipment = 0, material = 0;
                    items.forEach((item: any) => {
                      const qty = item.quantity || 0;
                      const cost = qty * (item.frozenUnitCost || item.unitCost || 0);
                      const t = (item.type || item.resourceType || "").toLowerCase();
                      if (t === "labor") labor += cost;
                      else if (t === "equipment") equipment += cost;
                      else material += cost;
                    });
                    const totalLEM = labor + equipment + material;
                    const gpPercent = previewTarget.grossProfitPercent || 0;
                    const gpDollars = previewTarget.grossProfitDollars || previewTarget.grossProfitAmount || 0;
                    const grandTotal = totalLEM + gpDollars;
                    // Group items
                    const groups: Record<string, any[]> = { labor: [], equipment: [], material: [] };
                    items.forEach((item: any) => {
                      const t = (item.type || item.resourceType || "").toLowerCase();
                      const key = t === "labor" ? "labor" : t === "equipment" ? "equipment" : "material";
                      groups[key].push(item);
                    });
                    const typeLabels: Record<string, string> = { labor: "Labor", equipment: "Equipment", material: "Material" };
                    return (
                      <div className="space-y-3">
                        <div>
                          <div className="font-medium text-muted-foreground mb-1.5">Added Items — LEM (Full Quote)</div>
                          <div className="max-h-[320px] overflow-y-auto pr-2 space-y-3">
                            {(["labor", "equipment", "material"] as const).map((key) => {
                              const groupItems = groups[key];
                              if (groupItems.length === 0) return null;
                              return (
                                <div key={key} className="mb-3 last:mb-0">
                                  <div className="text-lg font-semibold uppercase tracking-wider text-muted-foreground mb-2">{typeLabels[key]}</div>
                                  <table className="w-full text-xs border-collapse">
                                    <thead className="sticky top-0 bg-background z-10">
                                      <tr className="border-b border-muted-foreground/30">
                                        <th className="text-left py-1 pr-2 text-[10px] font-normal text-muted-foreground">Description</th>
                                        <th className="text-right py-1 px-1 w-[60px] text-[10px] font-normal text-muted-foreground">Qty/Hrs</th>
                                        <th className="text-center py-1 px-1 w-[50px] text-[10px] font-normal text-muted-foreground">Unit</th>
                                        <th className="text-right py-1 px-1 w-[70px] text-[10px] font-normal text-muted-foreground">Unit Rate</th>
                                        <th className="text-right py-1 pl-2 w-[80px] text-[10px] font-normal text-muted-foreground">Line Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-muted-foreground/20">
                                      {groupItems.map((item: any, i: number) => {
                                        const desc = item.label || item.description || "Item";
                                        const qty = item.quantity || 0;
                                        const rate = item.frozenUnitCost || item.unitCost || 0;
                                        const lineTotal = qty * rate;
                                        return (
                                          <tr key={i}>
                                            <td className="py-1 pr-2 truncate max-w-[140px]" title={desc}>{desc}</td>
                                            <td className="py-1 px-1 text-right tabular-nums">{qty}</td>
                                            <td className="py-1 px-1 text-center">{item.unit || ""}</td>
                                            <td className="py-1 px-1 text-right tabular-nums">${formatMoney(rate)}</td>
                                            <td className="py-1 pl-2 text-right tabular-nums font-medium">${formatMoney(lineTotal)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* High-level summary kept visible */}
                        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                          <div className="flex justify-between"><span>Labor:</span><span className="tabular-nums">${formatMoney(labor)}</span></div>
                          <div className="flex justify-between"><span>Equipment:</span><span className="tabular-nums">${formatMoney(equipment)}</span></div>
                          <div className="flex justify-between"><span>Material:</span><span className="tabular-nums">${formatMoney(material)}</span></div>
                          <div className="flex justify-between border-t pt-1 font-medium"><span>Total LEM:</span><span className="tabular-nums">${formatMoney(totalLEM)}</span></div>
                        </div>
                        <div className="text-xs">
                          <span className="font-medium text-muted-foreground">Gross Profit:</span> {gpPercent.toFixed(1)}% (${formatMoney(gpDollars)})
                        </div>
                        <div className="text-xs font-medium">
                          <span className="font-medium text-muted-foreground">Grand Total (Revenue):</span> ${formatMoney(grandTotal)}
                        </div>
                      </div>
                    );
                  })()}

                  {previewTarget.quoteType === "EPP" && previewTarget.eppLineItems && previewTarget.eppLineItems.length > 0 && (() => {
                    const items = previewTarget.eppLineItems;
                    const subtotal = items.reduce((s: number, it: any) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
                    const gpPercent = previewTarget.grossProfitPercent || 0;
                    const gpDollars = previewTarget.grossProfitDollars || previewTarget.grossProfitAmount || 0;
                    return (
                      <div className="space-y-3">
                        <div>
                          <div className="font-medium text-muted-foreground mb-1.5">Bid Items (EPP)</div>
                          <div className="max-h-[320px] overflow-y-auto pr-2">
                            <table className="w-full text-xs border-collapse">
                              <thead className="sticky top-0 bg-background z-10">
                                <tr className="border-b border-muted-foreground/30">
                                  <th className="text-left py-1 pr-2 text-[10px] font-normal text-muted-foreground">Description</th>
                                  <th className="text-right py-1 px-1 w-[60px] text-[10px] font-normal text-muted-foreground">Qty</th>
                                  <th className="text-center py-1 px-1 w-[50px] text-[10px] font-normal text-muted-foreground">Unit</th>
                                  <th className="text-right py-1 px-1 w-[70px] text-[10px] font-normal text-muted-foreground">Unit Price</th>
                                  <th className="text-right py-1 pl-2 w-[80px] text-[10px] font-normal text-muted-foreground">Line Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-muted-foreground/20">
                                {items.map((item: any, i: number) => {
                                  const desc = item.description || "Item";
                                  const qty = item.quantity || 0;
                                  const price = item.unitPrice || 0;
                                  const lineTotal = qty * price;
                                  return (
                                    <tr key={i}>
                                      <td className="py-1 pr-2 truncate max-w-[140px]" title={desc}>{desc}</td>
                                      <td className="py-1 px-1 text-right tabular-nums">{qty}</td>
                                      <td className="py-1 px-1 text-center">{item.unit || ""}</td>
                                      <td className="py-1 px-1 text-right tabular-nums">${formatMoney(price)}</td>
                                      <td className="py-1 pl-2 text-right tabular-nums font-medium">${formatMoney(lineTotal)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Totals summary box — same style as the Full preview */}
                        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                          <div className="flex justify-between"><span>Bid items:</span><span className="tabular-nums">{items.length}</span></div>
                          <div className="flex justify-between border-t pt-1 font-medium"><span>Bid Total:</span><span className="tabular-nums">${formatMoney(subtotal)}</span></div>
                        </div>
                        <div className="text-xs">
                          <span className="font-medium text-muted-foreground">Gross Profit:</span> {gpPercent.toFixed(1)}% (${formatMoney(gpDollars)})
                        </div>
                        <div className="text-xs font-medium">
                          <span className="font-medium text-muted-foreground">Grand Total (Revenue):</span> ${formatMoney(subtotal)}
                        </div>
                      </div>
                    );
                  })()}

                  {previewTarget.locked && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      This quote is locked — read-only.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          <DialogFooter className="flex-col sm:flex-col items-stretch gap-3">
            {/* PART A — Send a Draft bid out for acceptance */}
            {previewTarget?.status === "Draft" && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  className="text-white"
                  style={{ backgroundColor: "#EB3300" }}
                  onClick={() => previewTarget && sendForAcceptance(previewTarget)}
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Send for Acceptance
                </Button>
              </div>
            )}

            {/* PART B — Record the customer's decision on a quote out for acceptance */}
            {previewTarget?.status === "Ready for Approval" && (
              <div
                className="rounded-lg border p-3 space-y-2.5 text-left"
                style={{ borderColor: "#7D1424" }}
              >
                <div className="text-sm font-medium" style={{ color: "#7D1424" }}>
                  Record customer decision
                </div>
                <Input
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Optional note (e.g. 10% deposit received 6/20)"
                  className="h-9 text-sm"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    className="text-white"
                    style={{ backgroundColor: "#7D1424" }}
                    onClick={() => previewTarget && recordDecision(previewTarget, true, decisionNote)}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Mark Accepted
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-white"
                    style={{ color: "#7D1424", borderColor: "#7D1424" }}
                    onClick={() => previewTarget && recordDecision(previewTarget, false, decisionNote)}
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Mark Declined
                  </Button>
                </div>
              </div>
            )}

            {/* PART A — advance forward through the back half of the lifecycle */}
            {previewTarget && advanceNext(previewTarget.status) && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  className="text-white"
                  style={{ backgroundColor: "#7D1424" }}
                  onClick={() => previewTarget && setAdvanceTarget(previewTarget)}
                >
                  Advance
                  <ChevronRight className="h-4 w-4 mx-0.5" />
                  {advanceNext(previewTarget.status)}
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setPreviewTarget(null)}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance-status confirmation (forward-only, can't be undone) */}
      <Dialog open={!!advanceTarget} onOpenChange={(open) => !open && setAdvanceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance status?</DialogTitle>
            <DialogDescription>
              Move “{advanceTarget?.jobName || "Untitled"}” from {advanceTarget?.status} to{" "}
              {advanceTarget ? advanceNext(advanceTarget.status) : ""}? This moves the job
              forward and can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceTarget(null)}>
              Cancel
            </Button>
            <Button
              className="text-white"
              style={{ backgroundColor: "#7D1424" }}
              onClick={confirmAdvance}
            >
              Advance to {advanceTarget ? advanceNext(advanceTarget.status) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete quote?</DialogTitle>
            <DialogDescription>
              This will permanently remove “{deleteTarget?.jobName || "Untitled"}” ({deleteTarget?.quoteType}).
              The action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-center text-xs text-muted-foreground pt-2">
        Quotes are stored locally in your browser (key: pmz_saved_quotes). Opening a locked quote loads it read-only into the Project Pricer.
      </p>
    </div>
  );
}
