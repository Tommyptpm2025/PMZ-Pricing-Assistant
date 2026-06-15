"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import QuotePreview from "./QuotePreview";
import {
  TrendingUp,
  Plus,
  Trash2,
  RotateCcw,
  Calculator,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calculateLaborRate,
  type LaborRateInputs,
} from "@/lib/calculations";
import type { SavedQuote as PMZSavedQuote, LineItem, LemItem, Bucket, Customer } from "@/lib/pmz-types";
import { useRateStore } from "@/lib/rate-store";
import { getAllTerms, type TermsBlock } from "@/lib/terms";

// Stable ID generator (avoids Date.now/Math.random during SSR/hydration for client-only data)
let stableIdCounter = 0;
function generateStableId(prefix: string = 'item') {
  return `${prefix}_${++stableIdCounter}`;
}

// Types for this page (Level 1 - simple digital paper & pencil)
interface WorkTypeTier {
  low: number;
  high: number | null;
  targetGpPercent: number;
  label?: string;
}

interface WorkType {
  id: string;
  name: string;
  tiers: WorkTypeTier[];
}

// Bid Items — the heart of the paper-style estimate (revenue side only in Level 1)
interface BidItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // break-even unit cost (top of line); defaults to cost ÷ qty, editable
  priceOverridden?: boolean; // true once the user manually edits the top price (stops auto-seed from cost)
  // EPP-only real per-line-item costing details (isolated from LEM) — now supports multiple entries per category
  laborEntries?: Array<{
    rateId?: string;
    labor?: { id: string; role: string; burdenedHourlyRate: number };
    hours?: number;
    rate?: number;
    // Stage 1: lightweight tag marking this line as populated from a crew (for grouped render + group removal)
    group?: { id: string; crewId: string; name: string };
  }>;
  equipmentEntries?: Array<{
    rateId?: string;
    hours?: number;
    rate?: number;
    group?: { id: string; crewId: string; name: string };
  }>;
  materialEntries?: Array<{
    rateId?: string;
    quantity?: number;
  }>;
  miscellaneousEntries?: Array<{
    rateId?: string;
    description?: string;
    quantity?: number;
    rate?: number;
  }>;
  crewUsages?: Array<{
    crewId: string;
    hours?: number;
  }>;
  realCost?: number;
  realGrossProfitPercent?: number;
}

interface CurrentEstimate {
  jobName: string;
  workTypeName: string;
  salesperson: string;
  estimatedRevenue: number; // the total they are bidding (used for tier + target comparison)
  bidItems: BidItem[];
  customerName: string;
  customerId?: string;
  billingAddress?: string | any;
  jobSiteAddress?: string | any;
}

interface RealLEMItem {
  id: string;
  type: 'labor' | 'equipment' | 'material';
  profileId: string;
  description: string;
  quantity: number;
  unitCost: number;
}

interface SavedQuote {
  id: string;
  jobName: string;
  customer: string;
  customerName?: string;
  customerId?: string;
  workType: string;
  salesperson: string;
  quoteType: "EPP" | "Full";
  eppLineItems: BidItem[];
  proLemItems: RealLEMItem[];
  targetMargin: number;
  totalRevenue: number;
  status: string;
  locked: boolean;
  rateProfileSnapshot: {
    labor: number;
    equipment: number;
    material: number;
  };
  createdAt: string;
  updatedAt: string;
}

const ESTIMATE_STORAGE = "pmz_current_estimate_v1";

const COMMON_UNITS = [
  "EA", "SF", "SY", "LF", "TON", "CY", "GAL", "BAG", "LS", "HR",
  "DAY", "WEEK", "MO", "SQ", "CF", "LB", "PC", "RL", "SH", "PL", "YD"
];

const SALESPERSON_OPTIONS = ["Owner", "Scott Sinnott", "Mike Johnson", "Alex Rivera"];

