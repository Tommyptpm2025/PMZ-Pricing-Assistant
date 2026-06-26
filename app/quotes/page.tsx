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
import UpdateExportDialog from "@/components/UpdateExportDialog";
import { useRateStore } from "@/lib/rate-store";
import { buildLineLemDetail, buildLineRecipe, buildLineGateFailures, type LemRateCatalogs, type LemGateLineFailure } from "@/lib/lem-detail";
import { createJobFromQuote, loadJobs, saveJobs } from "@/lib/jobs";
import {
  getAllQuotes,
  deleteQuote,
  updateQuote,
  saveQuote,
} from "@/lib/quote-storage";
import { STATUS_FLOW, STATUS_LABELS, isStatusLocked, type QuoteStatus, type SavedQuote } from "@/lib/pmz-types";
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

// Status pill. In `trigger` mode it gains an inline chevron + hover affordance so the colored
// pill itself reads as a dropdown trigger (locked UI standard: the chevron IS the affordance).
function StatusBadge({ status, trigger = false }: { status: string; trigger?: boolean }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS["Draft"];
  const label = STATUS_LABELS[status as QuoteStatus] || status;
  return (
    <Badge
      variant="outline"
      className={cn("font-medium text-xs", trigger && "gap-1 cursor-pointer transition-[filter] group-hover:brightness-95")}
      style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.fg }}
    >
      {label}
      {trigger && <span aria-hidden className="leading-none" style={{ fontSize: 10 }}>▾</span>}
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
  // Accepted-handoff gate block: set when an accept attempt is refused because some bid lines
  // lack resolved LEM detail. Carries the quote id + the offending line descriptions.
  const [lemGateBlock, setLemGateBlock] = React.useState<{ quoteId: string; failures: LemGateLineFailure[] } | null>(null);
  // Quote ids that already have a Work Order (Job), so "Create Work Order" stays idempotent.
  const [workOrderQuoteIds, setWorkOrderQuoteIds] = React.useState<Set<string>>(new Set());

  // Path B preview: the Quotes-page "Preview" now routes through the SHARED Update Export dialog
  // (same gate as the Pricer's Path A) before showing the internal preview. These mirror the
  // Pricer's export-option state; the dialog is presentational and reads/writes them.
  const [showUpdateExport, setShowUpdateExport] = React.useState(false);
  const [pendingPreviewQuote, setPendingPreviewQuote] = React.useState<SavedQuote | null>(null);
  const [exportType, setExportType] = React.useState<'quote' | 'estimate'>('quote');
  const [selectedTermsId, setSelectedTermsId] = React.useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null);
  const [showBillTo, setShowBillTo] = React.useState(true);
  const [showJobSite, setShowJobSite] = React.useState(true);
  const [showPrimaryContact, setShowPrimaryContact] = React.useState(true);
  const [showAccessNotes, setShowAccessNotes] = React.useState(false);
  const [showGPS, setShowGPS] = React.useState(false);
  const [showQuantities, setShowQuantities] = React.useState(true);
  const [showUnits, setShowUnits] = React.useState(true);
  const [showPerUnitPrice, setShowPerUnitPrice] = React.useState(true);
  const [showLineItemPrices, setShowLineItemPrices] = React.useState(true);
  const [showLemDetail, setShowLemDetail] = React.useState(false);

  // Rate catalogs for resolving the per-line LEM breakdown in the preview (names/UOM/rates by id).
  const {
    laborRates, equipmentRates, materialRates, miscRates,
    getLaborCostPerHour, getEquipmentCostPerHour, getMaterialCostPerUnit, getMiscCostPerUnit,
  } = useRateStore();
  const lemCats: LemRateCatalogs = {
    laborRates, equipmentRates, materialRates, miscRates,
    getLaborCostPerHour, getEquipmentCostPerHour, getMaterialCostPerUnit, getMiscCostPerUnit,
  };

  // Load any saved company logo for the export dialog (client-only, mirrors the Pricer).
  React.useEffect(() => {
    try {
      const savedLogo = localStorage.getItem('pmz_quote_logo');
      if (savedLogo) setLogoDataUrl(savedLogo);
    } catch {}
  }, []);

  // "Preview" → open the Update Export dialog first (reset options to defaults), holding the
  // chosen quote until the user confirms.
  function openPreviewWithExport(quote: SavedQuote) {
    setPendingPreviewQuote(quote);
    setExportType('quote');
    setShowBillTo(true);
    setShowJobSite(true);
    setShowPrimaryContact(true);
    setShowAccessNotes(false);
    setShowGPS(false);
    setShowQuantities(true);
    setShowUnits(true);
    setShowPerUnitPrice(true);
    setShowLineItemPrices(true);
    setShowLemDetail(false);
    setShowUpdateExport(true);
  }

  // Update Export "Next" → close the dialog and reveal the (now gated) internal preview.
  function handlePreviewExportNext() {
    setShowUpdateExport(false);
    if (pendingPreviewQuote) setPreviewTarget(pendingPreviewQuote);
  }

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
    try {
      const ids = loadJobs().map((j) => j.quoteId).filter((id): id is string => !!id);
      setWorkOrderQuoteIds(new Set(ids));
    } catch {}
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

  function openQuote(
    quote: SavedQuote,
    focusTargets?: { lineIds: string[]; fields: { lineId: string; category: string; idx: number }[]; scrollTo?: string }
  ) {
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
      // Deep-link the Pricer to the failing LEM entries (only set from the gate-block Edit path);
      // a normal Edit clears it so it never lands on a stale target.
      if (focusTargets && (focusTargets.fields.length > 0 || focusTargets.lineIds.length > 0)) {
        localStorage.setItem("pmz_pricer_focus", JSON.stringify(focusTargets));
      } else {
        localStorage.removeItem("pmz_pricer_focus");
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

  // ---- Super-user status override (dev/test tool — PART A & B) ----

  // PART A — jump to ANY status (backward, forward, any). Reuses the shared transition
  // transform for the statusHistory append, then sets `locked` to match the CHOSEN status
  // (a super-user can move backward, so the normal forward-only latch doesn't apply here).
  function superUserSetStatus(quote: SavedQuote, newStatus: QuoteStatus) {
    // The Accepted handoff gate applies even to a super-user jump: an EPP quote can only become
    // Accepted (a future Work Order) once every bid line has complete LEM detail. All other
    // jumps (Declined, Work Order Active, Invoiced, Paid, …) stay ungated.
    if (newStatus === "Approved" && quote.quoteType === "EPP") {
      const failures = gateFailures(quote);
      if (failures.length > 0) {
        setLemGateBlock({ quoteId: quote.id, failures });
        setPreviewTarget(quote); // surface the block (the jump fires from the row dropdown)
        return;
      }
    }
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

  // Accepted-handoff gate: per-line detail of any EPP bid lines whose LEM detail is missing OR
  // incomplete — a line fails if it has no entries at all, or any entry has a zero / blank /
  // missing quantity or hours (which would yield a $0 recipe line). Each failure names the exact
  // offending entries (via the shared catalog resolver). Empty => every line is ready.
  function gateFailures(quote: SavedQuote): LemGateLineFailure[] {
    const out: LemGateLineFailure[] = [];
    (quote.eppLineItems || []).forEach((it, i) => {
      const desc = it.description?.trim() || `Line ${i + 1}`;
      const f = buildLineGateFailures(it, lemCats, desc);
      if (f) out.push(f);
    });
    return out;
  }

  // PART B — record the customer's decision on a quote that is out for acceptance.
  function recordDecision(quote: SavedQuote, accepted: boolean, note: string) {
    if (quote.status !== "Ready for Approval") return;
    const next: QuoteStatus = accepted ? "Approved" : "Declined";
    if (!canTransition("Ready for Approval", next)) return;
    // Accepted handoff rule: an EPP quote can only become Accepted (a future Work Order) once
    // every bid line has complete LEM detail. Block + surface the gaps in the preview dialog.
    if (accepted && quote.quoteType === "EPP") {
      const failures = gateFailures(quote);
      if (failures.length > 0) {
        setLemGateBlock({ quoteId: quote.id, failures });
        setPreviewTarget(quote); // open/keep the dialog so the block is visible (row-dropdown path too)
        return;
      }
    }
    const now = new Date().toISOString();
    const updated = applyStatusChange(quote, next, {
      decidedAt: now,
      decisionNote: note.trim() || undefined,
    });
    setDecisionNote("");
    setLemGateBlock(null);
    setPreviewTarget((prev) => (prev && prev.id === quote.id ? updated : prev));
  }

  // Create a Work Order (Job) from an Accepted EPP quote: snapshot the bid items + aggregate the
  // per-line LEM into a numeric recipe, persist via the jobs store, then route to the Jobs tab.
  // Idempotent — one job per accepted quote (guarded by workOrderQuoteIds / the stored quoteId).
  function createWorkOrder(quote: SavedQuote) {
    if (quote.status !== "Approved" || quote.quoteType !== "EPP") return;
    if (workOrderQuoteIds.has(quote.id)) return;
    const items = quote.eppLineItems || [];
    const job = createJobFromQuote({
      quoteId: quote.id,
      jobName: quote.jobName,
      workTypeName: quote.workType || "",
      salesperson: quote.salesperson || "",
      contractValue: quote.grandTotal ?? quote.totalRevenue ?? 0,
      bidItems: items.map((it) => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
      })),
      recipe: items.flatMap((it) => buildLineRecipe(it, lemCats)),
      quoteJobSiteAddress: quote.jobSiteAddress || quote.customerDetails?.jobSiteAddress,
    });
    saveJobs([...loadJobs(), job]);
    setWorkOrderQuoteIds((prev) => new Set(prev).add(quote.id));
    router.push("/jobs");
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
                    {STATUS_LABELS[st]}
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
          <Table className="w-full table-fixed">
            {/* Fixed column widths so all 8 columns fit a 1280px+ viewport without horizontal
                scroll. Customer/Job Name get the most room; Status/Actions stay wide enough that
                their pills never truncate. */}
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="whitespace-nowrap">Customer</TableHead>
                <TableHead className="whitespace-nowrap">Job Name</TableHead>
                <TableHead className="whitespace-nowrap">Work Type</TableHead>
                <TableHead className="whitespace-nowrap">Salesperson</TableHead>
                <TableHead className="text-right whitespace-nowrap">Total Revenue</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right pr-4 whitespace-nowrap">Actions</TableHead>
                <TableHead className="whitespace-nowrap">Last Updated</TableHead>
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
                    <TableCell className="font-medium">
                      {/* Poka-yoke: clickable customer opens this quote in the Pricer (edit mode),
                          same as the Actions → Edit (openQuote). Underlined + TPM red on hover. */}
                      <button
                        type="button"
                        onClick={() => openQuote(quote)}
                        title="Open in Project Pricer"
                        className="block w-full truncate text-left underline underline-offset-2 cursor-pointer outline-none hover:text-[#EB3300] focus-visible:text-[#EB3300]"
                      >
                        {quote.customerName || quote.customer || "—"}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm truncate">{quote.jobName || "—"}</TableCell>
                    <TableCell className="text-sm truncate">{quote.workType || "—"}</TableCell>
                    <TableCell className="text-sm truncate">{quote.salesperson || "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                      ${formatMoney(quote.totalRevenue)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {/* Status pill IS the dropdown trigger (locked UI standard: colored pill +
                          inline chevron, no separate "Change…" button). An invisible native <select>
                          overlays the pill and carries the exact same action options + handlers as
                          before — UI only, no behavior change. */}
                      <div className="relative inline-flex items-center group">
                        <StatusBadge status={quote.status} trigger />
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
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        >
                          <option value="" disabled>Change…</option>
                          {quote.status === "Draft" && (
                            <option value="act:send">Send for Acceptance</option>
                          )}
                          {quote.status === "Ready for Approval" && (
                            <>
                              <option value="act:accept">Mark Accepted</option>
                              <option value="act:decline">Mark Declined</option>
                            </>
                          )}
                          {advanceNext(quote.status) && (
                            <option value="act:advance">Advance to {STATUS_LABELS[advanceNext(quote.status)!]}</option>
                          )}
                          {isSuperUser && (
                            <optgroup label="──  SUPER USER  ──">
                              {ALL_STATUSES.filter((s) => s !== quote.status).map((s) => (
                                <option key={`jump-${s}`} value={`jump:${s}`}>Jump → {STATUS_LABELS[s]}</option>
                              ))}
                              {statusBack(quote.status) && (
                                <option value="su-back">◄ Back to {STATUS_LABELS[statusBack(quote.status)!]}</option>
                              )}
                              <option value="su-reset">↺ Reset to Draft</option>
                            </optgroup>
                          )}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-3 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {/* Status actions now live in the Change dropdown (status column). */}
                        {/* Secondary actions — custom pill trigger matching the status pill:
                            a styled [Actions ▾] button with an invisible native <select> overlay
                            carrying the same preview / edit / duplicate handlers. UI only. */}
                        <div className="relative inline-flex items-center group">
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden
                            className="inline-flex items-center gap-1 h-7 rounded border px-1.5 text-xs bg-white cursor-pointer transition-[filter] group-hover:brightness-95"
                            style={{ color: "#333333", borderColor: "#7D1424" }}
                          >
                            Actions
                            <span aria-hidden className="leading-none" style={{ fontSize: 10 }}>▾</span>
                          </button>
                          <select
                            value=""
                            aria-label="Quote actions"
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "preview") openPreviewWithExport(quote);
                              else if (v === "edit") openQuote(quote);
                              else if (v === "duplicate") duplicateQuote(quote);
                            }}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          >
                            <option value="" disabled>Actions…</option>
                            <option value="preview">Preview</option>
                            <option value="edit">Edit</option>
                            <option value="duplicate">Duplicate</option>
                          </select>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="px-1 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(quote); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums truncate">
                      {formatDate(quote.updatedAt || quote.createdAt)}
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

  // The Accepted gate is currently blocking the quote shown in the preview dialog — drives the
  // entry-level callout and the "Edit in Pricer (primary) / Send muted" emphasis swap below.
  const gateBlockActive = !!(lemGateBlock && previewTarget && lemGateBlock.quoteId === previewTarget.id);

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">Quotes</h1>
            <Badge variant="outline" className="text-[10px] tracking-wider">LIBRARY</Badge>
          </div>
          <p className="mt-1 text-muted-foreground max-w-2xl">
            All saved EPP quotes from the Project Pricer. Use filters, change status, preview or edit, duplicate or delete.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh from storage
        </Button>
      </div>

      {/* EPP Quotes */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2 px-0.5">
          <h2 className="font-semibold tracking-tight text-lg">EPP Quotes</h2>
          <div className="text-sm text-muted-foreground">
            {filteredEpp.length} shown / {eppBase.length} total
          </div>
        </div>
        {renderFilters("epp")}
        {renderTable(filteredEpp, "EPP")}
      </div>

      {/* Full Quotes — intentionally removed from the visible page flow (EPP-only).
          The Full-quote filter state, memos (fullBase / filteredFull / fullWorkTypes) and the
          "full" branches in renderFilters/renderTable are retained for clean reuse if it returns. */}

      {/* Preview centered Dialog (modal) */}
      {/* Update Export gate — shared dialog; on Next we reveal the internal preview below */}
      <UpdateExportDialog
        open={showUpdateExport}
        onOpenChange={setShowUpdateExport}
        onNext={handlePreviewExportNext}
        exportType={exportType}
        setExportType={setExportType}
        selectedTermsId={selectedTermsId}
        setSelectedTermsId={setSelectedTermsId}
        logoDataUrl={logoDataUrl}
        setLogoDataUrl={setLogoDataUrl}
        showBillTo={showBillTo}
        setShowBillTo={setShowBillTo}
        showJobSite={showJobSite}
        setShowJobSite={setShowJobSite}
        showPrimaryContact={showPrimaryContact}
        setShowPrimaryContact={setShowPrimaryContact}
        showAccessNotes={showAccessNotes}
        setShowAccessNotes={setShowAccessNotes}
        showGPS={showGPS}
        setShowGPS={setShowGPS}
        showQuantities={showQuantities}
        setShowQuantities={setShowQuantities}
        showUnits={showUnits}
        setShowUnits={setShowUnits}
        showPerUnitPrice={showPerUnitPrice}
        setShowPerUnitPrice={setShowPerUnitPrice}
        showLineItemPrices={showLineItemPrices}
        setShowLineItemPrices={setShowLineItemPrices}
        showLemDetail={showLemDetail}
        setShowLemDetail={setShowLemDetail}
      />

      <Dialog open={!!previewTarget} onOpenChange={(open) => { if (!open) { setPreviewTarget(null); setDecisionNote(""); setLemGateBlock(null); } }}>
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
              Read-only view. Use “Edit in Pricer” below to load this quote into the Project Pricer for changes.
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
                                        <th className="text-left py-1 pr-2 text-xs font-normal text-muted-foreground">Description</th>
                                        <th className="text-right py-1 px-1 w-[60px] text-xs font-normal text-muted-foreground">Qty/Hrs</th>
                                        <th className="text-center py-1 px-1 w-[50px] text-xs font-normal text-muted-foreground">Unit</th>
                                        <th className="text-right py-1 px-1 w-[70px] text-xs font-normal text-muted-foreground">Unit Rate</th>
                                        <th className="text-right py-1 pl-2 w-[80px] text-xs font-normal text-muted-foreground">Line Total</th>
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
                                  <th className="text-left py-1 pr-2 text-xs font-normal text-muted-foreground">Description</th>
                                  <th className="text-right py-1 px-1 w-[60px] text-xs font-normal text-muted-foreground">Qty</th>
                                  <th className="text-center py-1 px-1 w-[50px] text-xs font-normal text-muted-foreground">Unit</th>
                                  <th className="text-right py-1 px-1 w-[70px] text-xs font-normal text-muted-foreground">Unit Price</th>
                                  <th className="text-right py-1 pl-2 w-[80px] text-xs font-normal text-muted-foreground">Line Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-muted-foreground/20">
                                {items.map((item: any, i: number) => {
                                  const desc = item.description || "Item";
                                  const qty = item.quantity || 0;
                                  const price = item.unitPrice || 0;
                                  const lineTotal = qty * price;
                                  const lemDetail = showLemDetail ? buildLineLemDetail(item, lemCats) : null;
                                  return (
                                    <React.Fragment key={i}>
                                      <tr>
                                        <td className="py-1 pr-2 truncate max-w-[140px]" title={desc}>{desc}</td>
                                        <td className="py-1 px-1 text-right tabular-nums">{qty}</td>
                                        <td className="py-1 px-1 text-center">{item.unit || ""}</td>
                                        <td className="py-1 px-1 text-right tabular-nums">${formatMoney(price)}</td>
                                        <td className="py-1 pl-2 text-right tabular-nums font-medium">${formatMoney(lineTotal)}</td>
                                      </tr>
                                      {lemDetail && lemDetail.hasAny && (
                                        <tr>
                                          <td colSpan={5} className="py-1 pl-3 pr-2 bg-muted/30">
                                            {lemDetail.sections.map((sec, sIdx) => (
                                              <div key={sIdx} className="mb-1 last:mb-0">
                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{sec.title}</div>
                                                {sec.rows.map((row, rIdx) => (
                                                  <div key={rIdx} className="text-[11px] text-muted-foreground pl-2">{row.text}</div>
                                                ))}
                                              </div>
                                            ))}
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
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
            {/* Accepted-handoff gate: name the exact incomplete entries blocking the transition */}
            {gateBlockActive && lemGateBlock && (
              <div
                className="rounded-lg border p-3 text-left text-xs"
                style={{ borderColor: "#EB3300", color: "#9F1239", backgroundColor: "#FFF5F3" }}
              >
                <div className="font-medium mb-1.5" style={{ color: "#EB3300" }}>
                  Can’t accept yet — fix these entries before this quote can become a Work Order:
                </div>
                <div className="space-y-1.5">
                  {lemGateBlock.failures.map((f, i) => (
                    <div key={i}>
                      <div className="font-medium">
                        Line “{f.description}” — {f.noEntries ? "no LEM detail entered" : "incomplete entries:"}
                      </div>
                      {!f.noEntries && (
                        <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                          {f.issues.map((is, j) => (
                            <li key={j}>{is.category}: {is.name} ({is.issue})</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 italic text-muted-foreground">Use “Edit in Pricer” below to fix these entries.</div>
              </div>
            )}

            {/* PART A — Send a Draft bid out for acceptance (muted while a gate block is active,
                so "Edit in Pricer" reads as the obvious next step) */}
            {previewTarget?.status === "Draft" && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  className="text-white"
                  style={{ backgroundColor: gateBlockActive ? "#D1A6A0" : "#EB3300" }}
                  disabled={gateBlockActive}
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

            {/* Accepted handoff — turn an Accepted EPP quote into a Work Order (Job) */}
            {previewTarget?.status === "Approved" && previewTarget.quoteType === "EPP" && (
              <div className="flex items-center justify-end gap-2">
                {workOrderQuoteIds.has(previewTarget.id) ? (
                  <span className="text-xs text-muted-foreground">Work Order created ✓</span>
                ) : (
                  <Button
                    className="text-white"
                    style={{ backgroundColor: "#7D1424" }}
                    onClick={() => previewTarget && createWorkOrder(previewTarget)}
                  >
                    Create Work Order
                  </Button>
                )}
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
                  {STATUS_LABELS[advanceNext(previewTarget.status)!]}
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button
                variant={gateBlockActive ? "default" : "secondary"}
                className={gateBlockActive ? "text-white" : undefined}
                style={gateBlockActive ? { backgroundColor: "#EB3300" } : undefined}
                onClick={() => {
                  const q = previewTarget;
                  // From a gate block, deep-link the Pricer to every failing entry: expand each
                  // failing line, highlight each incomplete field, and scroll to the first line.
                  const targets =
                    gateBlockActive && lemGateBlock
                      ? {
                          lineIds: Array.from(new Set(lemGateBlock.failures.map((f) => f.lineId).filter(Boolean))),
                          fields: lemGateBlock.failures.flatMap((f) =>
                            f.issues.map((is) => ({ lineId: f.lineId, category: is.catKey, idx: is.idx }))
                          ),
                          scrollTo: lemGateBlock.failures[0]?.lineId,
                        }
                      : undefined;
                  setPreviewTarget(null);
                  setLemGateBlock(null);
                  if (q) openQuote(q, targets);
                }}
              >
                Edit in Pricer
              </Button>
              <Button variant="outline" onClick={() => { setPreviewTarget(null); setLemGateBlock(null); }}>Close</Button>
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
              Move “{advanceTarget?.jobName || "Untitled"}” from {advanceTarget ? STATUS_LABELS[advanceTarget.status] : ""} to{" "}
              {advanceTarget ? STATUS_LABELS[advanceNext(advanceTarget.status)!] : ""}? This moves the job
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
              Advance to {advanceTarget ? STATUS_LABELS[advanceNext(advanceTarget.status)!] : ""}
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