// Consistent currency formatter: always exactly 2 decimal places + thousands separators
function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "$0.00";
  }
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Customer-facing rounding (presentation/export only — never touches saved/internal economics).
// Round line totals to the nearest QUOTE_ROUND_TO dollars; the grand total sums the ROUNDED lines.
const QUOTE_ROUND_TO = 1; // 1 = whole dollars; can become 5 / 25 later
function roundToQuote(amount: number): number {
  const step = QUOTE_ROUND_TO > 0 ? QUOTE_ROUND_TO : 1;
  return Math.round((amount || 0) / step) * step;
}
// Whole-dollar formatter (no cents) for customer-facing line/grand totals.
function formatWhole(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "0";
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
// Format a customer address object into non-empty display lines (street, street2, "City, ST ZIP").
function formatAddressLines(addr: any): string[] {
  if (!addr) return [];
  if (typeof addr === "string") return addr.trim() ? [addr.trim()] : [];
  const cityStateZip = [
    [addr.city, addr.state].filter(Boolean).join(", "),
    addr.zip,
  ].filter(Boolean).join(" ");
  return [addr.street, addr.street2, cityStateZip]
    .map((l) => (l || "").toString().trim())
    .filter(Boolean);
}

// --- Independent save helpers for EPP and Pro (using separate localStorage keys) ---

function saveEPPQuote(data: {
  jobName: string;
  workType: string;
  salesperson: string;
  lineItems: BidItem[];
  totalRevenue: number;
}): void {
  try {
    const key = "pmz_epp_quotes";
    const raw = localStorage.getItem(key);
    const quotes: any[] = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();
    const quote = {
      id: `epp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      jobName: data.jobName || "Untitled",
      workType: data.workType || "",
      salesperson: data.salesperson || "",
      lineItems: data.lineItems.map((item) => ({ ...item })),
      totalRevenue: data.totalRevenue,
      createdAt: now,
      updatedAt: now,
    };
    quotes.push(quote);
    localStorage.setItem(key, JSON.stringify(quotes));
  } catch {
    // fail silently (storage issues)
  }
}

function saveProQuote(data: {
  lemItems: RealLEMItem[];
  grossProfitPercent: number;
  totalRealLEM: number;
  grandTotal: number;
}): void {
  try {
    const key = "pmz_pro_quotes";
    const raw = localStorage.getItem(key);
    const quotes: any[] = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();
    const quote = {
      id: `pro_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      lemItems: data.lemItems.map((item) => ({ ...item })),
      grossProfitPercent: data.grossProfitPercent,
      totalRealLEM: data.totalRealLEM,
      grandTotal: data.grandTotal,
      createdAt: now,
      updatedAt: now,
    };
    quotes.push(quote);
    localStorage.setItem(key, JSON.stringify(quotes));
  } catch {
    // fail silently (storage issues)
  }
}

export default function ProjectPricerPage() {
  // Loaded from other pillars
  const [workTypes, setWorkTypes] = React.useState<WorkType[]>([]);

  // Pull Labor/Equipment/Material options from the centralized rate store (reliable LS + cross-tab sync)
  const {
    laborRates: laborProfiles,
    equipmentRates: equipmentProfiles,
    materialRates: materialProfiles,
    laborRates,
    equipmentRates,
    materialRates,
    miscRates,
    getLaborCostPerHour,
    getEquipmentCostPerHour,
    getMaterialCostPerUnit,
    getMiscCostPerUnit,
  } = useRateStore();

  // Correct labor burdened hourly rate using the imported calculateLaborRate (fixes broken labor calc in EPP panel)
  const getLaborBurdenedRate = (id: string): number => {
    if (!id) return 0;
    const profile = laborRates.find((r: any) => r.id === id);
    if (!profile) return 0;
    try {
      const res = calculateLaborRate(profile as LaborRateInputs);
      return res.trueCostPerBillableHour || 0;
    } catch { return 0; }
  };

  // Customers for selector - initialize empty; load from localStorage in useEffect (client-only, post-hydration)
  // to prevent hydration mismatch (server render always sees no localStorage).
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = React.useState(false);
  const customerSelectRef = React.useRef<HTMLDivElement>(null);
  const customerDropdownRef = React.useRef<HTMLDivElement>(null);
  const [customerDropdownPosition, setCustomerDropdownPosition] = React.useState({ top: 0, left: 0, width: 0 });

  // Controlled customer selector state using customerId + customerName.
  // Initialize to empty defaults (no localStorage read here) so server HTML matches client first render.
  // Load/restore happens in useEffect after hydration for EPP persistence across tabs.
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = React.useState<string | null>(null);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = React.useState(-1);

  const filteredCustomers = React.useMemo(() => {
    return customers
      .filter((c) =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase())
      )
      .slice(0, 10);
  }, [customers, customerSearch]);

  React.useEffect(() => {
    if (highlightedCustomerIndex >= 0 && customerDropdownOpen && customerDropdownRef.current) {
      const items = customerDropdownRef.current.querySelectorAll('.customer-option');
      const el = items[highlightedCustomerIndex] as HTMLElement | undefined;
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }
  }, [highlightedCustomerIndex, customerDropdownOpen]);

  // Current estimate (only revenue side in Level 1)
  // Initialize to fixed default (no localStorage, no browser APIs) so that SSR HTML always matches
  // the first client render (prevents hydration mismatch for EPP bid items / costing panels).
  // Persisted LS load happens in useEffect (client only, after mount).
  const [estimate, setEstimate] = React.useState<CurrentEstimate>({
    jobName: "",
    workTypeName: "",
    salesperson: "",
    estimatedRevenue: 24500,
    bidItems: [],
    customerName: "",
    customerId: "",
    billingAddress: "",
    jobSiteAddress: "",
  });

  const currentCustomer = React.useMemo(() => {
    // The customer Select is keyed by NAME (it stores estimate.customerName, not an id), so resolve
    // by id first, then fall back to matching the record by name — otherwise the full record (address
    // + contact) never reaches the quote and only the bare name shows.
    const id = selectedCustomerId || estimate.customerId;
    const name = (selectedCustomerName || estimate.customerName || "").trim().toLowerCase();
    return (
      (id ? customers.find((c: any) => c.id === id) : null) ||
      (name ? customers.find((c: any) => (c.name || "").trim().toLowerCase() === name) : null) ||
      null
    );
  }, [customers, selectedCustomerId, estimate.customerId, selectedCustomerName, estimate.customerName]);

  // For the educational "See True Job Costs" dialog (kept for links)
  const [showCostDialog, setShowCostDialog] = React.useState(false);
  const [showUpdateExport, setShowUpdateExport] = React.useState(false);
  const [exportType, setExportType] = React.useState<'quote' | 'estimate'>('quote');
  const [showQuantities, setShowQuantities] = React.useState(true);
  const [showUnits, setShowUnits] = React.useState(true);
  const [showPerUnitPrice, setShowPerUnitPrice] = React.useState(true);
  const [showLineItemPrices, setShowLineItemPrices] = React.useState(true);

  // Customer & Location Information options for Update Export dialog (Phase 1)
  const [showBillTo, setShowBillTo] = React.useState(true);
  const [showJobSite, setShowJobSite] = React.useState(true);
  const [showPrimaryContact, setShowPrimaryContact] = React.useState(true);
  const [showAccessNotes, setShowAccessNotes] = React.useState(false);
  const [showGPS, setShowGPS] = React.useState(false);

  // Terms & Conditions selection for Update Export dialog (Stage 2)
  const [selectedTermsId, setSelectedTermsId] = React.useState<string | null>(null);

  // Holds the normalized EPP quote data from buildQuoteData for the preview
  const [eppQuoteData, setEppQuoteData] = React.useState<any>(null);

  // Frozen terms text loaded from a reopened saved quote (for Stage 4, to use original terms in preview/footer)
  const [loadedQuoteTermsText, setLoadedQuoteTermsText] = React.useState<string | null>(null);

  // Logo upload support for PDF (base64 in localStorage for simplicity)
  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const savedLogo = localStorage.getItem('pmz_quote_logo');
      if (savedLogo) {
        setLogoDataUrl(savedLogo);
      }
    } catch {}
  }, []);

  // Detect if this is a print preview tab (opened via ?print=quote) and load stashed data from sessionStorage
  const [isPrintPreview, setIsPrintPreview] = React.useState(false);
  const [printQuoteData, setPrintQuoteData] = React.useState<any>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') === 'quote') {
      setIsPrintPreview(true);
      try {
        const stored = sessionStorage.getItem('pmz_epp_print_quote');
        if (stored) {
          const data = JSON.parse(stored);
          setPrintQuoteData(data);
        }
      } catch (e) {
        console.error('Failed to load print quote data from sessionStorage', e);
      }
    }
  }, []);

  // Toggle for the new LEM breakdown (the activated feature)
  const [showLEM, setShowLEM] = React.useState(false);

  // Toggle for the second "full real" LEM breakdown using actual saved profiles
  const [showRealLEM, setShowRealLEM] = React.useState(false);

  // Read-only mode when a locked (Approved) quote is opened from the Quotes tab
  const [isReadOnly, setIsReadOnly] = React.useState(false);

  // Interactive real LEM lines for the Pro green section (pulls from actual saved profiles)
  const [realLEMItems, setRealLEMItems] = React.useState<RealLEMItem[]>([]);

  // Transient state for the three adder controls in the green Pro section
  const [pendingLabor, setPendingLabor] = React.useState<any>(null);
  const [pendingLaborQty, setPendingLaborQty] = React.useState(0);
  const [pendingEquipId, setPendingEquipId] = React.useState("");
  const [pendingEquipQty, setPendingEquipQty] = React.useState(0);
  const [pendingMatId, setPendingMatId] = React.useState("");
  const [pendingMatQty, setPendingMatQty] = React.useState(0);

  // Per-row editing strings for the Qty/Hrs inputs in Added Items (enables full text editing + clearing while keeping live numbers)
  const [qtyEdits, setQtyEdits] = React.useState<Record<string, string>>({});
  // Per-row editing string for Line Total in EPP (to support live bidirectional recalc as user types in total, updating unit rate immediately)
  const [lineTotalEdits, setLineTotalEdits] = React.useState<Record<string, string>>({});
  // Which EPP bid items have their costing details panel open
  const [eppCostingOpen, setEppCostingOpen] = React.useState<Record<string, boolean>>({});
  // Collapsed state for crew group cards in the Per-Line Real Costing panel, keyed by group id (default expanded)
  const [collapsedCrewGroups, setCollapsedCrewGroups] = React.useState<Record<string, boolean>>({});
  // For auto-focusing newly added costing entry inputs
  const [pendingCostingFocus, setPendingCostingFocus] = React.useState(null); // {itemId: string, category: 'labor'|'equipment'|'material', idx: number }
  // For showing the target margin result bar after clicking Apply, per item
  const [costingTargetResult, setCostingTargetResult] = React.useState<Record<string, {requiredLineTotal: number, requiredGP: number, target: number}>>({});

  // Edit strings for adder qty fields to support full decimal typing without snap
  const [pendingLaborQtyEdit, setPendingLaborQtyEdit] = React.useState<string>("");
  const [pendingEquipQtyEdit, setPendingEquipQtyEdit] = React.useState<string>("");
  const [pendingMatQtyEdit, setPendingMatQtyEdit] = React.useState<string>("");

  // Crews for EPP per-line costing (populated from Crew Builder under Resources; loaded post-mount for hydration safety)
  const [crews, setCrews] = React.useState<any[]>([]);

  // Editable Gross Profit % for the Grand Total section (user enters %, GP$ and Grand Total computed)
  const [editableGrossProfitPercent, setEditableGrossProfitPercent] = React.useState(0);
  const [gpPercentEdit, setGpPercentEdit] = React.useState<string>("");

  // Collapsed state for BID ITEMS section (EPP), persisted in localStorage, default expanded (false)
  // Init to constant false (matches SSR); load from LS in useEffect only (client post-hydration).
  const [bidItemsCollapsed, setBidItemsCollapsed] = React.useState(false);

  // Client-only stable ID generator (using ref so increments only on client post-hydration calls).
  // Used for new EPP line items (bidItems) and EPP quote saves. Guarantees no unstable ID
  // generation (no Date.now/Math.random/counter drift) can affect server render / hydration.
  // The old module-level generateStableId remains for any dead code paths.
  const stableIdRef = React.useRef(0);
  function generateClientId(prefix: string = 'item') {
    return `${prefix}_${++stableIdRef.current}`;
  }

  // Collapsed state for Full Real LEM Breakdown (Pro View) section, persisted in localStorage, default expanded (false)
  // Init to constant false (matches SSR); load from LS in useEffect only (client post-hydration).
  const [proViewCollapsed, setProViewCollapsed] = React.useState(false);

  // Success message for quote saves (auto-dismiss banner, shared for EPP/Pro)
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  // Track if user has attempted to save (to show inline validation errors only after interaction)
  const [saveAttempted, setSaveAttempted] = React.useState(false);

  // Per-section save attempts for independent validation
  const [eppSaveAttempted, setEppSaveAttempted] = React.useState(false);
  const [proSaveAttempted, setProSaveAttempted] = React.useState(false);

  // Brief saving states for visual feedback (disable button briefly after click)
  const [isSavingEPP, setIsSavingEPP] = React.useState(false);
  const [isSavingFull, setIsSavingFull] = React.useState(false);

  // Context-aware has-items for buttons (EPP vs Pro separate)
  const eppHasItems = estimate.bidItems && estimate.bidItems.length > 0;
  const proHasItems = realLEMItems && realLEMItems.length > 0;

  // Load work types, saved estimate, and rate profiles from other pillars
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("pmz_work_types_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.workTypes)) setWorkTypes(parsed.workTypes);
      }
    } catch {}

    // Rate profiles now come from the centralized useRateStore hook (see top of component).
    // The hook handles defensive load, validation, LS keys, cross-component sync via events, and logs.
    // No direct pmz_*_rates reads or sets here.

    // Load customers on mount so the dropdown/combobox is populated from the Customers tab.
    try {
      const raw = localStorage.getItem("pmz_customers");
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        const loaded = parsed.map((c: any) => ({
          ...c,
          createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
          updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
        }));
        setCustomers(loaded);
      }
    } catch {}

    // Load persisted EPP estimate (incl. bidItems for the EPP section and per-line costing panels).
    // This runs only in useEffect (client, after hydration) so server-rendered HTML (always default/empty)
    // matches the initial client render. Fixes hydration mismatch.
    try {
      const raw = localStorage.getItem(ESTIMATE_STORAGE);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && (saved.bidItems || saved.eppLineItems || saved.jobName || saved.customerId || saved.customerName || saved.customer)) {
          let custId = saved.customerId || "";
          const nameForLookup = saved.customerName || saved.customer || "";
          if (!custId && nameForLookup) {
            // backward compat: lookup by name if only old customer name present
            try {
              const rawC = localStorage.getItem("pmz_customers");
              if (rawC) {
                const custs: any[] = JSON.parse(rawC);
                const match = custs.find((c: any) => c.name === nameForLookup);
                if (match?.id) custId = match.id;
              }
            } catch {}
          }
          setEstimate({
            jobName: saved.jobName || "",
            workTypeName: saved.workTypeName || saved.workType || saved.workTypeId || "",
            salesperson: saved.salesperson || "",
            estimatedRevenue: saved.estimatedRevenue || saved.totalRevenue || 20000,
            bidItems: saved.bidItems || saved.eppLineItems || [],
            customerName: saved.customerName || saved.customer || "",
            customerId: custId,
            billingAddress: saved.billingAddress || "",
            jobSiteAddress: saved.jobSiteAddress || "",
          });
          // Seed the client ID counter from loaded bid item IDs. This ensures that
          // generateClientId() will never produce duplicate IDs for newly added rows
          // (e.g. after a page refresh or loading a previous quote). Duplicate IDs
          // cause React to treat rows as the same, leading to cross-row value syncing.
          try {
            const loaded = saved.bidItems || saved.eppLineItems || [];
            let maxNum = 0;
            loaded.forEach((b: any) => {
              if (b && b.id) {
                const m = String(b.id).match(/bid_(\d+)/);
                if (m) {
                  maxNum = Math.max(maxNum, parseInt(m[1], 10) || 0);
                }
              }
            });
            stableIdRef.current = Math.max(stableIdRef.current || 0, maxNum);
          } catch {}

          // Stage 4: restore frozen termsText from matching saved EPP quote record (to keep original terms even if template edited)
          try {
            const rawQuotes = localStorage.getItem("pmz_saved_quotes");
            const allSaved = rawQuotes ? JSON.parse(rawQuotes) : [];
            const loadedBids = saved.bidItems || saved.eppLineItems || [];
            const matching = allSaved.find((q: any) =>
              q.quoteType === 'EPP' &&
              q.jobName === saved.jobName &&
              Array.isArray(q.eppLineItems) &&
              q.eppLineItems.length === loadedBids.length
            );
            if (matching && matching.termsText) {
              setLoadedQuoteTermsText(matching.termsText);
            } else {
              setLoadedQuoteTermsText(null);
            }
          } catch {}
        }
      }
    } catch {}

    // Load bidItemsCollapsed for the EPP BID ITEMS section (client only).
    try {
      const saved = localStorage.getItem("pmz_bid_items_collapsed");
      if (saved !== null) {
        setBidItemsCollapsed(saved === "true");
      }
    } catch {}

    // Restore customer from current estimate LS (used by Quotes tab for EPP quote opens).
    // This + the LEM matching below ensures customer is pre-selected in dropdown for both EPP and Full.
    try {
      const estRaw = localStorage.getItem(ESTIMATE_STORAGE);
      if (estRaw) {
        const saved = JSON.parse(estRaw);
        let qCustId = saved.customerId || "";
        let qCustName = saved.customerName || saved.customer || "";
        if (!qCustId && qCustName) {
          // backward compat: lookup by name if only old customer name present
          try {
            const rawC = localStorage.getItem("pmz_customers");
            if (rawC) {
              const custs: any[] = JSON.parse(rawC);
              const match = custs.find((c: any) => c.name === qCustName);
              if (match?.id) qCustId = match.id;
            }
          } catch {}
        }
        if (qCustId || qCustName) {
          if (qCustId) {
            // find the matching customer (per requirements)
            const match = customers.find((c: any) => c.id === qCustId);
            if (match) {
              qCustName = match.name;
            }
            setEstimate((prev) => ({
              ...prev,
              customerId: qCustId,
              customerName: qCustName || "",
              billingAddress: saved.billingAddress || (match ? match.billingAddress || "" : "") || "",
              jobSiteAddress: saved.jobSiteAddress || (match ? match.jobSiteAddress || "" : "") || "",
            }));
          } else if (qCustName) {
            // old text-based customer name only (backward compat)
            setEstimate((prev) => ({
              ...prev,
              customerId: "",
              customerName: qCustName,
              billingAddress: saved.billingAddress || "",
              jobSiteAddress: saved.jobSiteAddress || "",
            }));
          }
        }
      }
    } catch {}

    // Support Open from Quotes tab: load pro LEM snapshot and readonly flag for Approved quotes
    try {
      const lemRaw = localStorage.getItem("pmz_current_lem_v1");
      if (lemRaw) {
        const parsed = JSON.parse(lemRaw);
        if (Array.isArray(parsed)) {
          // normalize from LemItem (label/frozenUnitCost from saved quotes) to RealLEMItem shape
          const normalized = parsed.map((it: any) => ({
            id: it.id || Math.random().toString(36).slice(2, 11),
            type: it.type || it.resourceType || 'labor',
            profileId: it.profileId || it.rateId || '',
            description: it.description || it.label || 'Item',
            quantity: it.quantity || 0,
            unitCost: it.unitCost || it.frozenUnitCost || 0,
          }));
          setRealLEMItems(normalized);
          setShowRealLEM(true);
          setProViewCollapsed(false); // expand the pro view to show loaded data
          // reset adder/editing states for clean load
          setQtyEdits({});
          setEppCostingOpen({});
          setPendingLabor(null);
          setPendingLaborQty(0);
          setPendingLaborQtyEdit("");
          setPendingEquipId("");
          setPendingEquipQty(0);
          setPendingEquipQtyEdit("");
          setPendingMatId("");
          setPendingMatQty(0);
          setPendingMatQtyEdit("");
          // restore GP% saved with the matching full quote (by matching pro item ids)
          try {
            const rawQuotes = localStorage.getItem("pmz_saved_quotes");
            const allSaved = rawQuotes ? JSON.parse(rawQuotes) : [];
            const matching = allSaved.find((q: any) =>
              q.quoteType === 'Full' &&
              Array.isArray(q.proLemItems) &&
              q.proLemItems.length === normalized.length &&
              q.proLemItems.every((p: any, idx: number) => p.id === normalized[idx].id)
            );
            if (matching) {
              const gp = matching.grossProfitPercent || matching.targetGpPercent || 0;
              setEditableGrossProfitPercent(gp);
              setGpPercentEdit(gp > 0 ? gp.toString() : "");

              // when loading a saved (Full) quote from Quotes tab (via lem snapshot + matching),
              // restore the Customer using selected* states so the controlled dropdown shows it.
              // If customerId, find the matching customer (from the loaded customers list).
              // Fall back to name-only for backward compat.
              const qCustId = matching.customerId || "";
              const qCustNameFromQuote = matching.customerName || matching.customer || "";
              if (qCustId) {
                // find the matching customer
                const match = customers.find((c: any) => c.id === qCustId);
                const qCustName = match ? match.name : qCustNameFromQuote;
                setEstimate((prev) => ({
                  ...prev,
                  customerId: qCustId,
                  customerName: qCustName || "",
                  billingAddress: match ? match.billingAddress || "" : "",
                  jobSiteAddress: match ? match.jobSiteAddress || "" : "",
                }));
              } else if (qCustNameFromQuote) {
                // old text-based customer name only (backward compat)
                setEstimate((prev) => ({
                  ...prev,
                  customerId: "",
                  customerName: qCustNameFromQuote,
                  billingAddress: "",
                  jobSiteAddress: "",
                }));
              }
            }
          } catch {}
        }
      }
    } catch {}
    try {
      const ro = localStorage.getItem("pmz_current_quote_readonly");
      if (ro === "true") {
        setIsReadOnly(true);
      }
    } catch {}
  }, []);

  // Persist
  React.useEffect(() => {
    try {
      localStorage.setItem(ESTIMATE_STORAGE, JSON.stringify(estimate));
    } catch {}
  }, [estimate]);

  // Sync the controlled customer selector state (selectedCustomerId + selectedCustomerName)
  // back into estimate so that dependent code (validation, saves, etc.) stays consistent.
  // Also write directly to LS for the customer fields to guarantee the selected value
  // survives even if unmount happens before a batched estimate effect.
  React.useEffect(() => {
    setEstimate((prev) => {
      if (prev.customerId !== (selectedCustomerId || "") || prev.customerName !== (selectedCustomerName || "")) {
        return { ...prev, customerId: selectedCustomerId || "", customerName: selectedCustomerName || "", billingAddress: prev.billingAddress || "", jobSiteAddress: prev.jobSiteAddress || "" };
      }
      return prev;
    });
  }, [selectedCustomerId, selectedCustomerName]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(ESTIMATE_STORAGE);
      const curr = raw ? JSON.parse(raw) : {};
      if (curr.customerId !== (selectedCustomerId || "") || curr.customerName !== (selectedCustomerName || "")) {
        localStorage.setItem(
          ESTIMATE_STORAGE,
          JSON.stringify({ ...curr, customerId: selectedCustomerId || "", customerName: selectedCustomerName || "", billingAddress: curr.billingAddress || "", jobSiteAddress: curr.jobSiteAddress || "" })
        );
      }
    } catch {}
  }, [selectedCustomerId, selectedCustomerName]);

  // Persist BID ITEMS collapsed state
  React.useEffect(() => {
    try {
      localStorage.setItem("pmz_bid_items_collapsed", bidItemsCollapsed.toString());
    } catch {}
  }, [bidItemsCollapsed]);

  // Persist Pro View collapsed state
  React.useEffect(() => {
    try {
      localStorage.setItem("pmz_pro_view_collapsed", proViewCollapsed.toString());
    } catch {}
  }, [proViewCollapsed]);

  // Load proViewCollapsed after mount (client only) to avoid hydration mismatch.
  React.useEffect(() => {
    const saved = localStorage.getItem("pmz_pro_view_collapsed");
    if (saved !== null) {
      setProViewCollapsed(saved === "true");
    }
  }, []);

  // Load crews from Crew Builder (pmz_crews) after mount, and keep in sync with cross-tab
  // updates (storage event) and same-tab updates (custom event). Reusable so all paths share it.
  const loadCrews = React.useCallback(() => {
    try {
      const raw = localStorage.getItem("pmz_crews");
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [];
        setCrews(list);
        console.log("[pricer] loadCrews: loaded", list.length, "crews");
      } else {
        setCrews([]);
        console.log("[pricer] loadCrews: no pmz_crews in storage");
      }
    } catch (e) {
      console.error("[pricer] loadCrews error", e);
      setCrews([]);
    }
  }, []);

  React.useEffect(() => {
    loadCrews();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pmz_crews") loadCrews();
    };
    const onCustom = () => loadCrews();
    window.addEventListener("storage", onStorage);
    window.addEventListener("pmz-crews-updated", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pmz-crews-updated", onCustom as EventListener);
    };
  }, [loadCrews]);

  // Default the editable top price to per-line break-even cost (cost ÷ qty) until the user manually
  // overrides it (priceOverridden). Re-seeds when costs change. Guarded so it converges (no loop).
  React.useEffect(() => {
    setEstimate((prev) => {
      let changed = false;
      const bidItems = prev.bidItems.map((it: any) => {
        if (it.priceOverridden) return it;
        const qty = it.quantity || 0;
        if (qty <= 0) return it;
        const cost = lineBreakEvenCost(it);
        if (cost <= 0) return it;
        const unit = cost / qty;
        if (Math.abs((it.unitPrice || 0) - unit) > 0.005) {
          changed = true;
          return { ...it, unitPrice: unit };
        }
        return it;
      });
      return changed ? { ...prev, bidItems } : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate.bidItems, laborRates, equipmentRates, materialRates, miscRates, crews]);

  // Close customer dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inTrigger = customerSelectRef.current && customerSelectRef.current.contains(target);
      const inDropdown = customerDropdownRef.current && customerDropdownRef.current.contains(target);
      if (!inTrigger && !inDropdown) {
        setCustomerDropdownOpen(false);
        setHighlightedCustomerIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Position the customer dropdown when open (using portal like SelectContent)
  React.useEffect(() => {
    if (customerDropdownOpen && customerSelectRef.current) {
      const rect = customerSelectRef.current.getBoundingClientRect();
      setCustomerDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [customerDropdownOpen]);

  // Running Total Revenue — now the sum of the top line totals, which represent break-even cost
  // basis (qty × unitPrice, where unitPrice defaults to per-line cost ÷ qty).
  const totalRevenue = React.useMemo(() => {
    return estimate.bidItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [estimate.bidItems]);

  // Total break-even cost across all bid lines (Σ per-line real costing). Drives the target-margin
  // tier and the marked-up recommended bid. (Defined here so targetMargin can key off it.)
  const eppRealCost = (estimate.bidItems || []).reduce((sum, item) => sum + lineBreakEvenCost(item), 0);

  // Target Margin % — the pricing tier is keyed off the MARKED-UP recommended bid (cost ÷ (1 − margin)),
  // which itself depends on the margin, so we resolve the fixed point (tiers are monotonic bands).
  // Only returns a real value AFTER a work type is selected (no default until chosen).
  const targetMargin = React.useMemo(() => {
    if (!estimate.workTypeName || workTypes.length === 0) return 0;
    const cost = eppRealCost || 0;
    // Before any costs are entered, fall back to tiering by the running bid total (legacy behavior).
    if (cost <= 0) return getTargetMarginForSize(totalRevenue || 0);
    let m = getTargetMarginForSize(cost);
    for (let i = 0; i < 12; i++) {
      const bid = m < 100 ? cost / (1 - m / 100) : cost;
      const m2 = getTargetMarginForSize(bid);
      if (m2 === m) break;
      m = m2;
    }
    return m;
  }, [estimate.workTypeName, workTypes, eppRealCost, totalRevenue]);

  function getTargetMarginForSize(size: number): number {
    if (!estimate.workTypeName || workTypes.length === 0) return 0;
    const wt = workTypes.find((w) => w.name === estimate.workTypeName);
    if (!wt || !wt.tiers || wt.tiers.length === 0) return 0;
    if (size === 0) {
      return wt.tiers[0].targetGpPercent;
    }
    for (let i = 0; i < wt.tiers.length; i++) {
      const t = wt.tiers[i];
      const low = t.low ?? 0;
      const high = t.high ?? Infinity;
      if (size >= low && size <= high) return t.targetGpPercent;
    }
    return wt.tiers[wt.tiers.length - 1].targetGpPercent;
  }

  // Per-line break-even cost — mirrors the eppRealCost summation exactly (labor + equipment +
  // material + misc + legacy crew). Used to seed the editable top price and to total job cost.
  function lineBreakEvenCost(item: any): number {
    const lC = (item.laborEntries || []).reduce((s: number, entry: any) => {
      const rate = (entry.labor && typeof entry.labor.burdenedHourlyRate === "number")
        ? entry.labor.burdenedHourlyRate
        : getLaborBurdenedRate(entry.rateId || "");
      return s + rate * (entry.hours || 0);
    }, 0);
    const eC = (item.equipmentEntries || []).reduce((s: number, entry: any) => {
      return s + getEquipmentCostPerHour(entry.rateId || "") * (entry.hours || 0);
    }, 0);
    const mC = (item.materialEntries || []).reduce((s: number, entry: any) => {
      return s + getMaterialCostPerUnit(entry.rateId || "") * (entry.quantity || 0);
    }, 0);
    const miscC = (item.miscellaneousEntries || []).reduce((s: number, entry: any) => {
      const mr = entry.rate != null ? entry.rate : getMiscCostPerUnit(entry.rateId || "");
      return s + mr * (entry.quantity || 0);
    }, 0);
    const crewC = (item.crewUsages || []).reduce((s: number, usage: any) => {
      const crew = crews.find((c: any) => c.id === usage.crewId);
      if (!crew) return s;
      const h = usage.hours || 0;
      const cl = (crew.laborLines || []).reduce((ls: number, ln: any) => ls + getLaborCostPerHour(ln.profileId || "") * (ln.quantity || 0), 0);
      const ce = (crew.equipmentLines || []).reduce((es: number, en: any) => es + getEquipmentCostPerHour(en.profileId || "") * (en.quantity || 0), 0);
      return s + (cl + ce) * h;
    }, 0);
    return Math.round((lC + eC + mC + miscC + crewC) * 100) / 100;
  }

  // Customer-facing marked-up unit price for a bid line (break-even cost ÷ (1 − target margin),
  // per unit). Cost-derived (matches the on-screen RECOMMENDED BID), so a manual top-price override
  // does not change the customer price. Falls back to cost when no target margin is set.
  function customerUnitPrice(item: any): number {
    const qty = item.quantity || 0;
    if (qty <= 0) return 0;
    const cost = lineBreakEvenCost(item);
    const marked = (targetMargin > 0 && targetMargin < 100) ? cost / (1 - targetMargin / 100) : cost;
    return marked / qty;
  }

  // Default GP% for Pro view: the target from work type tier (based on current bid total), or 20% if none selected
  const defaultTargetGP = targetMargin > 0 ? targetMargin : 20;

  // currentGPPercent is either the user-edited value (if >0) or falls back to the auto default target.
  // This allows the field to show the correct target automatically while remaining fully user-editable.
  const currentGPPercent = editableGrossProfitPercent > 0 ? editableGrossProfitPercent : defaultTargetGP;

  // Dynamic tint classes for the Grand Total card (Pro view only).
  // Comparison uses the live Gross Profit % (currentGPPercent, the editable value from Profit Summary section).
  // The expressions re-evaluate on every render, including when GP% field changes or LEM items added/removed (causes re-render).
  const isNoTarget = !estimate.workTypeName || targetMargin <= 0;
  const isHittingTarget = currentGPPercent >= defaultTargetGP;
  const grandTotalCardClass = cn(
    "rounded-xl p-4",
    isNoTarget
      ? "border-2 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
      : (editableGrossProfitPercent > 0 ? editableGrossProfitPercent : defaultTargetGP) >= defaultTargetGP
        ? "bg-[#e6f4ea] dark:bg-emerald-950 border-[#4ade80] dark:border-emerald-700 border-2"
        : "bg-[#fce8e6] dark:bg-red-950 border-[#f87171] dark:border-red-700 border-2"
  );
  const grandTotalTitleClass = isNoTarget
    ? "text-slate-800 dark:text-slate-200"
    : isHittingTarget
      ? "text-emerald-800 dark:text-emerald-300"
      : "text-red-800 dark:text-red-300";
  const grandTotalNumberClass = cn(
    "tabular-nums text-3xl font-bold",
    isNoTarget
      ? "text-slate-800 dark:text-slate-200"
      : isHittingTarget
        ? "text-emerald-800 dark:text-emerald-300"
        : "text-red-800 dark:text-red-300"
  );

  // Target Bid Price now uses the BID ITEMS table total (current bid total)
  const targetBidPrice = totalRevenue;

  // === LEM Breakdown (Level 1: reasonable default allocation based on Work Type) ===
  // Uses saved rates for average references + work-type-specific % splits of the "allowed direct cost"
  const avgLaborRate = React.useMemo(() => {
    if (laborProfiles.length === 0) return 65;
    let sum = 0, count = 0;
    laborProfiles.forEach((p) => {
      try {
        const res = calculateLaborRate(p as LaborRateInputs);
        if (res.trueCostPerBillableHour > 0) { sum += res.trueCostPerBillableHour; count++; }
      } catch {}
    });
    return count > 0 ? Math.round((sum / count) * 100) / 100 : 65;
  }, [laborProfiles]);

  const avgMaterialRate = React.useMemo(() => {
    if (materialProfiles.length === 0) return 50;
    let sum = 0, count = 0;
    materialProfiles.forEach((m) => {
      const landed = (m.baseCost || 0) + (m.deliveryCost || 0);
      if (landed > 0) { sum += landed; count++; }
    });
    return count > 0 ? Math.round((sum / count) * 100) / 100 : 50;
  }, [materialProfiles]);

  const avgEquipmentRate = React.useMemo(() => {
    if (equipmentProfiles.length === 0) return 50;
    let sum = 0, count = 0;
    equipmentProfiles.forEach((p: any) => {
      try {
        // inline equipment rate calc (matches getRealRateForProfile logic)
        const ownershipAnnual = (p.ownership || []).reduce((s: number, l: any) => s + (l.cost || 0), 0);
        const operatingAnnual = (p.operating || []).reduce((s: number, l: any) => s + (l.cost || 0), 0);
        const hours = p.annualUtilizationHours || p.hoursForRate || 1000;
        const dep = Math.max(0, (p.startingValue || 0) - (p.endingValue || 0));
        const totalAnnual = dep + ownershipAnnual + operatingAnnual;
        const rate = totalAnnual / hours;
        if (rate > 0) { sum += rate; count++; }
      } catch {}
    });
    return count > 0 ? Math.round((sum / count) * 100) / 100 : 50;
  }, [equipmentProfiles]);

  const equipmentCount = equipmentProfiles.length;

  const lemAllocation = React.useMemo(() => {
    const name = (estimate.workTypeName || "").toLowerCase();
    let laborPct = 0.32, equipPct = 0.23, matPct = 0.45;

    if (name.includes("paving") || name.includes("asphalt") || name.includes("seal")) {
      laborPct = 0.28; equipPct = 0.22; matPct = 0.50;
    } else if (name.includes("excavat") || name.includes("site")) {
      laborPct = 0.35; equipPct = 0.30; matPct = 0.35;
    } else if (name.includes("commercial")) {
      laborPct = 0.30; equipPct = 0.25; matPct = 0.45;
    }

    const assumedDirect = targetBidPrice * (1 - targetMargin / 100); // max direct cost to hit the work type target margin
    const labor = Math.round(assumedDirect * laborPct * 100) / 100;
    const equipment = Math.round(assumedDirect * equipPct * 100) / 100;
    const material = Math.round(assumedDirect * matPct * 100) / 100;
    const total = labor + equipment + material;

    return { labor, equipment, material, total };
  }, [estimate.workTypeName, targetBidPrice, targetMargin]);

  const trueGrossProfit = totalRevenue - lemAllocation.total;
  const grossProfitPercent = totalRevenue > 0 ? (trueGrossProfit / totalRevenue) * 100 : 0;

  // === Helpers ===
  function updateEstimate(updates: Partial<CurrentEstimate>) {
    setEstimate((prev) => ({ ...prev, ...updates }));
  }

  function addBidItem() {
    const newItem: BidItem = {
      id: generateClientId('bid'),
      description: "",
      quantity: 0,
      unit: "EA",
      unitPrice: 0,
      laborEntries: [],
      equipmentEntries: [],
      materialEntries: [],
      miscellaneousEntries: [],
      crewUsages: [],
    };
    setEstimate((prev) => ({ ...prev, bidItems: [...prev.bidItems, newItem] }));
  }

  function updateBidItem(id: string, field: keyof BidItem, value: any) {
    if (["laborEntries", "equipmentEntries", "materialEntries", "miscellaneousEntries", "crewUsages"].includes(field as string)) {
      setCostingTargetResult(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
    setEstimate((prev) => ({
      ...prev,
      bidItems: prev.bidItems.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: (field === "labor" || field === "priceOverridden" || (value != null && typeof value === "object" && !Array.isArray(value)) || ["description", "unit", "laborRateId", "equipmentRateId", "materialRateId", "laborEntries", "equipmentEntries", "materialEntries", "miscellaneousEntries", "crewUsages"].includes(field as string))
                ? (value === "" ? undefined : value)
                : Math.max(0, Number(value) || 0),
            }
          : item
      ),
    }));
  }

  // Stage 1: Adding a crew POPULATES individual Labor + Equipment lines on the bid item
  // (one line per unit), each with its own editable hours. Reuses the same entry shape and
  // rate resolution (getLaborBurdenedRate / getEquipmentCostPerHour) the manual selects use.
  // Lines are tagged with a shared `group` so they render together and can be removed at once.
  function addCrewToLine(item: BidItem, crewId: string) {
    if (!crewId || crewId === "none") return;
    const crew = crews.find((c: any) => c.id === crewId);
    if (!crew) return;
    const group = { id: generateStableId("crewgrp"), crewId: crew.id, name: crew.name };

    const newLabor = [...(item.laborEntries || [])];
    (crew.laborLines || []).forEach((ln: any) => {
      const profile = laborRates.find((r: any) => r.id === ln.profileId);
      const r = getLaborBurdenedRate(ln.profileId || "");
      const count = Math.max(1, Math.round(ln.quantity || 1));
      for (let k = 0; k < count; k++) {
        newLabor.push({
          rateId: ln.profileId,
          labor: profile ? { id: profile.id, role: profile.role, burdenedHourlyRate: r } : undefined,
          rate: r,
          hours: 1,
          group,
        });
      }
    });

    const newEquip = [...(item.equipmentEntries || [])];
    (crew.equipmentLines || []).forEach((en: any) => {
      const r = getEquipmentCostPerHour(en.profileId || "");
      const count = Math.max(1, Math.round(en.quantity || 1));
      for (let k = 0; k < count; k++) {
        newEquip.push({ rateId: en.profileId, rate: r, hours: 1, group });
      }
    });

    updateBidItem(item.id, "laborEntries", newLabor);
    updateBidItem(item.id, "equipmentEntries", newEquip);

    // Persist realCost / realGrossProfitPercent using the same formula as the existing handlers.
    const lineTotal = item.quantity * item.unitPrice;
    const lC = newLabor.reduce((s, e: any) => {
      const r = e.rate != null ? e.rate : (e.labor && typeof e.labor.burdenedHourlyRate === "number") ? e.labor.burdenedHourlyRate : getLaborBurdenedRate(e.rateId || "");
      return s + r * (e.hours || 0);
    }, 0);
    const eC = newEquip.reduce((s, e: any) => {
      const er = e.rate != null ? e.rate : getEquipmentCostPerHour(e.rateId || "");
      return s + er * (e.hours || 0);
    }, 0);
    const mC = (item.materialEntries || []).reduce((s, e: any) => {
      const mr = e.rate != null ? e.rate : getMaterialCostPerUnit(e.rateId || "");
      return s + mr * (e.quantity || 0);
    }, 0);
    const miscC = (item.miscellaneousEntries || []).reduce((s, e: any) => {
      const mr = e.rate != null ? e.rate : getMiscCostPerUnit(e.rateId || "");
      return s + mr * (e.quantity || 0);
    }, 0);
    const cC = (item.crewUsages || []).reduce((s, u: any) => {
      const cr = crews.find((c: any) => c.id === u.crewId);
      if (!cr) return s;
      const hh = u.hours || 0;
      const cll = (cr.laborLines || []).reduce((ls: number, ln: any) => ls + getLaborCostPerHour(ln.profileId || "") * (ln.quantity || 0), 0);
      const cee = (cr.equipmentLines || []).reduce((es: number, en: any) => es + getEquipmentCostPerHour(en.profileId || "") * (en.quantity || 0), 0);
      return s + (cll + cee) * hh;
    }, 0);
    const tC = Math.round((lC + eC + mC + miscC + cC) * 100) / 100;
    const rGp = lineTotal > 0 ? Math.round(((lineTotal - tC) / lineTotal * 100) * 10) / 10 : 100;
    updateBidItem(item.id, "realCost", tC);
    updateBidItem(item.id, "realGrossProfitPercent", rGp);
  }

  // Stage 1: remove every populated line belonging to a crew group from a bid item, in one click.
  function removeCrewGroupFromLine(item: BidItem, groupId: string) {
    const newLabor = (item.laborEntries || []).filter((e: any) => !(e.group && e.group.id === groupId));
    const newEquip = (item.equipmentEntries || []).filter((e: any) => !(e.group && e.group.id === groupId));
    updateBidItem(item.id, "laborEntries", newLabor);
    updateBidItem(item.id, "equipmentEntries", newEquip);

    const lineTotal = item.quantity * item.unitPrice;
    const lC = newLabor.reduce((s, e: any) => {
      const r = e.rate != null ? e.rate : (e.labor && typeof e.labor.burdenedHourlyRate === "number") ? e.labor.burdenedHourlyRate : getLaborBurdenedRate(e.rateId || "");
      return s + r * (e.hours || 0);
    }, 0);
    const eC = newEquip.reduce((s, e: any) => {
      const er = e.rate != null ? e.rate : getEquipmentCostPerHour(e.rateId || "");
      return s + er * (e.hours || 0);
    }, 0);
    const mC = (item.materialEntries || []).reduce((s, e: any) => {
      const mr = e.rate != null ? e.rate : getMaterialCostPerUnit(e.rateId || "");
      return s + mr * (e.quantity || 0);
    }, 0);
    const miscC = (item.miscellaneousEntries || []).reduce((s, e: any) => {
      const mr = e.rate != null ? e.rate : getMiscCostPerUnit(e.rateId || "");
      return s + mr * (e.quantity || 0);
    }, 0);
    const cC = (item.crewUsages || []).reduce((s, u: any) => {
      const cr = crews.find((c: any) => c.id === u.crewId);
      if (!cr) return s;
      const hh = u.hours || 0;
      const cll = (cr.laborLines || []).reduce((ls: number, ln: any) => ls + getLaborCostPerHour(ln.profileId || "") * (ln.quantity || 0), 0);
      const cee = (cr.equipmentLines || []).reduce((es: number, en: any) => es + getEquipmentCostPerHour(en.profileId || "") * (en.quantity || 0), 0);
      return s + (cll + cee) * hh;
    }, 0);
    const tC = Math.round((lC + eC + mC + miscC + cC) * 100) / 100;
    const rGp = lineTotal > 0 ? Math.round(((lineTotal - tC) / lineTotal * 100) * 10) / 10 : 100;
    updateBidItem(item.id, "realCost", tC);
    updateBidItem(item.id, "realGrossProfitPercent", rGp);
  }

  // Stage 1: update the hours on a single populated (grouped) entry by its real array index.
  function updateGroupedEntryHours(item: BidItem, kind: "labor" | "equipment", realIdx: number, hours: number) {
    const h = Math.max(0, hours);
    const field = kind === "labor" ? "laborEntries" : "equipmentEntries";
    const arr = [...((item as any)[field] || [])];
    if (!arr[realIdx]) return;
    arr[realIdx] = { ...arr[realIdx], hours: h };
    updateBidItem(item.id, field, arr);

    const laborArr = kind === "labor" ? arr : (item.laborEntries || []);
    const equipArr = kind === "equipment" ? arr : (item.equipmentEntries || []);
    const lineTotal = item.quantity * item.unitPrice;
    const lC = laborArr.reduce((s, e: any) => {
      const r = e.rate != null ? e.rate : (e.labor && typeof e.labor.burdenedHourlyRate === "number") ? e.labor.burdenedHourlyRate : getLaborBurdenedRate(e.rateId || "");
      return s + r * (e.hours || 0);
    }, 0);
    const eC = equipArr.reduce((s, e: any) => {
      const er = e.rate != null ? e.rate : getEquipmentCostPerHour(e.rateId || "");
      return s + er * (e.hours || 0);
    }, 0);
    const mC = (item.materialEntries || []).reduce((s, e: any) => {
      const mr = e.rate != null ? e.rate : getMaterialCostPerUnit(e.rateId || "");
      return s + mr * (e.quantity || 0);
    }, 0);
    const miscC = (item.miscellaneousEntries || []).reduce((s, e: any) => {
      const mr = e.rate != null ? e.rate : getMiscCostPerUnit(e.rateId || "");
      return s + mr * (e.quantity || 0);
    }, 0);
    const cC = (item.crewUsages || []).reduce((s, u: any) => {
      const cr = crews.find((c: any) => c.id === u.crewId);
      if (!cr) return s;
      const hh = u.hours || 0;
      const cll = (cr.laborLines || []).reduce((ls: number, ln: any) => ls + getLaborCostPerHour(ln.profileId || "") * (ln.quantity || 0), 0);
      const cee = (cr.equipmentLines || []).reduce((es: number, en: any) => es + getEquipmentCostPerHour(en.profileId || "") * (en.quantity || 0), 0);
      return s + (cll + cee) * hh;
    }, 0);
    const tC = Math.round((lC + eC + mC + miscC + cC) * 100) / 100;
    const rGp = lineTotal > 0 ? Math.round(((lineTotal - tC) / lineTotal * 100) * 10) / 10 : 100;
    updateBidItem(item.id, "realCost", tC);
    updateBidItem(item.id, "realGrossProfitPercent", rGp);
  }

  function removeBidItem(id: string) {
    setEstimate((prev) => ({
      ...prev,
      bidItems: prev.bidItems.filter((i) => i.id !== id),
    }));
    setLineTotalEdits(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    setEppCostingOpen(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }

  function toggleEppDetails(id: string) {
    setEppCostingOpen(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function clearAll() {
    setEstimate({
      jobName: "",
      workTypeName: "",
      salesperson: "",
      estimatedRevenue: 0,
      bidItems: [],
      customerName: "",
      customerId: "",
      billingAddress: "",
      jobSiteAddress: "",
    });
    setSelectedCustomerName(null);
    setSelectedCustomerId(null);
    setRealLEMItems([]);
    setIsReadOnly(false);
    setPendingLabor(null);
    setPendingLaborQty(0);
    setPendingEquipId("");
    setPendingEquipQty(0);
    setPendingMatId("");
    setPendingMatQty(0);
    setQtyEdits({});
    setLineTotalEdits({});
    setEppCostingOpen({});
    setPendingLaborQtyEdit("");
    setPendingEquipQtyEdit("");
    setPendingMatQtyEdit("");
    setEditableGrossProfitPercent(0);
    setGpPercentEdit("");
    setShowRealLEM(false);
    try {
      localStorage.removeItem("pmz_current_quote_readonly");
      localStorage.removeItem("pmz_current_lem_v1");
    } catch {}
  }

  function resetToDemo() {
    const demo: BidItem[] = [
      { id: "d1", description: "4\" Asphalt Driveway Paving", quantity: 1850, unit: "SF", unitPrice: 8.75 },
      { id: "d2", description: "Site Grading & Base Prep", quantity: 42, unit: "CY", unitPrice: 38.50 },
      { id: "d3", description: "3/4\" Gravel Base (delivered)", quantity: 28, unit: "TON", unitPrice: 42.00 },
      { id: "d4", description: "Edge Milling & Tie-in", quantity: 185, unit: "LF", unitPrice: 6.25 },
      { id: "d5", description: "Mobilization & Traffic Control", quantity: 1, unit: "LS", unitPrice: 1850 },
    ];
    setEstimate({
      jobName: "Downtown Plaza Paving - Phase 1",
      workTypeName: workTypes[0]?.name || "Residential Paving",
      salesperson: "Owner",
      estimatedRevenue: 24500,
      bidItems: demo,
      customerName: "Downtown Plaza LLC",
      customerId: "",
      billingAddress: "",
      jobSiteAddress: "",
    });
    setSelectedCustomerName("Downtown Plaza LLC");
    setSelectedCustomerId(null);
    setRealLEMItems([]);
    setQtyEdits({});
    setLineTotalEdits({});
    setEppCostingOpen({});
    setIsReadOnly(false);
    try {
      localStorage.removeItem("pmz_current_quote_readonly");
      localStorage.removeItem("pmz_current_lem_v1");
    } catch {}
  }

  // Unified save to pmz_saved_quotes per spec. Captures snapshot of active rates at save time.
  // Uses PMZ types from lib/pmz-types.ts for SavedQuote, LineItem, LemItem, Bucket.
  function saveQuote(quoteType: "EPP" | "Full") {
    try {
      const key = "pmz_saved_quotes";
      const raw = localStorage.getItem(key);
      const quotes: PMZSavedQuote[] = raw ? JSON.parse(raw) : [];
      const now = new Date();

      const selectedWT = workTypes.find((w: any) => w.name === estimate.workTypeName);
      const workTypeId = (selectedWT as any)?.id || estimate.workTypeName || "";
      const workTypeName = estimate.workTypeName || (selectedWT as any)?.name || "";

      // Determine the pricing tier that was used for target GP (based on revenue size)
      let pricingTierId = "tier-0";
      const tiers = (selectedWT as any)?.tiers || (selectedWT as any)?.pricingTiers || [];
      let size = totalRevenue || 0;
      let matchedIndex = -1;
      if (tiers.length > 0) {
        if (size === 0) {
          matchedIndex = 0;
        } else {
          for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            const low = t.low ?? 0;
            const high = t.high ?? Infinity;
            if (size >= low && size <= high) {
              matchedIndex = i;
              break;
            }
          }
          if (matchedIndex < 0) matchedIndex = tiers.length - 1;
        }
        if (matchedIndex >= 0) {
          const t = tiers[matchedIndex];
          pricingTierId = (t as any)?.id || (t as any)?.pricingTierId || `tier-${matchedIndex}`;
        }
      }
      const targetGpSource = { workTypeId, pricingTierId };

      const getBucketForType = (t: 'labor' | 'equipment' | 'material'): Bucket => {
        // Tag LEM resource lines to buckets per model (labor/material as direct production; equipment as indirect for example coverage)
        if (t === 'labor' || t === 'material') return 'direct';
        return 'indirect';
      };

      let eppLines: LineItem[] = [];
      let proLems: LemItem[] = [];
      let directCogsDollars = 0;
      let indirectCogsDollars = 0;

      // EPP marked-up recommended bid (cost ÷ (1 − target margin)) — the customer-facing total.
      const eppMarkedUpBid = (targetMargin > 0 && targetMargin < 100)
        ? Math.round((eppRealCost / (1 - targetMargin / 100)) * 100) / 100
        : eppRealCost;

      if (quoteType === "EPP") {
        eppLines = estimate.bidItems.map((item): LineItem => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: customerUnitPrice(item), // customer price (marked-up), not break-even cost
        }));
        proLems = [];
        // EPP cost = the real break-even cost; revenue = the marked-up bid (applied below).
        directCogsDollars = eppRealCost;
        indirectCogsDollars = 0;
      } else {
        eppLines = [];
        proLems = realLEMItems.map((item): LemItem => {
          const bucket = getBucketForType(item.type);
          const frozenUnitCost = item.unitCost;
          const lineCost = item.quantity * frozenUnitCost;
          if (bucket === "direct") {
            directCogsDollars += lineCost;
          } else {
            indirectCogsDollars += lineCost;
          }
          return {
            id: item.id,
            resourceType: item.type,
            rateId: item.profileId,
            label: item.description,
            quantity: item.quantity,
            frozenUnitCost,
            bucket,
          };
        });
      }

      const grossProfitDollars = totalRevenue - (directCogsDollars + indirectCogsDollars);
      const grossProfitPercent = totalRevenue > 0 ? (grossProfitDollars / totalRevenue) * 100 : 0;

      // Capture for Full Quote from Profit Summary state
      let finalGrossProfitPercent = grossProfitPercent;
      let finalGrossProfitAmount = grossProfitDollars;
      let finalGrandTotal = totalRevenue;
      if (quoteType === "Full") {
        // read the editable GP% from Profit Summary or the Work Type target
        finalGrossProfitPercent = editableGrossProfitPercent > 0 ? editableGrossProfitPercent : currentGPPercent;
        finalGrossProfitAmount = computedGrossProfit;
        finalGrandTotal = realTotalLEM + finalGrossProfitAmount;
      } else {
        // EPP: customer total = marked-up recommended bid; GP = bid − break-even cost.
        finalGrandTotal = eppMarkedUpBid;
        finalGrossProfitAmount = eppMarkedUpBid - eppRealCost;
        finalGrossProfitPercent = eppMarkedUpBid > 0 ? ((eppMarkedUpBid - eppRealCost) / eppMarkedUpBid) * 100 : 0;
      }

      // Capture customer from the controlled Customer selector state (selectedCustomerId + selectedCustomerName)
      // at save time so both EPP and Full quotes reliably store the selected customer.
      const savedCustomerId = selectedCustomerId || estimate.customerId || "";
      const savedCustomerName = selectedCustomerName || estimate.customerName || "";
      const savedCustomerBilling = estimate.billingAddress || "";
      const savedCustomerJobSite = estimate.jobSiteAddress || "";

      // Stage 4: snapshot the currently selected terms body text onto the quote record
      let termsText = null;
      if (selectedTermsId) {
        const termsList = getAllTerms();
        const selected = termsList.find((t: TermsBlock) => t.id === selectedTermsId);
        if (selected) {
          termsText = selected.body;
        }
      }

      const newQuote: PMZSavedQuote & { customerName?: string } = {
        id: `${quoteType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        quoteType,
        jobName: estimate.jobName || "Untitled",
        customer: savedCustomerName || "",
        customerId: savedCustomerId || "",
        customerName: savedCustomerName || "",
        billingAddress: savedCustomerBilling,
        jobSiteAddress: savedCustomerJobSite,
        workTypeId,
        workType: workTypeName,
        salesperson: estimate.salesperson || "",
        // also store full customer snapshot for preview
        customerDetails: {
          id: savedCustomerId,
          name: savedCustomerName,
          billingAddress: savedCustomerBilling,
        jobSiteAddress: savedCustomerJobSite,
          jobSiteAddress: savedCustomerJobSite,
        },
        status: "Draft",
        locked: false,
        eppLineItems: eppLines,
        proLemItems: proLems,
        targetGpPercent: targetMargin,
        targetGpSource,
        totalRevenue: quoteType === "EPP" ? eppMarkedUpBid : totalRevenue,
        directCogsDollars,
        indirectCogsDollars,
        grossProfitDollars: finalGrossProfitAmount,
        grossProfitPercent: finalGrossProfitPercent,
        grossProfitAmount: finalGrossProfitAmount,
        grandTotal: finalGrandTotal,
        termsText,
        createdAt: now,
        updatedAt: now,
      };
      quotes.push(newQuote);
      localStorage.setItem(key, JSON.stringify(quotes));
    } catch {
      // fail silently (storage issues)
    }
  }

  function handleSaveEPPQuote() {
    setSaveAttempted(true);
    setEppSaveAttempted(true);
    if (!eppHasItems) return;
    setIsSavingEPP(true);
    saveQuote("EPP");
    setSaveMessage("EPP Quote saved successfully");
    // brief disable cue
    setTimeout(() => setIsSavingEPP(false), 1500);
    // auto dismiss message
    setTimeout(() => setSaveMessage(null), 4500);
  }

  function handleSaveFullQuote() {
    setSaveAttempted(true);
    setProSaveAttempted(true);
    if (!proHasItems) return;
    setIsSavingFull(true);
    saveQuote("Full");
    setSaveMessage("Full Quote saved successfully");
    // brief disable cue
    setTimeout(() => setIsSavingFull(false), 1500);
    // auto dismiss message
    setTimeout(() => setSaveMessage(null), 4500);
  }

  function handlePrintQuote() {
    const previewEl = document.getElementById('quote-preview');
    if (!previewEl) {
      window.print();
      return;
    }
    const printWindow = window.open('', '', 'width=900,height=700');
    if (printWindow) {
      const styles = `
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; color: #111; background: #fff; line-height: 1.4; }
        .quote-container { max-width: 800px; margin: 0 auto; font-size: 13px; }
        .brand { font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
        .quote-title { font-size: 32px; font-weight: 700; text-align: center; margin: 12px 0 20px; letter-spacing: 2px; border-bottom: 3px solid #000; padding-bottom: 8px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
        .info-block h4 { font-size: 11px; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #666; padding: 6px 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: 600; }
        .text-right { text-align: right; }
        .total-row td { font-weight: 700; background: #f8f8f8; }
        .summary { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ccc; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 12px; }
        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; }
        .sig-line { border-bottom: 1px solid #000; height: 24px; margin-bottom: 2px; }
        .footer { margin-top: 24px; font-size: 10px; text-align: center; color: #555; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
      `;
      printWindow.document.write(`<!doctype html><html><head><title>Quote - ${estimate.jobName || 'PMZ'}</title><style>${styles}</style></head><body>`);
      printWindow.document.write(previewEl.innerHTML);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    } else {
      window.print();
    }
  }

  function handleExportNext() {
    const options = {
      exportType,
      showQuantities,
      showUnits,
      showPerUnitPrice,
      showLineItemPrices,
      logoDataUrl,
      showBillTo,
      showJobSite,
      showPrimaryContact,
      showAccessNotes,
      showGPS,
    };
    setShowUpdateExport(false);
    // Open full-page quote in new tab (replaces old modal preview)
    try {
      const eppData = buildQuoteData(estimate);
      setEppQuoteData(eppData);
      // Snapshot the selected (or loaded frozen from reopened quote) terms BODY TEXT
      let termsText = null;
      if (loadedQuoteTermsText) {
        termsText = loadedQuoteTermsText;
      } else if (selectedTermsId) {
        const termsList = getAllTerms();
        const selected = termsList.find((t: TermsBlock) => t.id === selectedTermsId);
        if (selected) {
          termsText = selected.body;
        }
      }
      const quoteForPrint = {
        quoteData: eppData,
        options: {
          exportType,
          showQuantities,
          showUnits,
          showPerUnitPrice,
          showLineItemPrices,
          logoDataUrl,
          showBillTo,
          showJobSite,
          showPrimaryContact,
          showAccessNotes,
          showGPS,
        },
        logoDataUrl,
        exportType,
        termsText,
      };
      sessionStorage.setItem('pmz_epp_print_quote', JSON.stringify(quoteForPrint));
    } catch (e) {
      console.warn('Could not stash quote data for print tab', e);
    }
    const printUrl = `${window.location.origin}${window.location.pathname}?print=quote`;
    window.open(printUrl, '_blank');
  }

  function handlePreviewExportPDF() {
    const opts = {
      exportType,
      showQuantities,
      showUnits,
      showPerUnitPrice,
      showLineItemPrices,
      logoDataUrl,
      showBillTo,
      showJobSite,
      showPrimaryContact,
      showAccessNotes,
      showGPS,
    };
    // Customer PDF shows the marked-up recommended bid: feed QuotePDF bid items whose unitPrice is
    // the customer price (its internal qty × unitPrice then yields the bid, not the break-even cost).
    const pdfEstimate = { ...estimate, bidItems: (estimate.bidItems || []).map((it: any) => ({ ...it, unitPrice: customerUnitPrice(it) })) };
    pdf(<QuotePDF estimate={pdfEstimate} {...opts} />).toBlob().then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportType}-${estimate.jobName || 'quote'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function toggleBidItemsCollapsed() {
    setBidItemsCollapsed((prev) => !prev);
  }

  function toggleProViewCollapsed() {
    setProViewCollapsed((prev) => !prev);
  }

  // === Real LEM interactive helpers (Pro green section only - pulls from actual saved profiles) ===
  function getRealRateForProfile(type: 'labor' | 'equipment' | 'material', profile: any): number {
    if (type === 'labor' && profile) {
      try {
        const res = calculateLaborRate(profile as LaborRateInputs);
        return res.trueCostPerBillableHour || 0;
      } catch { return 0; }
    }
    if (type === 'material' && profile) {
      return (profile.baseCost || 0) + (profile.deliveryCost || 0);
    }
    if (type === 'equipment' && profile) {
      // Compute simple hourly from v2 equipment profile data
      try {
        const ownershipAnnual = (profile.ownership || []).reduce((s: number, l: any) => s + (l.cost || 0), 0);
        const operatingAnnual = (profile.operating || []).reduce((s: number, l: any) => s + (l.cost || 0), 0);
        const hours = profile.annualUtilizationHours || profile.hoursForRate || 1000;
        const dep = Math.max(0, (profile.startingValue || 0) - (profile.endingValue || 0));
        const totalAnnual = dep + ownershipAnnual + operatingAnnual;
        return totalAnnual / hours;
      } catch { return 50; }
    }
    return 0;
  }

  function addRealLEMItem(type: 'labor' | 'equipment' | 'material', profileId: string, qty?: number) {
    let profile: any;
    let desc = '';
    if (type === 'labor') profile = laborProfiles.find((p: any) => p.id === profileId);
    else if (type === 'equipment') profile = equipmentProfiles.find((p: any) => p.id === profileId);
    else profile = materialProfiles.find((p: any) => p.id === profileId);
    if (!profile) return;
    desc = type === 'labor' ? (profile.role || 'Labor') : (profile.description || 'Item');
    const rate = getRealRateForProfile(type, profile);
    const finalQty = qty ?? (type === 'labor' ? 40 : type === 'equipment' ? 20 : 10);
    const newItem: RealLEMItem = {
      id: Math.random().toString(36).slice(2, 11),
      type,
      profileId,
      description: desc,
      quantity: finalQty,
      unitCost: rate,
    };
    setRealLEMItems(prev => [...prev, newItem]);
  }

  function updateRealLEMQuantity(id: string, qty: number) {
    setRealLEMItems(prev => prev.map(item =>
      item.id === id ? { ...item, quantity: Math.max(0, qty) } : item
    ));
  }

  function removeRealLEMItem(id: string) {
    setRealLEMItems(prev => prev.filter(item => item.id !== id));
    setQtyEdits(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }

  // Real-time computed values for the interactive Pro breakdown
  const realLaborCost = realLEMItems.filter(i => i.type === 'labor').reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const realEquipCost = realLEMItems.filter(i => i.type === 'equipment').reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const realMatCost = realLEMItems.filter(i => i.type === 'material').reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const realTotalLEM = realLaborCost + realEquipCost + realMatCost;
  const realTrueGP = totalRevenue - realTotalLEM;
  const realGPPercent = totalRevenue > 0 ? (realTrueGP / totalRevenue) * 100 : 0;

  // EPP bottom summary: Total Revenue / Estimate Total = the marked-up RECOMMENDED bid
  // (break-even cost ÷ (1 − target margin), the Golden Formula). Actual Cost = eppRealCost (above).
  // Note: GP here is the recommended markup, so it sits at/above target by construction.
  const eppRecommendedBid = (targetMargin > 0 && targetMargin < 100)
    ? Math.round((eppRealCost / (1 - targetMargin / 100)) * 100) / 100
    : eppRealCost;
  const eppSellingPrice = eppRecommendedBid;
  const eppGrossProfitDollars = eppSellingPrice - eppRealCost;
  const eppGrossProfitPercent = eppSellingPrice > 0
    ? Math.round(((eppSellingPrice - eppRealCost) / eppSellingPrice * 100) * 10) / 10
    : 0;
  const eppTargetPercent = targetMargin; // from selected Work Type tier for current job size, or 0
  const eppOnTarget = eppGrossProfitPercent >= eppTargetPercent;

  // Single normalized customer block used by BOTH the on-screen preview and the PDF, built from the
  // selected customer record. "Same as billing" is derived (no persisted flag): the saved jobSite is a
  // copy of billing when same. Empty fields stay empty (callers suppress empty blocks). Internal-only
  // `notes` is deliberately never included.
  function buildCustomerBlock() {
    const c: any = currentCustomer || {};
    const billing = c.billingAddress || {};
    const job = c.jobSiteAddress || {};
    const hasJob = !!(job.street || job.street2 || job.city || job.state || job.zip || job.accessNotes || job.latitude != null || job.longitude != null);
    const jobSiteSameAsBilling = !hasJob || (
      (billing.street || "") === (job.street || "") &&
      (billing.street2 || "") === (job.street2 || "") &&
      (billing.city || "") === (job.city || "") &&
      (billing.state || "") === (job.state || "") &&
      (billing.zip || "") === (job.zip || "")
    );
    const block = {
      name: c.name || estimate.customerName || "",
      billToLines: formatAddressLines(billing),
      jobSiteSameAsBilling,
      jobSiteLines: jobSiteSameAsBilling ? formatAddressLines(billing) : formatAddressLines(job),
      contact: {
        name: c.contactName || "",
        title: c.title || "",
        phone: c.phone || "",
        mobile: c.mobile || "",
        email: c.email || "",
      },
      accessNotes: job.accessNotes || "",
      gps: (job.latitude != null && job.longitude != null) ? `${job.latitude}, ${job.longitude}` : "",
    };
    return block;
  }

  // Shared adapter: turns EPP estimate data into the normalized quote shape for QuotePreview
  const buildQuoteData = (source: any) => {
    const s = source || {};
    const bidItems = s.bidItems || estimate.bidItems || [];
    const lineItems = bidItems.map((item: any) => {
      const qty = Number(item.quantity || 0);
      // Customer document shows the marked-up recommended bid, not the break-even cost (item.unitPrice).
      // Round the line total for the customer document (presentation only). Per-unit = rounded total / qty.
      const lineTotal = roundToQuote(qty * customerUnitPrice(item));
      const unitPrice = qty > 0 ? lineTotal / qty : customerUnitPrice(item);
      return {
        description: item.description || "—",
        qty,
        unit: item.unit || "",
        unitPrice,
        lineTotal,
      };
    });
    // Grand total = sum of the ROUNDED line totals, so the printed document always foots.
    const total = lineItems.reduce((sum: number, li: any) => sum + li.lineTotal, 0);
    return {
      jobName: s.jobName || estimate.jobName || "—",
      customer: buildCustomerBlock(),
      workType: s.workTypeName || s.workType || estimate.workTypeName || "",
      salesperson: s.salesperson || estimate.salesperson || "",
      date: new Date().toLocaleDateString(),
      quoteNumber: Date.now().toString().slice(-7),
      status: s.status || "EPP",
      lineItems,
      total,
      grossProfit: eppGrossProfitDollars,
    };
  };

  // Validation for header/common fields (EPP/Pro sections validate their items separately)
  const validationErrors = React.useMemo(() => {
    const errs: Partial<Record<"jobName" | "workType" | "customer", string>> = {};
    if (!estimate.jobName || estimate.jobName.trim() === "") {
      errs.jobName = "Job Name is required";
    }
    if (!estimate.workTypeName || estimate.workTypeName.trim() === "") {
      errs.workType = "Work Type selection is required";
    }
    if (!estimate.customerName || estimate.customerName.trim() === "") {
      errs.customer = "Customer is required";
    }
    // bidItems / pro items validated per-section only
    return errs;
  }, [estimate.jobName, estimate.workTypeName, estimate.customerName]);

  const isValid = Object.keys(validationErrors).length === 0;

  // Per-section item validation errors (independent)
  const eppItemError = eppSaveAttempted && !eppHasItems ? "At least one line item is required" : null;
  const proItemError = proSaveAttempted && !proHasItems ? "At least one item is required" : null;

  // Computed for Grand Total using (user-editable or auto-default target) % as true margin
  const p = currentGPPercent;
  const computedGrossProfit = (p > 0 && p < 100) ? realTotalLEM * (p / (100 - p)) : 0;
  const computedGrandTotal = realTotalLEM + computedGrossProfit;

  // Educational dialog content (the hook that makes them curious about real LEM)
  const MaxDirectCost = targetBidPrice > 0 && targetMargin > 0
    ? Math.round(targetBidPrice * (1 - targetMargin / 100))
    : 0;

  // Professional PDF styles + logo support
  const styles = StyleSheet.create({
    page: {
      padding: 40,
      fontFamily: 'Helvetica',
      fontSize: 10,
      color: '#111',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: '#111',
    },
    logo: {
      maxWidth: 120,
      maxHeight: 50,
    },
    companyName: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    quoteTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      textAlign: 'center',
      marginVertical: 10,
      letterSpacing: 2,
    },
    infoSection: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    infoCol: {
      width: '48%',
    },
    infoLabel: {
      fontSize: 8,
      fontWeight: 'bold',
      marginBottom: 2,
      color: '#444',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    infoText: {
      fontSize: 10,
      marginBottom: 1,
    },
    table: {
      width: '100%',
      marginBottom: 12,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#f5f5f5',
      borderBottomWidth: 1,
      borderBottomColor: '#111',
    },
    tableHeaderCell: {
      padding: 6,
      fontSize: 9,
      fontWeight: 'bold',
      borderRightWidth: 0.5,
      borderRightColor: '#999',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#ccc',
    },
    tableCell: {
      padding: 5,
      fontSize: 9,
      borderRightWidth: 0.5,
      borderRightColor: '#ccc',
    },
    tableCellRight: {
      padding: 5,
      fontSize: 9,
      textAlign: 'right',
    },
    totalRow: {
      flexDirection: 'row',
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: '#111',
      paddingTop: 4,
    },
    totalLabel: {
      fontSize: 11,
      fontWeight: 'bold',
    },
    totalValue: {
      fontSize: 11,
      fontWeight: 'bold',
      textAlign: 'right',
    },
    footer: {
      marginTop: 24,
      fontSize: 8,
      color: '#555',
      textAlign: 'center',
    },
  });

  const QuotePDF = ({
    estimate,
    exportType = 'quote',
    showQuantities = true,
    showUnits = true,
    showPerUnitPrice = true,
    showLineItemPrices = true,
    logoDataUrl = null,
    showBillTo = true,
    showJobSite = true,
    showPrimaryContact = true,
    showAccessNotes = false,
    showGPS = false,
  }: any) => {
    const items = estimate.bidItems || [];
    // Rounded customer line totals (presentation only); grand total foots to their sum. item.unitPrice
    // here is already the customer (marked-up) price — the call site feeds QuotePDF marked-up bid items.
    const pdfLines = items.map((item: any) => {
      const qty = item.quantity || 0;
      const lineTotal = roundToQuote(qty * (item.unitPrice || 0));
      const perUnit = qty > 0 ? lineTotal / qty : (item.unitPrice || 0);
      return { description: item.description || '—', qty, unit: item.unit || '', perUnit, lineTotal };
    });
    const grandTotal = pdfLines.reduce((sum: number, l: any) => sum + l.lineTotal, 0);

    // Compute column widths dynamically
    const descWidth = '40%';
    const qtyWidth = showQuantities ? '10%' : '0%';
    const unitWidth = showUnits ? '10%' : '0%';
    const priceWidth = showPerUnitPrice ? '15%' : '0%';
    const totalWidth = showLineItemPrices ? '15%' : '0%';

    // Single normalized customer block (same source as the on-screen preview); never includes notes.
    const cb = buildCustomerBlock();

    return (
      <Document>
        <Page size="A4" style={styles.page}>
          {/* Header with logo */}
          <View style={styles.header}>
            <View>
              {logoDataUrl ? (
                <Image src={logoDataUrl} style={styles.logo} />
              ) : (
                <Text style={styles.companyName}>Performance Margin Zone</Text>
              )}
              <Text style={{ fontSize: 8, color: '#555' }}>Total Profit Management</Text>
            </View>
            <View style={{ textAlign: 'right' }}>
              <Text style={{ fontSize: 9 }}>Quote #{Date.now().toString().slice(-7)}</Text>
              <Text style={{ fontSize: 9 }}>{new Date().toLocaleDateString()}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.quoteTitle}>{exportType === 'quote' ? 'QUOTE' : 'ESTIMATE'}</Text>

          {/* Customer / Project Info */}
          <View style={styles.infoSection}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>TO:</Text>
              {!!cb.name && <Text style={styles.infoText}>{cb.name}</Text>}
              {showBillTo && cb.billToLines.map((ln: string, i: number) => (
                <Text key={`bt${i}`} style={styles.infoText}>{ln}</Text>
              ))}
              {showPrimaryContact && !!(cb.contact.name || cb.contact.title) && (
                <Text style={styles.infoText}>Contact: {[cb.contact.name, cb.contact.title].filter(Boolean).join(', ')}</Text>
              )}
              {showPrimaryContact && !!cb.contact.phone && <Text style={styles.infoText}>Phone: {cb.contact.phone}</Text>}
              {showPrimaryContact && !!cb.contact.mobile && <Text style={styles.infoText}>Mobile: {cb.contact.mobile}</Text>}
              {showPrimaryContact && !!cb.contact.email && <Text style={styles.infoText}>Email: {cb.contact.email}</Text>}
              {showAccessNotes && !!cb.accessNotes && (
                <Text style={[styles.infoText, { fontSize: 8 }]}>Access: {cb.accessNotes}</Text>
              )}
              {showGPS && !!cb.gps && (
                <Text style={[styles.infoText, { fontSize: 8 }]}>GPS: {cb.gps}</Text>
              )}
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>PROJECT:</Text>
              <Text style={styles.infoText}>{estimate.jobName || 'Project Name'}</Text>
              <Text style={styles.infoText}>Sales Rep: {estimate.salesperson || '—'}</Text>
              {showJobSite && cb.jobSiteLines.length > 0 && (
                <Text style={[styles.infoText, { marginTop: 4 }]}>Job Site{cb.jobSiteSameAsBilling ? ' (same as billing)' : ''}:</Text>
              )}
              {showJobSite && cb.jobSiteLines.map((ln: string, i: number) => (
                <Text key={`js${i}`} style={styles.infoText}>{ln}</Text>
              ))}
            </View>
          </View>

          {/* Line Items Table */}
          <View style={styles.table}>
            {/* Header row */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: descWidth }]}>Description</Text>
              {showQuantities && <Text style={[styles.tableHeaderCell, { width: qtyWidth }]}>Qty</Text>}
              {showUnits && <Text style={[styles.tableHeaderCell, { width: unitWidth }]}>Unit</Text>}
              {showPerUnitPrice && <Text style={[styles.tableHeaderCell, { width: priceWidth }]}>Unit Price</Text>}
              {showLineItemPrices && <Text style={[styles.tableHeaderCell, { width: totalWidth }]}>Line Total</Text>}
            </View>

            {/* Data rows */}
            {pdfLines.length > 0 ? pdfLines.map((line: any, idx: number) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { width: descWidth }]}>{line.description}</Text>
                  {showQuantities && <Text style={[styles.tableCell, { width: qtyWidth }]}>{line.qty}</Text>}
                  {showUnits && <Text style={[styles.tableCell, { width: unitWidth }]}>{line.unit}</Text>}
                  {showPerUnitPrice && <Text style={[styles.tableCell, { width: priceWidth }]}>${formatMoney(line.perUnit)}</Text>}
                  {showLineItemPrices && <Text style={[styles.tableCell, { width: totalWidth }]}>${formatWhole(line.lineTotal)}</Text>}
                </View>
            )) : (
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '100%' }]}>No line items</Text>
              </View>
            )}
          </View>

          {/* Grand Total */}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { width: '70%' }]}>TOTAL</Text>
            <Text style={[styles.totalValue, { width: '30%' }]}>${formatWhole(grandTotal)}</Text>
          </View>

          <Text style={styles.footer}>
            This document is a {exportType}. Thank you for your business.
          </Text>
        </Page>
      </Document>
    );
  };

  // Full-page printable preview in new tab (no modal)
  if (isPrintPreview) {
    if (!printQuoteData) {
      return (
        <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', color: '#111', background: '#fff' }}>
          Loading quote data...
        </div>
      );
    }
    const { quoteData, options = {}, logoDataUrl: ldu = null, exportType: et = 'quote', termsText = null } = printQuoteData;
    return (
      <QuotePreview
        quote={{
          ...(quoteData || {}),
          options,
          logoDataUrl: ldu,
          exportType: et,
          termsText,
        }}
        onClose={() => window.close()}
        onExportPDF={() => window.print()}
      />
    );
  }

  return (
    <div className="max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
            <TrendingUp className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Project Pricer</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">
                PILLAR 4 • LEVEL 1
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              Digital paper &amp; pencil estimating. Build your bid the way you always have — then discover what your real costs are.
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={resetToDemo}>
            <RotateCcw className="mr-2 h-4 w-4" /> Load Demo
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear
          </Button>
        </div>
      </div>

      {/* Save success banner (temporary, auto-dismisses) */}
      {saveMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
          <span>{saveMessage}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900 dark:hover:text-emerald-100 px-2"
              onClick={() => {
                console.log("View Saved Quotes clicked");
                try {
                  const quotes = JSON.parse(localStorage.getItem("pmz_saved_quotes") || "[]");
                  console.log("pmz_saved_quotes:", quotes);
                } catch {
                  console.log("pmz_saved_quotes: []");
                }
              }}
            >
              View Saved Quotes
            </Button>
            <button
              onClick={() => setSaveMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100 font-bold px-1 leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Read-only banner when viewing a locked quote loaded from Quotes tab */}
      {isReadOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between">
          <span>Read-only mode — this quote is Approved and locked. Edit fields are disabled. Use “Duplicate” from Quotes to create an editable copy.</span>
        </div>
      )}

      {/* 1. Top section — Customer (searchable), Job Name, Work Type (required), Salesperson. Bid total from table now drives margin tier. */}
      <Card className="card">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground">CUSTOMER</Label>
              <Select
                value={estimate.customerName || ""}
                onValueChange={(val) => {
                  // Capture the selected record's id (the dropdown is keyed by name) so currentCustomer
                  // resolves the FULL record by id — otherwise only the bare name reaches the quote.
                  const match = customers.find((c: any) => (c.name || "") === val);
                  setSelectedCustomerId(match?.id || null);
                  setSelectedCustomerName(val);
                  updateEstimate({ customerName: val, customerId: match?.id || "" });
                }}
              >
                <SelectTrigger className={cn(
                  "mt-1.5 text-lg font-medium h-8 w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input)] px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0_0_3px_rgba(235,51,0,0.15)]",
                  saveAttempted && validationErrors.customer && "border-red-300 focus-visible:border-red-400"
                )}>
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.length > 0 ? (
                    customers.map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="Downtown Plaza LLC">Downtown Plaza LLC</SelectItem>
                      <SelectItem value="Acme Construction">Acme Construction</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {saveAttempted && validationErrors.customer && (
                <p className="mt-1 text-xs text-red-600">{validationErrors.customer}</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground">JOB NAME</Label>
              <Input
                value={estimate.jobName}
                onFocus={() => {
                  if (estimate.jobName === "Downtown Plaza Paving - Phase 1" || estimate.jobName === "New Project") {
                    updateEstimate({ jobName: "" });
                  }
                }}
                onChange={(e) => updateEstimate({ jobName: e.target.value })}
                className="mt-1.5 text-lg font-medium"
              />
              {saveAttempted && validationErrors.jobName && (
                <p className="mt-1 text-xs text-red-600">{validationErrors.jobName}</p>
              )}
            </div>

            <div>
              <div className="flex items-baseline gap-1">
                <Label className="text-xs font-medium tracking-wider text-muted-foreground">WORK TYPE</Label>
                {!estimate.workTypeName && (
                  <span className="text-[10px] text-red-500">Required</span>
                )}
              </div>
              <Select
                value={estimate.workTypeName}
                onValueChange={(val) => updateEstimate({ workTypeName: val })}
              >
                <SelectTrigger className={cn(
                  "mt-1.5 text-lg font-medium h-8 w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input)] px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0_0_3px_rgba(235,51,0,0.15)]",
                  !estimate.workTypeName && "border-red-300 focus-visible:border-red-400"
                )}>
                  <SelectValue placeholder="Select work type..." />
                </SelectTrigger>
                <SelectContent>
                  {workTypes.length > 0 ? (
                    workTypes.map((wt) => (
                      <SelectItem key={wt.id} value={wt.name}>{wt.name}</SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No work types saved yet. <Link href="/work-types" className="underline">Create in Work Types</Link>.
                    </div>
                  )}
                </SelectContent>
              </Select>
              {saveAttempted && validationErrors.workType && (
                <p className="mt-1 text-xs text-red-600">{validationErrors.workType}</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground">SALESPERSON</Label>
              <Select
                value={estimate.salesperson}
                onValueChange={(val) => updateEstimate({ salesperson: val })}
              >
                <SelectTrigger className={cn(
                  "mt-1.5 text-lg font-medium h-8 w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input)] px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0_0_3px_rgba(235,51,0,0.15)]"
                )}>
                  <SelectValue placeholder="Select or type name" />
                </SelectTrigger>
                <SelectContent>
                  {SALESPERSON_OPTIONS.map((name) => (
                    <SelectItem key={`sales-${name}`} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Main estimating area — "Bid Items" (feels like classic estimating paper) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleBidItemsCollapsed}
              className="text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
              aria-label={bidItemsCollapsed ? "Expand BID ITEMS" : "Collapse BID ITEMS"}
            >
              {bidItemsCollapsed ? "▶" : "▼"}
            </button>
            <button
              onClick={toggleBidItemsCollapsed}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              {bidItemsCollapsed ? "Expand" : "Collapse"}
            </button>
            <div className="text-sm font-semibold tracking-[0.5px] text-muted-foreground">EPP Method (Electronic Pen and Paper method)</div>
          </div>
          {!isReadOnly && (
            <Button size="sm" onClick={addBidItem}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Line
            </Button>
          )}
        </div>

        {!bidItemsCollapsed && (
        <Card className="card overflow-hidden border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-[300px]">Description</TableHead>
                  <TableHead className="w-24 text-right">Quantity</TableHead>
                  <TableHead className="w-20">Unit</TableHead>
                  <TableHead className="w-28 text-right">Unit Price</TableHead>
                  <TableHead className="w-32 text-right">Line Total</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estimate.bidItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                      Start writing your bid the way you do on paper. Add lines, enter quantities and your prices.
                      <div className="mt-3">
                        <Button size="sm" variant="outline" onClick={resetToDemo}>Load demo bid</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  estimate.bidItems.map((item, index) => {
                    const lineTotal = item.quantity * item.unitPrice;
                    const isDetailsOpen = !!eppCostingOpen[item.id];
                    // live computed costs from current rates + inputs (for panel display) — sum over multiple entries per category
                    const laborCost = (item.laborEntries || []).reduce((sum, entry) => {
                      const rate = (entry.labor && typeof entry.labor.burdenedHourlyRate === "number")
                        ? entry.labor.burdenedHourlyRate
                        : getLaborBurdenedRate(entry.rateId || "");
                      return sum + rate * (entry.hours || 0);
                    }, 0);
                    const equipCost = (item.equipmentEntries || []).reduce((sum, entry) => {
                      return sum + getEquipmentCostPerHour(entry.rateId || "") * (entry.hours || 0);
                    }, 0);
                    const matCost = (item.materialEntries || []).reduce((sum, entry) => {
                      return sum + getMaterialCostPerUnit(entry.rateId || "") * (entry.quantity || 0);
                    }, 0);
                    const miscCost = (item.miscellaneousEntries || []).reduce((sum, entry) => {
                      const rate = entry.rate != null ? entry.rate : getMiscCostPerUnit(entry.rateId || "");
                      return sum + rate * (entry.quantity || 0);
                    }, 0);
                    const crewCost = (item.crewUsages || []).reduce((sum, usage) => {
                      const crew = crews.find((c: any) => c.id === usage.crewId);
                      if (!crew) return sum;
                      const h = usage.hours || 0;
                      const cl = (crew.laborLines || []).reduce((ls: number, ln: any) => {
                        const r = getLaborCostPerHour(ln.profileId || "");
                        return ls + r * (ln.quantity || 0);
                      }, 0);
                      const ce = (crew.equipmentLines || []).reduce((es: number, en: any) => {
                        const r = getEquipmentCostPerHour(en.profileId || "");
                        return es + r * (en.quantity || 0);
                      }, 0);
                      return sum + (cl + ce) * h;
                    }, 0);
                    const computedItemCost = Math.round((laborCost + equipCost + matCost + miscCost + crewCost) * 100) / 100;
                    const effectiveLineTotal = lineTotal;
                    const computedItemGpPct = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - computedItemCost) / effectiveLineTotal * 100) * 10) / 10 : 100;
                    const hasCosts = (item.laborEntries && item.laborEntries.length > 0) ||
                      (item.equipmentEntries && item.equipmentEntries.length > 0) ||
                      (item.materialEntries && item.materialEntries.length > 0) ||
                      (item.miscellaneousEntries && item.miscellaneousEntries.length > 0) ||
                      (item.crewUsages && item.crewUsages.length > 0);
                    // auto clear result if no costs anymore
                    if (!hasCosts && costingTargetResult[item.id]) {
                      // note: this is in render, will cause extra render but ok for reset
                      setTimeout(() => setCostingTargetResult(prev => {
                        const { [item.id]: _, ...rest } = prev;
                        return rest;
                      }), 0);
                    }
                    // Option B: job-level target margin (overall quote required GP / selling price, then per-line contribution)
                    const targetForJob = targetMargin;
                    const totalRealCostForJob = eppRealCost;
                    const totalRequiredSellingForJob = totalRealCostForJob > 0 && targetForJob > 0
                      ? Math.round((totalRealCostForJob / (1 - targetForJob / 100)) * 100) / 100
                      : 0;
                    const targetPctForGuidance = targetForJob;
                    const hasEnteredCosts = hasCosts && computedItemCost > 0;
                    const canShowTargetGuidance = hasEnteredCosts && targetPctForGuidance > 0;
                    const requiredLineTotalLive = (canShowTargetGuidance && totalRealCostForJob > 0)
                      ? Math.round((computedItemCost / totalRealCostForJob * totalRequiredSellingForJob) * 100) / 100
                      : 0;
                    const requiredGPLive = requiredLineTotalLive - computedItemCost;
                    let guidanceStatus = "";
                    let guidanceStatusClass = "";
                    if (canShowTargetGuidance) {
                      const tol = 0.005;
                      const delta = effectiveLineTotal - requiredLineTotalLive;
                      if (Math.abs(delta) < tol) {
                        guidanceStatus = "On Target";
                        guidanceStatusClass = "text-emerald-700 dark:text-emerald-400";
                      } else if (delta < 0) {
                        guidanceStatus = "Below Target";
                        guidanceStatusClass = "text-red-700 dark:text-red-400";
                      } else {
                        guidanceStatus = "Above Target";
                        guidanceStatusClass = "text-blue-700 dark:text-blue-400";
                      }
                    }
                    return (
                      <React.Fragment key={item.id || `row-${index}`}>
                      <TableRow className="border-b last:border-0 hover:bg-muted/20">
                        <TableCell>
                          <Input
                            value={item.description}
                            onFocus={() => {
                              if (item.description === "Driveway Paving, Site Grading, etc.") {
                                updateBidItem(item.id, "description", "");
                              }
                            }}
                            onChange={(e) => updateBidItem(item.id, "description", e.target.value)}
                            className="h-9 border-0 bg-transparent px-1 font-medium focus-visible:bg-white focus-visible:border focus-visible:border-border"
                            disabled={isReadOnly}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={item.quantity || ""}
                            onChange={(e) => {
                              const q = Math.max(0, parseFloat(e.target.value) || 0);
                              updateBidItem(item.id, "quantity", q);
                              setLineTotalEdits(prev => {
                                const { [item.id]: _, ...rest } = prev;
                                return rest;
                              });
                            }}
                            className="h-11 w-28 text-right text-base tabular-nums font-mono border-0 bg-transparent focus-visible:bg-white focus-visible:border focus-visible:border-border px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            step="0.01"
                            disabled={isReadOnly}
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={item.unit} onValueChange={(val) => updateBidItem(item.id, "unit", val)} disabled={isReadOnly}>
                            <SelectTrigger className="h-9 border-0 bg-transparent px-2 text-sm focus-visible:bg-white focus-visible:border focus-visible:border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMON_UNITS.map((u) => <SelectItem key={`unit-${u}`} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <CurrencyInput
                            value={item.unitPrice}
                            onChange={(v) => {
                              updateBidItem(item.id, "unitPrice", v);
                              updateBidItem(item.id, "priceOverridden", true);
                              setLineTotalEdits(prev => {
                                const { [item.id]: _, ...rest } = prev;
                                return rest;
                              });
                            }}
                            wrapperClassName="h-11 w-28"
                            className="text-base font-mono"
                            disabled={isReadOnly}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          <div className="flex items-center justify-end gap-0.5">
                            <span className="text-muted-foreground">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={lineTotalEdits[item.id] !== undefined ? lineTotalEdits[item.id] : (lineTotal === 0 ? '' : lineTotal.toFixed(2))}
                              onChange={(e) => {
                                // live bidirectional: update edit buffer and immediately recalc Unit Rate = Line Total / Qty
                                const raw = e.target.value;
                                setLineTotalEdits(prev => ({ ...prev, [item.id]: raw }));
                                updateBidItem(item.id, "priceOverridden", true);
                                const trimmed = raw.trim();
                                const qty = item.quantity || 0;
                                if (trimmed === '' || trimmed === '.' || trimmed === '-') {
                                  updateBidItem(item.id, "unitPrice", 0);
                                } else {
                                  const num = parseFloat(trimmed);
                                  if (!isNaN(num) && num >= 0 && qty > 0) {
                                    const newUnit = num / qty;
                                    updateBidItem(item.id, "unitPrice", newUnit);
                                  }
                                  // if qty <=0 , do not divide by zero; leave unit rate unchanged
                                }
                              }}
                              onBlur={() => {
                                // clear edit on blur so display falls back to computed Line Total = Qty × Unit Rate
                                setLineTotalEdits(prev => {
                                  const { [item.id]: _, ...rest } = prev;
                                  return rest;
                                });
                              }}
                              className="h-11 w-24 text-right text-base tabular-nums font-mono border-0 bg-transparent focus-visible:bg-white focus-visible:border focus-visible:border-border px-1"
                              placeholder="0.00"
                              disabled={isReadOnly}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {!isReadOnly && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => toggleEppDetails(item.id)}
                              >
                                Add Details
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive/70 hover:text-destructive"
                                onClick={() => removeBidItem(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {isDetailsOpen && (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0 bg-muted/5 dark:bg-muted/10">
                            <div className="p-4 mx-2 my-0.5 border-t bg-background rounded-b w-full max-w-full overflow-x-hidden text-sm" data-panel="costing">
                              <div className="flex items-center justify-between mb-3">
                                <div className="text-base font-semibold tracking-wider text-muted-foreground">PER-LINE REAL COSTING (EPP only — does not affect Full LEM)</div>
                                <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => {
                                    // Set the top line price to break-even cost (cost ÷ qty) and re-link it to
                                    // cost (clear any manual override). The marked-up bid is shown in the summary.
                                    if (!hasCosts || computedItemCost <= 0 || item.quantity <= 0) return;
                                    updateBidItem(item.id, "unitPrice", computedItemCost / item.quantity);
                                    updateBidItem(item.id, "priceOverridden", false);
                                    setLineTotalEdits(prev => {
                                      const { [item.id]: _, ...rest } = prev;
                                      return rest;
                                    });
                                  }}
                                  disabled={isReadOnly || !hasCosts || computedItemCost <= 0 || item.quantity <= 0}
                                >
                                  Use break-even cost
                                </Button>
                                <Select value="" onValueChange={(val) => { if (val) addCrewToLine(item, val); }} disabled={isReadOnly}>
                                  <SelectTrigger className="h-6 px-2 text-xs w-auto gap-1">
                                    <SelectValue placeholder="+ Add Crew" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" align="start" sideOffset={4}>
                                    {crews.length > 0 ? (
                                      crews.map((c: any) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                      ))
                                    ) : (
                                      <SelectItem key="no-crew" value="__none__" disabled>No crews — create in Crew Builder</SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                                </div>
                              </div>
                              {/* Crews — grouped Labor/Equipment lines, shown at top of panel (collapsible) */}
                              {(() => {
                                const allEntries = [
                                  ...(item.laborEntries || []).map((e: any, i: number) => ({ e, i, kind: "labor" as const })),
                                  ...(item.equipmentEntries || []).map((e: any, i: number) => ({ e, i, kind: "equipment" as const })),
                                ].filter((x) => x.e.group);
                                const groupIds: string[] = [];
                                allEntries.forEach((x) => { if (!groupIds.includes(x.e.group.id)) groupIds.push(x.e.group.id); });
                                if (groupIds.length === 0) return null;
                                return (
                                  <div className="mb-3 space-y-2">
                                    {groupIds.map((gid) => {
                                      const groupEntries = allEntries.filter((x) => x.e.group.id === gid);
                                      const crewName = groupEntries[0]?.e.group.name || "Crew";
                                      const laborRows = groupEntries.filter((x) => x.kind === "labor");
                                      const equipRows = groupEntries.filter((x) => x.kind === "equipment");
                                      const isCollapsed = !!collapsedCrewGroups[gid];
                                      const groupCost = groupEntries.reduce((s, x) => {
                                        const r = x.kind === "labor"
                                          ? (x.e.rate != null ? x.e.rate : (x.e.labor && typeof x.e.labor.burdenedHourlyRate === "number") ? x.e.labor.burdenedHourlyRate : getLaborBurdenedRate(x.e.rateId || ""))
                                          : (x.e.rate != null ? x.e.rate : getEquipmentCostPerHour(x.e.rateId || ""));
                                        return s + r * (x.e.hours || 0);
                                      }, 0);
                                      return (
                                        <div key={gid} className="p-2 border rounded bg-muted/5">
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setCollapsedCrewGroups((prev) => ({ ...prev, [gid]: !prev[gid] }))}
                                              className="flex items-center gap-1 font-medium text-sm hover:opacity-80"
                                              aria-expanded={!isCollapsed}
                                            >
                                              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                              Crew: {crewName}
                                            </button>
                                            <div className="ml-auto text-sm tabular-nums">Group cost: ${formatMoney(groupCost)}</div>
                                            {!isReadOnly && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-2 text-xs text-destructive/70 hover:text-destructive"
                                                onClick={() => removeCrewGroupFromLine(item, gid)}
                                              >
                                                <Trash2 className="h-3 w-3 mr-1" /> Remove crew
                                              </Button>
                                            )}
                                          </div>
                                          {!isCollapsed && (
                                          <div className="space-y-1 mt-1.5">
                                            {laborRows.map((x) => {
                                              const rate = x.e.rate != null ? x.e.rate : (x.e.labor && typeof x.e.labor.burdenedHourlyRate === "number") ? x.e.labor.burdenedHourlyRate : getLaborBurdenedRate(x.e.rateId || "");
                                              const name = x.e.labor?.role || laborRates.find((r: any) => r.id === x.e.rateId)?.role || "Labor";
                                              const rowCost = rate * (x.e.hours || 0);
                                              return (
                                                <div key={`l-${x.i}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-sm">
                                                  <div className="truncate"><span className="text-xs text-muted-foreground mr-1">Labor</span>{name}</div>
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      value={x.e.hours || ""}
                                                      onChange={(ev) => updateGroupedEntryHours(item, "labor", x.i, parseFloat(ev.target.value) || 0)}
                                                      className="h-8 w-16 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                      step="0.25"
                                                      disabled={isReadOnly}
                                                    />
                                                    <span className="text-sm text-muted-foreground">hrs</span>
                                                  </div>
                                                  <div className="text-right tabular-nums text-muted-foreground w-24">${rate.toFixed(2)}/hr</div>
                                                  <div className="text-right tabular-nums w-24">Cost: ${formatMoney(rowCost)}</div>
                                                </div>
                                              );
                                            })}
                                            {equipRows.map((x) => {
                                              const rate = x.e.rate != null ? x.e.rate : getEquipmentCostPerHour(x.e.rateId || "");
                                              const name = equipmentRates.find((p: any) => p.id === x.e.rateId)?.description || "Equipment";
                                              const rowCost = rate * (x.e.hours || 0);
                                              return (
                                                <div key={`e-${x.i}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-sm">
                                                  <div className="truncate"><span className="text-xs text-muted-foreground mr-1">Equip</span>{name}</div>
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      value={x.e.hours || ""}
                                                      onChange={(ev) => updateGroupedEntryHours(item, "equipment", x.i, parseFloat(ev.target.value) || 0)}
                                                      className="h-8 w-16 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                      step="0.25"
                                                      disabled={isReadOnly}
                                                    />
                                                    <span className="text-sm text-muted-foreground">hrs</span>
                                                  </div>
                                                  <div className="text-right tabular-nums text-muted-foreground w-24">${rate.toFixed(2)}/hr</div>
                                                  <div className="text-right tabular-nums w-24">Cost: ${formatMoney(rowCost)}</div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              {/* Labor */}
                              <div className="mb-3">
                                <div className="flex items-center mb-1">
                                  <div className="text-lg font-medium">Labor</div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs ml-2"
                                    onClick={() => {
                                      const current = item.laborEntries || [];
                                      const newEntries = [...current, { rateId: undefined, hours: 0 }];
                                      updateBidItem(item.id, "laborEntries", newEntries);
                                      setPendingCostingFocus({ itemId: item.id, category: 'labor', idx: newEntries.length - 1 });
                                    }}
                                    disabled={isReadOnly}
                                  >
                                    + Add
                                  </Button>
                                </div>
                                <div className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1 text-xs font-semibold text-muted-foreground">
                                  <div></div>
                                  <div className="text-center">Hours</div>
                                  <div className="text-center">Rate</div>
                                  <div className="text-right">Cost</div>
                                </div>
                                {(item.laborEntries || []).map((entry, idx) => {
                                  if (entry.group) return null; // grouped (crew) rows render in the crew block below
                                  const rate = entry.rate != null
                                    ? entry.rate
                                    : (entry.labor && typeof entry.labor.burdenedHourlyRate === "number")
                                      ? entry.labor.burdenedHourlyRate
                                      : getLaborBurdenedRate(entry.rateId || "");
                                  const entryCost = rate * (entry.hours || 0);
                                  return (
                                    <div key={idx} className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1">
                                      <Select
                                        value={entry.rateId || "none"}
                                        onValueChange={(val) => {
                                          const newId = val === "none" ? undefined : val;
                                          const current = [...(item.laborEntries || [])];
                                          current[idx] = { ...current[idx], rateId: newId };
                                          if (newId) {
                                            const profile = laborRates.find((r: any) => r.id === newId);
                                            if (profile) {
                                              const profileRate = getLaborBurdenedRate(newId);
                                              current[idx].labor = {
                                                id: profile.id,
                                                role: profile.role,
                                                burdenedHourlyRate: profileRate,
                                              };
                                              current[idx].rate = profileRate;
                                            }
                                          } else {
                                            current[idx].labor = undefined;
                                          }
                                          updateBidItem(item.id, "laborEntries", current);
                                          // recompute aggregate for item using editable rate override if present
                                          const lC = current.reduce((s, e) => {
                                            const r = e.rate != null ? e.rate : (e.labor && typeof e.labor.burdenedHourlyRate === "number") ? e.labor.burdenedHourlyRate : getLaborBurdenedRate(e.rateId || "");
                                            return s + r * (e.hours || 0);
                                          }, 0);
                                          const eC = (item.equipmentEntries || []).reduce((s, e) => {
                                            const er = e.rate != null ? e.rate : getEquipmentCostPerHour(e.rateId || "");
                                            return s + er * (e.hours || 0);
                                          }, 0);
                                          const mC = (item.materialEntries || []).reduce((s, m) => {
                                            const mr = m.rate != null ? m.rate : getMaterialCostPerUnit(m.rateId || "");
                                            return s + mr * (m.quantity || 0);
                                          }, 0);
                                          const tC = Math.round((lC + eC + mC) * 100) / 100;
                                          const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                          updateBidItem(item.id, "realCost", tC);
                                          updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                        }}
                                        disabled={isReadOnly}
                                      >
                                        <SelectTrigger className="h-8 text-lg">
                                          <SelectValue placeholder="Select labor rate" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {laborRates.length > 0 ? (
                                            [
                                              <SelectItem key="none" value="none">— None —</SelectItem>,
                                              ...laborRates
                                                .filter((r: any, i, self) => i === self.findIndex((t) => t.id === r.id))
                                                .map((r: any) => (
                                                  <SelectItem key={r.id} value={r.id}>{r.role}</SelectItem>
                                                ))
                                            ]
                                          ) : (
                                            <SelectItem key="no-labor" value="no-labor" disabled>No saved labor profiles</SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>
                                        <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={entry.hours || ""}
                                          onChange={(e) => {
                                            const h = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.laborEntries || [])];
                                            current[idx] = { ...current[idx], hours: h };
                                            updateBidItem(item.id, "laborEntries", current);
                                            const lC = current.reduce((s, ent) => {
                                              const r = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + r * (ent.hours || 0);
                                            }, 0);
                                            const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = (item.materialEntries || []).reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          ref={(el) => {
                                            if (el && pendingCostingFocus && pendingCostingFocus.itemId === item.id && pendingCostingFocus.category === 'labor' && pendingCostingFocus.idx === idx) {
                                              el.focus();
                                              el.select();
                                              setPendingCostingFocus(null);
                                            }
                                          }}
                                          className="h-8 w-16 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.25"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">hrs</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={rate || ""}
                                          onChange={(e) => {
                                            const r = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.laborEntries || [])];
                                            current[idx] = { ...current[idx], rate: r };
                                            updateBidItem(item.id, "laborEntries", current);
                                            const lC = current.reduce((s, ent) => {
                                              const rr = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + rr * (ent.hours || 0);
                                            }, 0);
                                            const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = (item.materialEntries || []).reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          className="h-8 w-20 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.01"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">$/hr</span>
                                        </div>
                                      <div className="text-right">
                                        <span className="text-sm">Cost: ${formatMoney(entryCost)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Equipment */}
                              <div className="mb-3">
                                <div className="flex items-center mb-1">
                                  <div className="text-lg font-medium">Equipment</div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs ml-2"
                                    onClick={() => {
                                      const current = item.equipmentEntries || [];
                                      const newEntries = [...current, { rateId: undefined, hours: 0 }];
                                      updateBidItem(item.id, "equipmentEntries", newEntries);
                                      setPendingCostingFocus({ itemId: item.id, category: 'equipment', idx: newEntries.length - 1 });
                                    }}
                                    disabled={isReadOnly}
                                  >
                                    + Add
                                  </Button>
                                </div>
                                <div className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1 text-xs font-semibold text-muted-foreground">
                                  <div></div>
                                  <div className="text-center">Hours</div>
                                  <div className="text-center">Rate</div>
                                  <div className="text-right">Cost</div>
                                </div>
                                {(item.equipmentEntries || []).map((entry, idx) => {
                                  if (entry.group) return null; // grouped (crew) rows render in the crew block below
                                  const rate = entry.rate != null
                                    ? entry.rate
                                    : getEquipmentCostPerHour(entry.rateId || "");
                                  const entryCost = rate * (entry.hours || 0);
                                  return (
                                    <div key={idx} className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1">
                                      <Select
                                        value={entry.rateId || "none"}
                                        onValueChange={(val) => {
                                          const newId = val === "none" ? undefined : val;
                                          const current = [...(item.equipmentEntries || [])];
                                          current[idx] = { ...current[idx], rateId: newId };
                                          if (newId) {
                                            current[idx].rate = getEquipmentCostPerHour(newId);
                                          }
                                          updateBidItem(item.id, "equipmentEntries", current);
                                          const lC = (item.laborEntries || []).reduce((s, ent) => {
                                            const r = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                            return s + r * (ent.hours || 0);
                                          }, 0);
                                          const eC = current.reduce((s, ent) => {
                                            const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                            return s + er * (ent.hours || 0);
                                          }, 0);
                                          const mC = (item.materialEntries || []).reduce((s, ent) => {
                                            const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                            return s + mr * (ent.quantity || 0);
                                          }, 0);
                                          const tC = Math.round((lC + eC + mC) * 100) / 100;
                                          const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                          updateBidItem(item.id, "realCost", tC);
                                          updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                        }}
                                        disabled={isReadOnly}
                                      >
                                        <SelectTrigger className="h-8 text-lg">
                                          <SelectValue placeholder="Select equipment" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {equipmentRates.length > 0 ? (
                                            [
                                              <SelectItem key="none" value="none">— None —</SelectItem>,
                                              ...equipmentRates.map((p: any) => (
                                                <SelectItem key={p.id} value={p.id}>{p.description}</SelectItem>
                                              ))
                                            ]
                                          ) : (
                                            <SelectItem key="no-equip" value="no-equip" disabled>No saved equipment profiles</SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>
                                        <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={entry.hours || ""}
                                          onChange={(e) => {
                                            const h = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.equipmentEntries || [])];
                                            current[idx] = { ...current[idx], hours: h };
                                            updateBidItem(item.id, "equipmentEntries", current);
                                            const lC = (item.laborEntries || []).reduce((s, ent) => {
                                              const r = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + r * (ent.hours || 0);
                                            }, 0);
                                            const eC = current.reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = (item.materialEntries || []).reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          ref={(el) => {
                                            if (el && pendingCostingFocus && pendingCostingFocus.itemId === item.id && pendingCostingFocus.category === 'equipment' && pendingCostingFocus.idx === idx) {
                                              el.focus();
                                              el.select();
                                              setPendingCostingFocus(null);
                                            }
                                          }}
                                          className="h-8 w-16 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.25"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">hrs</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={rate || ""}
                                          onChange={(e) => {
                                            const r = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.equipmentEntries || [])];
                                            current[idx] = { ...current[idx], rate: r };
                                            updateBidItem(item.id, "equipmentEntries", current);
                                            const lC = (item.laborEntries || []).reduce((s, ent) => {
                                              const rr = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + rr * (ent.hours || 0);
                                            }, 0);
                                            const eC = current.reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = (item.materialEntries || []).reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          className="h-8 w-20 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.01"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">$/hr</span>
                                        </div>
                                      <div className="text-right">
                                        <span className="text-sm">Cost: ${formatMoney(entryCost)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Material */}
                              <div className="mb-3">
                                <div className="flex items-center mb-1">
                                  <div className="text-lg font-medium">Material</div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs ml-2"
                                    onClick={() => {
                                      const current = item.materialEntries || [];
                                      const newEntries = [...current, { rateId: undefined, quantity: 0 }];
                                      updateBidItem(item.id, "materialEntries", newEntries);
                                      setPendingCostingFocus({ itemId: item.id, category: 'material', idx: newEntries.length - 1 });
                                    }}
                                    disabled={isReadOnly}
                                  >
                                    + Add
                                  </Button>
                                </div>
                                <div className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1 text-xs font-semibold text-muted-foreground">
                                  <div></div>
                                  <div className="text-center">Qty</div>
                                  <div className="text-center">Rate</div>
                                  <div className="text-right">Cost</div>
                                </div>
                                {(item.materialEntries || []).map((entry, idx) => {
                                  const matProfile = materialRates.find((m: any) => m.id === entry.rateId);
                                  const unitLabel = matProfile?.unitOfMeasure || 'qty';
                                  const rate = entry.rate != null
                                    ? entry.rate
                                    : getMaterialCostPerUnit(entry.rateId || "");
                                  const entryCost = rate * (entry.quantity || 0);
                                  return (
                                    <div key={idx} className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1">
                                      <Select
                                        value={entry.rateId || "none"}
                                        onValueChange={(val) => {
                                          const newId = val === "none" ? undefined : val;
                                          const current = [...(item.materialEntries || [])];
                                          current[idx] = { ...current[idx], rateId: newId };
                                          if (newId) {
                                            current[idx].rate = getMaterialCostPerUnit(newId);
                                          }
                                          updateBidItem(item.id, "materialEntries", current);
                                          const lC = (item.laborEntries || []).reduce((s, ent) => {
                                            const r = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                            return s + r * (ent.hours || 0);
                                          }, 0);
                                          const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                            const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                            return s + er * (ent.hours || 0);
                                          }, 0);
                                          const mC = current.reduce((s, ent) => {
                                            const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                            return s + mr * (ent.quantity || 0);
                                          }, 0);
                                          const tC = Math.round((lC + eC + mC) * 100) / 100;
                                          const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                          updateBidItem(item.id, "realCost", tC);
                                          updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                        }}
                                        disabled={isReadOnly}
                                      >
                                        <SelectTrigger className="h-8 text-lg">
                                          <SelectValue placeholder="Select material" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {materialRates.length > 0 ? (
                                            [
                                              <SelectItem key="none" value="none">— None —</SelectItem>,
                                              ...materialRates.map((m: any) => (
                                                <SelectItem key={m.id} value={m.id}>{m.description}</SelectItem>
                                              ))
                                            ]
                                          ) : (
                                            <SelectItem key="no-mat" value="no-mat" disabled>No saved material profiles</SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>
                                        <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={entry.quantity || ""}
                                          onChange={(e) => {
                                            const q = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.materialEntries || [])];
                                            current[idx] = { ...current[idx], quantity: q };
                                            updateBidItem(item.id, "materialEntries", current);
                                            const lC = (item.laborEntries || []).reduce((s, ent) => {
                                              const r = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + r * (ent.hours || 0);
                                            }, 0);
                                            const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = current.reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          ref={(el) => {
                                            if (el && pendingCostingFocus && pendingCostingFocus.itemId === item.id && pendingCostingFocus.category === 'material' && pendingCostingFocus.idx === idx) {
                                              el.focus();
                                              el.select();
                                              setPendingCostingFocus(null);
                                            }
                                          }}
                                          className="h-8 w-16 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.1"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">{unitLabel}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={rate || ""}
                                          onChange={(e) => {
                                            const r = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.materialEntries || [])];
                                            current[idx] = { ...current[idx], rate: r };
                                            updateBidItem(item.id, "materialEntries", current);
                                            const lC = (item.laborEntries || []).reduce((s, ent) => {
                                              const rr = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + rr * (ent.hours || 0);
                                            }, 0);
                                            const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = current.reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          className="h-8 w-20 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.01"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">unit</span>
                                        </div>
                                      <div className="text-right">
                                        <span className="text-sm">Cost: ${formatMoney(entryCost)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Miscellaneous */}
                              <div className="mb-3">
                                <div className="flex items-center mb-1">
                                  <div className="text-lg font-medium">Miscellaneous</div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs ml-2"
                                    onClick={() => {
                                      const current = item.miscellaneousEntries || [];
                                      const newEntries = [...current, { rateId: undefined, quantity: 0 }];
                                      updateBidItem(item.id, "miscellaneousEntries", newEntries);
                                      setPendingCostingFocus({ itemId: item.id, category: 'misc', idx: newEntries.length - 1 });
                                    }}
                                    disabled={isReadOnly}
                                  >
                                    + Add
                                  </Button>
                                </div>
                                <div className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1 text-xs font-semibold text-muted-foreground">
                                  <div></div>
                                  <div className="text-center">Qty</div>
                                  <div className="text-center">Rate</div>
                                  <div className="text-right">Cost</div>
                                </div>
                                {(item.miscellaneousEntries || []).map((entry, idx) => {
                                  const miscProfile = miscRates.find((m: any) => m.id === entry.rateId);
                                  const unitLabel = miscProfile?.unitOfMeasure || 'amt';
                                  const rate = entry.rate != null ? entry.rate : getMiscCostPerUnit(entry.rateId || "");
                                  const entryCost = rate * (entry.quantity || 0);
                                  return (
                                    <div key={idx} className="grid grid-cols-[auto_auto_auto_auto] gap-2 items-center mb-1">
                                      <div className="flex flex-col">
                                        <Select
                                          value={entry.rateId || "none"}
                                          onValueChange={(val) => {
                                            const newId = val === "none" ? undefined : val;
                                            const current = [...(item.miscellaneousEntries || [])];
                                            current[idx] = { ...current[idx], rateId: newId };
                                            if (newId) {
                                              current[idx].rate = getMiscCostPerUnit(newId);
                                              delete current[idx].description;
                                            }
                                            updateBidItem(item.id, "miscellaneousEntries", current);
                                            const lC = (item.laborEntries || []).reduce((s, ent) => {
                                              const r = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + r * (ent.hours || 0);
                                            }, 0);
                                            const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = (item.materialEntries || []).reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const miscC = current.reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMiscCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC + miscC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          disabled={isReadOnly}
                                        >
                                          <SelectTrigger className="h-8 text-lg">
                                            <SelectValue placeholder="Select misc / custom" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {miscRates.length > 0 ? (
                                              [
                                                <SelectItem key="none" value="none">— None —</SelectItem>,
                                                ...miscRates.map((m: any) => (
                                                  <SelectItem key={m.id} value={m.id}>{m.description}</SelectItem>
                                                ))
                                              ]
                                            ) : (
                                              <SelectItem key="no-misc" value="no-misc" disabled>No saved misc profiles</SelectItem>
                                            )}
                                          </SelectContent>
                                        </Select>
                                        {(!entry.rateId || entry.rateId === "none") && (
                                          <Input
                                            value={entry.description || ""}
                                            onChange={(e) => {
                                              const d = e.target.value;
                                              const current = [...(item.miscellaneousEntries || [])];
                                              current[idx] = { ...current[idx], description: d };
                                              updateBidItem(item.id, "miscellaneousEntries", current);
                                            }}
                                            className="h-7 text-sm mt-0.5"
                                            placeholder="Free-text description"
                                            disabled={isReadOnly}
                                          />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={entry.quantity || ""}
                                          onChange={(e) => {
                                            const q = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.miscellaneousEntries || [])];
                                            current[idx] = { ...current[idx], quantity: q };
                                            updateBidItem(item.id, "miscellaneousEntries", current);
                                            const lC = (item.laborEntries || []).reduce((s, ent) => {
                                              const r = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + r * (ent.hours || 0);
                                            }, 0);
                                            const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = (item.materialEntries || []).reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const miscC = current.reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMiscCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC + miscC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          ref={(el) => {
                                            if (el && pendingCostingFocus && pendingCostingFocus.itemId === item.id && pendingCostingFocus.category === 'misc' && pendingCostingFocus.idx === idx) {
                                              el.focus();
                                              el.select();
                                              setPendingCostingFocus(null);
                                            }
                                          }}
                                          className="h-8 w-16 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.1"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">{unitLabel}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={rate || ""}
                                          onChange={(e) => {
                                            const r = Math.max(0, parseFloat(e.target.value) || 0);
                                            const current = [...(item.miscellaneousEntries || [])];
                                            current[idx] = { ...current[idx], rate: r };
                                            updateBidItem(item.id, "miscellaneousEntries", current);
                                            const lC = (item.laborEntries || []).reduce((s, ent) => {
                                              const rr = ent.rate != null ? ent.rate : (ent.labor && typeof ent.labor.burdenedHourlyRate === "number") ? ent.labor.burdenedHourlyRate : getLaborBurdenedRate(ent.rateId || "");
                                              return s + rr * (ent.hours || 0);
                                            }, 0);
                                            const eC = (item.equipmentEntries || []).reduce((s, ent) => {
                                              const er = ent.rate != null ? ent.rate : getEquipmentCostPerHour(ent.rateId || "");
                                              return s + er * (ent.hours || 0);
                                            }, 0);
                                            const mC = (item.materialEntries || []).reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMaterialCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const miscC = current.reduce((s, ent) => {
                                              const mr = ent.rate != null ? ent.rate : getMiscCostPerUnit(ent.rateId || "");
                                              return s + mr * (ent.quantity || 0);
                                            }, 0);
                                            const tC = Math.round((lC + eC + mC + miscC) * 100) / 100;
                                            const rGp = effectiveLineTotal > 0 ? Math.round(((effectiveLineTotal - tC) / effectiveLineTotal * 100) * 10) / 10 : 100;
                                            updateBidItem(item.id, "realCost", tC);
                                            updateBidItem(item.id, "realGrossProfitPercent", rGp);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const current = e.currentTarget as HTMLInputElement;
                                              const panel = current.closest('div[data-panel="costing"]');
                                              if (panel) {
                                                const numerics = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
                                                const i = numerics.indexOf(current);
                                                if (i !== -1 && i < numerics.length - 1) {
                                                  const next = numerics[i + 1];
                                                  next.focus();
                                                  next.select();
                                                } else {
                                                  current.blur();
                                                }
                                              }
                                            }
                                          }}
                                          ref={(el) => {
                                            if (el && pendingCostingFocus && pendingCostingFocus.itemId === item.id && pendingCostingFocus.category === 'misc' && pendingCostingFocus.idx === idx) {
                                              el.focus();
                                              el.select();
                                              setPendingCostingFocus(null);
                                            }
                                          }}
                                          className="h-8 w-20 text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          step="0.01"
                                          placeholder=""
                                          disabled={isReadOnly}
                                        />
                                        <span className="text-sm text-muted-foreground">unit</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-sm">Cost: ${formatMoney(entryCost)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="border-t pt-3 mt-2 flex flex-wrap gap-x-8 text-lg">
                                <div>Total Cost: <span className="font-semibold tabular-nums">${formatMoney(computedItemCost)}</span></div>
                                <div>Real GP: <span className="font-semibold tabular-nums">${formatMoney(effectiveLineTotal - computedItemCost)}</span> <span className="tabular-nums">({computedItemGpPct.toFixed(1)}%)</span></div>
                                {estimate.workTypeName && targetMargin > 0 && (
                                  <div className="text-muted-foreground">Target: {targetMargin.toFixed(0)}%</div>
                                )}
                              </div>
                              <div className="text-base text-muted-foreground mt-2">Real GP% updates this EPP line item (replaces 100% assumption). Data is EPP-only.</div>
                              {/* Persistent target margin guidance — always visible (live) when costs exist, positioned after the blue note */}
                              <div className="mt-2 p-2 border border-amber-200 bg-amber-50/60 dark:bg-amber-950/60 dark:border-amber-800 rounded text-sm">
                                {!hasEnteredCosts ? (
                                  <div className="text-muted-foreground">Enter costs above to see target price guidance.</div>
                                ) : canShowTargetGuidance ? (
                                  <div className="space-y-0.5">
                                    <div>
                                      To hit your {targetPctForGuidance.toFixed(0)}% target margin you need to sell this line for: <span className="font-semibold tabular-nums">${formatMoney(requiredLineTotalLive)}</span>
                                    </div>
                                    <div>
                                      Gross Profit on this line would be: <span className="font-semibold tabular-nums">${formatMoney(requiredGPLive)}</span> <span className="tabular-nums">({targetPctForGuidance.toFixed(0)}%)</span>
                                    </div>
                                    {guidanceStatus && (
                                      <div className="pt-0.5">
                                        <span className="text-muted-foreground">Status:</span> <span className={`font-medium ${guidanceStatusClass}`}>{guidanceStatus}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-muted-foreground">Select a Work Type to enable target margin guidance.</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Running Total Revenue at the bottom of the table — classic paper feel */}
          <div className="border-t bg-muted/40 px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-medium tracking-wide text-muted-foreground">TOTAL REVENUE (RECOMMENDED BID)</div>
            <div className="text-3xl font-semibold tabular-nums tracking-tighter">
              ${formatMoney(eppSellingPrice)}
            </div>
          </div>

          {/* EPP Summary Banner — Estimate Total (line totals) | Actual Cost (real costs from panels) | Gross Profit $ | Gross Margin % | Target % | status badge */}
          <div className="border-t border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-4 py-1.5 flex items-center justify-between text-lg">
            <div className="text-amber-900 dark:text-amber-200 flex-1">
              <div className="grid grid-cols-5 gap-x-6 text-center">
                <div className="flex flex-col">
                  <span className="font-semibold text-amber-950 dark:text-amber-100">Estimate Total:</span>
                  <span className="tabular-nums">${formatMoney(eppSellingPrice)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-amber-950 dark:text-amber-100">Actual Cost:</span>
                  <span className="tabular-nums">${formatMoney(eppRealCost)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-amber-950 dark:text-amber-100">Gross Profit:</span>
                  <span className="tabular-nums">${formatMoney(eppGrossProfitDollars)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-amber-950 dark:text-amber-100">Gross Margin:</span>
                  <span className="tabular-nums">{eppGrossProfitPercent.toFixed(1)}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-amber-950 dark:text-amber-100">Target:</span>
                  <span className="tabular-nums">{eppTargetPercent.toFixed(0)}%</span>
                </div>
              </div>
            </div>
            <div
              className={cn(
                "px-2 py-0.5 rounded font-medium text-base",
                eppOnTarget ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
              )}
            >
              {eppOnTarget ? "On Target" : "Below Target"}
            </div>
          </div>

          {/* Save EPP Quote button — near the bottom of the EPP / BID ITEMS section */}
          <div className="border-t px-4 py-3 flex items-center justify-end bg-muted/10 gap-2">
            {isReadOnly && (
              <div className="text-xs text-amber-700 mr-auto">Read-only (locked quote)</div>
            )}
            {eppSaveAttempted && eppItemError && !isReadOnly && (
              <div className="text-xs text-red-600 mr-auto">{eppItemError}</div>
            )}
            <Button
              variant="outline"
              size="default"
              onClick={() => {
                // reset defaults each time modal opens
                setExportType('quote');
                setShowQuantities(true);
                setShowUnits(true);
                setShowPerUnitPrice(true);
                setShowLineItemPrices(true);
                // Stage 2: preselect default terms block (or first, or null)
                const termsList = getAllTerms();
                const defaultTerm = termsList.find((t: TermsBlock) => t.isDefault) || termsList[0] || null;
                setSelectedTermsId(defaultTerm ? defaultTerm.id : null);
                setShowUpdateExport(true);
              }}
              disabled={!eppHasItems}
              className="font-semibold"
            >
              Preview & Export Quote
            </Button>
            <Button
              size="default"
              onClick={handleSaveEPPQuote}
              disabled={isReadOnly || !eppHasItems || isSavingEPP}
              title={!eppHasItems ? "Add items first" : undefined}
              className={cn(
                "font-semibold shadow-sm",
                (!eppHasItems || isReadOnly || isSavingEPP) && "opacity-60 cursor-not-allowed"
              )}
            >
              Save EPP Quote
            </Button>
          </div>
        </Card>
        )}
      </div>

      {/* Update Export Modal */}
      <Dialog open={showUpdateExport} onOpenChange={setShowUpdateExport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Update Export</DialogTitle>
            <DialogDescription>Choose what appears on the customer quote and PDF.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Logo upload (simple, for PDF) */}
            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Company Logo (optional, PNG/JPG)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const dataUrl = ev.target?.result as string;
                        setLogoDataUrl(dataUrl);
                        try {
                          localStorage.setItem('pmz_quote_logo', dataUrl);
                        } catch {}
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="text-xs"
                />
                {logoDataUrl && (
                  <div className="flex items-center gap-2">
                    <img src={logoDataUrl} alt="logo preview" className="h-8 w-auto border" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setLogoDataUrl(null);
                        try { localStorage.removeItem('pmz_quote_logo'); } catch {}
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Type section */}
            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Type</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportType"
                    value="quote"
                    checked={exportType === 'quote'}
                    onChange={() => setExportType('quote')}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Quote</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportType"
                    value="estimate"
                    checked={exportType === 'estimate'}
                    onChange={() => setExportType('estimate')}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Estimate</span>
                </label>
              </div>
            </div>

            {/* Terms & Conditions selector (Stage 2) */}
            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Terms &amp; Conditions</Label>
              <Select
                value={selectedTermsId || "none"}
                onValueChange={(val) => setSelectedTermsId(val === "none" ? null : val)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {getAllTerms().map((t: TermsBlock) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{t.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer & Location Information (Phase 1) */}
            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Customer &amp; Location Information</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBillTo}
                    onChange={(e) => setShowBillTo(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Bill To address</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showJobSite}
                    onChange={(e) => setShowJobSite(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Job Site address</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrimaryContact}
                    onChange={(e) => setShowPrimaryContact(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Primary Contact name + phone/email</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAccessNotes}
                    onChange={(e) => setShowAccessNotes(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Access Notes / Delivery Instructions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGPS}
                    onChange={(e) => setShowGPS(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show GPS Coordinates</span>
                </label>
              </div>
            </div>

            {/* Checkboxes */}
            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Options</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showQuantities}
                    onChange={(e) => setShowQuantities(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Quantities</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showUnits}
                    onChange={(e) => setShowUnits(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Units of Measure</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPerUnitPrice}
                    onChange={(e) => setShowPerUnitPrice(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Per Unit Price</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLineItemPrices}
                    onChange={(e) => setShowLineItemPrices(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm">Show Line Item Prices</span>
                </label>
              </div>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button
              variant="destructive"
              size="default"
              onClick={handleExportNext}
              className="font-semibold"
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => setShowUpdateExport(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Real LEM Breakdown (Pro View) — basic structural placeholder */}
      <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/40 dark:border-emerald-700 p-5 text-sm space-y-3" style={{ display: 'none' }}>
        <div
          className="font-semibold text-emerald-900 flex items-center gap-2 cursor-pointer"
          onClick={toggleProViewCollapsed}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleProViewCollapsed(); }}
            className="text-emerald-900 hover:text-emerald-700 focus:outline-none cursor-pointer"
            aria-label={proViewCollapsed ? "Expand Pro View" : "Collapse Pro View"}
          >
            {proViewCollapsed ? "▶" : "▼"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleProViewCollapsed(); }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900"
          >
            {proViewCollapsed ? "Expand" : "Collapse"}
          </button>
          <Calculator className="h-4 w-4" /> Full Real LEM Breakdown (Pro View)
        </div>
        {!proViewCollapsed && (
        <>
        {/* Interactive adders - three columns (hidden in read-only) */}
        {!isReadOnly && (
        <div className="grid grid-cols-3 gap-3 pt-2">
          {/* Labor column */}
          <div className="border rounded p-2.5 bg-white/70">
            <div className="font-medium text-emerald-900 mb-1">Labor</div>
            {(() => {
              const found = pendingLabor;
              return found ? <div className="text-[9px] text-emerald-800/90 truncate mb-1">{found.role}</div> : null;
            })()}
            <div className="flex gap-1 items-end">
              <Select value={pendingLabor?.id || ""} onValueChange={(val) => {
                if (!val) {
                  setPendingLabor(null);
                  return;
                }
                const profile = laborProfiles.find((p: any) => p.id === val);
                if (profile) {
                  let burdenedHourlyRate = 0;
                  try {
                    const res = calculateLaborRate(profile as LaborRateInputs);
                    burdenedHourlyRate = res.trueCostPerBillableHour || 0;
                  } catch {}
                  setPendingLabor({
                    id: profile.id,
                    role: profile.role || "Labor",
                    burdenedHourlyRate,
                  });
                }
              }}>
                <SelectTrigger className="h-8 text-xs flex-1 max-w-[110px] truncate"><SelectValue placeholder="Select role..." /></SelectTrigger>
                <SelectContent>
                  {laborProfiles.length > 0 ? (
                    laborProfiles
                      .filter((p: any, idx: number, self: any[]) => idx === self.findIndex((t: any) => t.id === p.id))
                      .map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.role}</SelectItem>
                      ))
                  ) : <div className="p-2 text-xs text-muted-foreground">No labor profiles saved. <Link href="/labor-rates" className="underline">Go add your rates in the Labor Builder</Link></div>}
                </SelectContent>
              </Select>
              <input type="text" inputMode="numeric" value={pendingLaborQtyEdit !== "" ? pendingLaborQtyEdit : (pendingLaborQty === 0 ? '' : pendingLaborQty.toString())} onChange={e => {
                const raw = e.target.value;
                setPendingLaborQtyEdit(raw);
                const trimmed = raw.trim();
                if (trimmed === '' || trimmed === '.' || trimmed === '-') {
                  setPendingLaborQty(0);
                } else {
                  const n = parseFloat(trimmed);
                  if (!isNaN(n) && n >= 0) {
                    setPendingLaborQty(n);
                  }
                }
              }} onBlur={() => setPendingLaborQtyEdit("")} className="h-8 w-14 text-xs text-right tabular-nums" />
              <Button size="sm" className="h-8 px-2 text-xs" onClick={() => {
                if (pendingLabor) {
                  const rate = pendingLabor.burdenedHourlyRate;
                  const finalQty = pendingLaborQty || 40;
                  const newItem = {
                    id: Math.random().toString(36).slice(2, 11),
                    type: 'labor',
                    profileId: pendingLabor.id,
                    description: pendingLabor.role || 'Labor',
                    quantity: finalQty,
                    unitCost: rate,
                  };
                  setRealLEMItems((prev: any[]) => [...prev, newItem]);
                  setPendingLabor(null);
                  setPendingLaborQty(0);
                  setPendingLaborQtyEdit("");
                }
              }}>Add Labor</Button>
            </div>
          </div>

          {/* Equipment column */}
          <div className="border rounded p-2.5 bg-white/70">
            <div className="font-medium text-emerald-900 mb-1">Equipment</div>
            {(() => {
              const found = equipmentProfiles.find((p: any) => p.id === pendingEquipId);
              return found ? <div className="text-[9px] text-emerald-800/90 truncate mb-1">{found.description}</div> : null;
            })()}
            <div className="flex gap-1 items-end">
              <Select value={pendingEquipId} onValueChange={setPendingEquipId}>
                <SelectTrigger className="h-8 text-xs flex-1 max-w-[110px] truncate"><SelectValue placeholder="Select equipment..." /></SelectTrigger>
                <SelectContent>
                  {equipmentProfiles.length > 0 ? equipmentProfiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.description}</SelectItem>
                  )) : <div className="p-2 text-xs text-muted-foreground">No equipment profiles saved. <Link href="/equipment-rates" className="underline">Go add your rates in the Equipment Builder</Link></div>}
                </SelectContent>
              </Select>
              <input type="text" inputMode="numeric" value={pendingEquipQtyEdit !== "" ? pendingEquipQtyEdit : (pendingEquipQty === 0 ? '' : pendingEquipQty.toString())} onChange={e => {
                const raw = e.target.value;
                setPendingEquipQtyEdit(raw);
                const trimmed = raw.trim();
                if (trimmed === '' || trimmed === '.' || trimmed === '-') {
                  setPendingEquipQty(0);
                } else {
                  const n = parseFloat(trimmed);
                  if (!isNaN(n) && n >= 0) {
                    setPendingEquipQty(n);
                  }
                }
              }} onBlur={() => setPendingEquipQtyEdit("")} className="h-8 w-14 text-xs text-right tabular-nums" />
              <Button size="sm" className="h-8 px-2 text-xs" onClick={() => {
                if (pendingEquipId) {
                  const profile = equipmentProfiles.find((p: any) => p.id === pendingEquipId);
                  if (profile) {
                    const rate = (typeof getRealRateForProfile === 'function') ? getRealRateForProfile('equipment', profile) : 0;
                    const finalQty = pendingEquipQty || 20;
                    const newItem = {
                      id: Math.random().toString(36).slice(2, 11),
                      type: 'equipment',
                      profileId: pendingEquipId,
                      description: profile.description || 'Equipment',
                      quantity: finalQty,
                      unitCost: rate,
                    };
                    setRealLEMItems((prev: any[]) => [...prev, newItem]);
                  }
                  setPendingEquipId('');
                  setPendingEquipQty(0);
                  setPendingEquipQtyEdit("");
                }
              }}>Add Equip</Button>
            </div>
          </div>

          {/* Material column */}
          <div className="border rounded p-2.5 bg-white/70">
            <div className="font-medium text-emerald-900 mb-1">Material</div>
            {(() => {
              const found = materialProfiles.find((p: any) => p.id === pendingMatId);
              return found ? <div className="text-[9px] text-emerald-800/90 truncate mb-1">{found.description}</div> : null;
            })()}
            <div className="flex gap-1 items-end">
              <Select value={pendingMatId} onValueChange={setPendingMatId}>
                <SelectTrigger className="h-8 text-xs flex-1 max-w-[110px] truncate"><SelectValue placeholder="Select material..." /></SelectTrigger>
                <SelectContent>
                  {materialProfiles.length > 0 ? materialProfiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.description}</SelectItem>
                  )) : <div className="p-2 text-xs text-muted-foreground">No material profiles saved. <Link href="/material-rates" className="underline">Go add your rates in the Material Builder</Link></div>}
                </SelectContent>
              </Select>
              <input type="text" inputMode="numeric" value={pendingMatQtyEdit !== "" ? pendingMatQtyEdit : (pendingMatQty === 0 ? '' : pendingMatQty.toString())} onChange={e => {
                const raw = e.target.value;
                setPendingMatQtyEdit(raw);
                const trimmed = raw.trim();
                if (trimmed === '' || trimmed === '.' || trimmed === '-') {
                  setPendingMatQty(0);
                } else {
                  const n = parseFloat(trimmed);
                  if (!isNaN(n) && n >= 0) {
                    setPendingMatQty(n);
                  }
                }
              }} onBlur={() => setPendingMatQtyEdit("")} className="h-8 w-14 text-xs text-right tabular-nums" />
              <Button size="sm" className="h-8 px-2 text-xs" onClick={() => {
                if (pendingMatId) {
                  const profile = materialProfiles.find((p: any) => p.id === pendingMatId);
                  if (profile) {
                    const rate = (typeof getRealRateForProfile === 'function') ? getRealRateForProfile('material', profile) : 0;
                    const finalQty = pendingMatQty || 10;
                    const newItem = {
                      id: Math.random().toString(36).slice(2, 11),
                      type: 'material',
                      profileId: pendingMatId,
                      description: profile.description || 'Material',
                      quantity: finalQty,
                      unitCost: rate,
                    };
                    setRealLEMItems((prev: any[]) => [...prev, newItem]);
                  }
                  setPendingMatId('');
                  setPendingMatQty(0);
                  setPendingMatQtyEdit("");
                }
              }}>Add Mat</Button>
            </div>
          </div>
        </div>
        )}

        {/* Added Items list */}
        <div className="border-t pt-3">
          <div className="text-[10px] font-medium text-emerald-900 mb-1">Added Items</div>
          {realLEMItems.length > 0 ? (
            <div className="bg-white border rounded overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20 text-right">Qty/Hrs</TableHead>
                    <TableHead className="w-20 text-right">Unit Rate</TableHead>
                    <TableHead className="w-24 text-right">Line Total</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {realLEMItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium py-1">{item.description}</TableCell>
                      <TableCell className="text-right py-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={qtyEdits[item.id] !== undefined ? qtyEdits[item.id] : (item.quantity === 0 ? '' : item.quantity.toString())}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setQtyEdits(prev => ({ ...prev, [item.id]: raw }));
                            const trimmed = raw.trim();
                            if (trimmed === '' || trimmed === '.' || trimmed === '-') {
                              updateRealLEMQuantity(item.id, 0);
                            } else {
                              const num = parseFloat(trimmed);
                              if (!isNaN(num) && num >= 0) {
                                updateRealLEMQuantity(item.id, num);
                              }
                            }
                          }}
                          onBlur={() => {
                            setQtyEdits(prev => {
                              const { [item.id]: _, ...rest } = prev;
                              return rest;
                            });
                          }}
                          className="h-7 w-16 text-xs text-right tabular-nums border border-input px-1"
                          placeholder="0"
                          disabled={isReadOnly}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs py-1">${formatMoney(item.unitCost)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium py-1">${formatMoney(item.quantity * item.unitCost)}</TableCell>
                      <TableCell className="py-1">
                        {!isReadOnly && (
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-red-600 hover:text-red-800" onClick={() => removeRealLEMItem(item.id)}>
                            ×
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">No items added yet. Use the columns above to add Labor, Equipment, or Material from your saved profiles.</div>
          )}
        </div>

        {/* Summary totals */}
        <div className="pt-2 border-t text-xs">
          <div className="flex justify-between">
            <span>Total Labor Cost</span>
            <span className="font-medium tabular-nums">${formatMoney(realLaborCost)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Equipment Cost</span>
            <span className="font-medium tabular-nums">${formatMoney(realEquipCost)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Material Cost</span>
            <span className="font-medium tabular-nums">${formatMoney(realMatCost)}</span>
          </div>
        </div>

        {/* Profit Summary */}
        <div className="pt-3 border-t">
          <div className="border rounded p-2.5 bg-white/70">
            <div className="text-[10px] font-medium text-emerald-900 mb-1">Profit Summary</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="flex items-baseline gap-2">
                  <span>Gross Profit %</span>
                  {!isNoTarget && (
                    <span className="text-[10px] text-emerald-700/80 font-normal">Target: {defaultTargetGP.toFixed(0)}%</span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={gpPercentEdit !== "" ? gpPercentEdit : (editableGrossProfitPercent > 0 ? editableGrossProfitPercent.toString() : defaultTargetGP.toString())}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setGpPercentEdit(raw);
                      const trimmed = raw.trim();
                      if (trimmed === '' || trimmed === '.' || trimmed === '-') {
                        setEditableGrossProfitPercent(0);
                      } else {
                        const num = parseFloat(trimmed);
                        if (!isNaN(num)) {
                          setEditableGrossProfitPercent(num);
                        }
                      }
                    }}
                    onBlur={() => setGpPercentEdit("")}
                    className="h-7 w-16 text-sm text-right tabular-nums border border-input px-1"
                    disabled={isReadOnly}
                  />
                  <span>%</span>
                </div>
                <div className="text-[10px] text-emerald-700/70 mt-1 leading-snug">This is true gross profit margin (not markup). Margin is what you actually keep out of the selling price.</div>
                {!estimate.workTypeName && (
                  <div className="mt-1 text-[10px] text-amber-700">
                    Select a Work Type above to activate your margin target and guardrails.
                  </div>
                )}
              </div>
              <div>
                <span>Gross Profit $</span>
                <span className="font-semibold tabular-nums">${formatMoney(computedGrossProfit)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grand Total */}
        <div className="pt-4 border-t-2 border-gray-300">
          <div className={grandTotalCardClass}>
            <div className={`font-bold mb-2 flex items-start justify-between ${grandTotalTitleClass}`}>
              <span>Grand Total</span>
              {!isNoTarget && (
                (editableGrossProfitPercent > 0 ? editableGrossProfitPercent : defaultTargetGP) >= defaultTargetGP ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#4ade80] dark:bg-emerald-700 text-white text-[10px] font-medium">On Target</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-[#f87171] dark:bg-red-700 text-white text-[10px] font-medium">Below Target — Margin is under your work type goal</span>
                )
              )}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Total Real LEM Cost</span>
                <span className="font-semibold tabular-nums">${formatMoney(realTotalLEM)}</span>
              </div>
              <div className="flex justify-between">
                <span>Gross Profit % {!isNoTarget && <span className="text-[9px] text-muted-foreground/70">(Target: {defaultTargetGP.toFixed(0)}%)</span>}</span>
                <span className="font-semibold tabular-nums">{currentGPPercent.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Gross Profit $</span>
                <span className="font-semibold tabular-nums">${formatMoney(computedGrossProfit)}</span>
              </div>
              <div className="flex justify-between border-t-2 pt-2 mt-1 font-bold text-base bg-white/30 dark:bg-white/10 -mx-1 px-1 rounded">
                <span className="text-lg">Grand Total</span>
                <span className={grandTotalNumberClass}>
                  ${formatMoney(computedGrandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

          {/* Save Full Quote button — near the bottom of the Full Real LEM Breakdown (Pro View) section */}
          <div className="pt-3 flex items-center justify-end gap-2">
            {isReadOnly && (
              <div className="text-xs text-amber-700 mr-auto">Read-only (locked quote)</div>
            )}
            {proSaveAttempted && proItemError && !isReadOnly && (
              <div className="text-xs text-red-600 mr-auto">{proItemError}</div>
            )}
            <Button
              size="default"
              onClick={handleSaveFullQuote}
              disabled={isReadOnly || !proHasItems || isSavingFull}
              title={!proHasItems ? "Add items first" : undefined}
              className={cn(
                "font-semibold shadow-sm",
                (!proHasItems || isReadOnly || isSavingFull) && "opacity-60 cursor-not-allowed"
              )}
            >
              Save Full Quote
            </Button>
          </div>

        </>
        )}
      </div>

      {/* Educational Dialog (the curiosity hook) */}
      {showCostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCostDialog(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-xl font-semibold tracking-tight mb-2">Ready to see your real costs?</div>
            <p className="text-muted-foreground mb-4">
              You just built a clean bid the way you always do on paper. Now the real question is:
            </p>
            <p className="font-medium mb-4">“What would the actual Labor + Equipment + Material costs be for this job?”</p>

            <div className="rounded-lg bg-muted/50 p-4 text-sm mb-4">
              Based on the <strong>{targetMargin.toFixed(1)}%</strong> target margin for this work type and size, 
              your total direct costs (L+E+M) need to stay at or below <strong>${formatMoney(MaxDirectCost)}</strong> 
              to hit your goal on a ${formatMoney(targetBidPrice)} bid.
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Your saved rates in the Labor, Equipment, and Material builders already contain the true burdened costs. 
              In the next levels we will connect them directly to this bid sheet.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" onClick={() => setShowCostDialog(false)}>
                <Link href="/labor-rates">Go to Labor Rates</Link>
              </Button>
              <Button asChild variant="outline" onClick={() => setShowCostDialog(false)}>
                <Link href="/equipment-rates">Go to Equipment Rates</Link>
              </Button>
              <Button asChild variant="outline" onClick={() => setShowCostDialog(false)}>
                <Link href="/material-rates">Go to Material Rates</Link>
              </Button>
              <Button className="ml-auto" onClick={() => setShowCostDialog(false)}>Got it</Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto pt-2">
        Level 1 — Digital Paper &amp; Pencil. Build the bid first. The button above is the on-ramp to understanding your real gross profit.
      </p>
    </div>
  );
}
