"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tags, Plus, RotateCcw, Edit2, Save, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { PercentInput } from "@/components/ui/percent-input";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pmz_work_types_v2";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

interface PricingTier {
  id: string;
  low: number;             // e.g. 0, 5001, 15001...
  high: number | null;     // null = "and up" / no upper bound
  targetGpPercent: number;
  label: string;           // derived for display + Overview compatibility, e.g. "$0 – $5,000", "$75,001 – $100,000" (always full range)
}

interface WorkType {
  id: string;
  name: string;
  tiers: PricingTier[];
  notes?: string;
}

interface TierPerformance {
  label: string;
  jobs: number;            // total bids in this range
  accepted: number;
  revenue: number;         // total revenue from accepted jobs in range
  actualGpPercent: number; // realized GP%
}

interface WorkTypePerformance {
  name: string;
  ttlRevenue: number;
  totalGp: number;
  gpPercent: number;
  targetRevenue: number;
  tiers: TierPerformance[];
  totalBids: number;
  bidsAccepted: number;
}

// Default tier templates (common job size buckets for contractors)
const DEFAULT_TIER_LABELS = [
  "$0 – $5,000",
  "$5,001 – $15,000",
  "$15,001 – $30,000",
  "$30,001 – $75,000",
  "$75,001 – $100,000",
];

/** Format a tier range for display. Always produces a full "$LOW – $HIGH" range.
 *  No special "+" notation for last tier. Safe against null/undefined.
 */
function formatTierRange(low: number | null | undefined, high: number | null | undefined): string {
  const safeLow = (low ?? 0);
  const fmt = (n: number | null | undefined) => (n == null ? '0' : n.toLocaleString());
  const safeHigh = (high ?? 0);
  return `$${fmt(safeLow)} – $${fmt(safeHigh)}`;
}

// Rich realistic 2026 demo data for Builder (targets)
// Tiers now use explicit low/high for granular editing + derived label for compatibility
const demoWorkTypes: WorkType[] = [
  {
    id: createId(),
    name: "Residential Paving",
    notes: "Driveways, patios, sidewalks, small residential lots",
    tiers: [
      { id: createId(), low: 0, high: 5000, targetGpPercent: 29, label: formatTierRange(0, 5000) },
      { id: createId(), low: 5001, high: 15000, targetGpPercent: 27, label: formatTierRange(5001, 15000) },
      { id: createId(), low: 15001, high: 30000, targetGpPercent: 25, label: formatTierRange(15001, 30000) },
      { id: createId(), low: 30001, high: 75000, targetGpPercent: 23, label: formatTierRange(30001, 75000) },
      { id: createId(), low: 75001, high: 100000, targetGpPercent: 21, label: formatTierRange(75001, 100000) },
    ],
  },
  {
    id: createId(),
    name: "Commercial Paving",
    notes: "Parking lots, retail plazas, office complexes, light industrial",
    tiers: [
      { id: createId(), low: 0, high: 5000, targetGpPercent: 24, label: formatTierRange(0, 5000) },
      { id: createId(), low: 5001, high: 15000, targetGpPercent: 23, label: formatTierRange(5001, 15000) },
      { id: createId(), low: 15001, high: 30000, targetGpPercent: 22, label: formatTierRange(15001, 30000) },
      { id: createId(), low: 30001, high: 75000, targetGpPercent: 20, label: formatTierRange(30001, 75000) },
      { id: createId(), low: 75001, high: 100000, targetGpPercent: 18, label: formatTierRange(75001, 100000) },
    ],
  },
  {
    id: createId(),
    name: "Excavation & Site Work",
    notes: "Grading, drainage, base prep, large civil scopes",
    tiers: [
      { id: createId(), low: 0, high: 5000, targetGpPercent: 26, label: formatTierRange(0, 5000) },
      { id: createId(), low: 5001, high: 15000, targetGpPercent: 25, label: formatTierRange(5001, 15000) },
      { id: createId(), low: 15001, high: 30000, targetGpPercent: 24, label: formatTierRange(15001, 30000) },
      { id: createId(), low: 30001, high: 75000, targetGpPercent: 22, label: formatTierRange(30001, 75000) },
      { id: createId(), low: 75001, high: 100000, targetGpPercent: 19, label: formatTierRange(75001, 100000) },
    ],
  },
  {
    id: createId(),
    name: "Sealcoating & Maintenance",
    notes: "Preventive maintenance, crack filling, sealcoating — high repeat",
    tiers: [
      { id: createId(), low: 0, high: 5000, targetGpPercent: 32, label: formatTierRange(0, 5000) },
      { id: createId(), low: 5001, high: 15000, targetGpPercent: 30, label: formatTierRange(5001, 15000) },
      { id: createId(), low: 15001, high: 30000, targetGpPercent: 28, label: formatTierRange(15001, 30000) },
      { id: createId(), low: 30001, high: 75000, targetGpPercent: 26, label: formatTierRange(30001, 75000) },
      { id: createId(), low: 75001, high: 100000, targetGpPercent: 24, label: formatTierRange(75001, 100000) },
    ],
  },
  {
    id: createId(),
    name: "Asphalt Repair & Patch",
    notes: "Pothole repair, utility cuts, small surface restoration",
    tiers: [
      { id: createId(), low: 0, high: 5000, targetGpPercent: 31, label: formatTierRange(0, 5000) },
      { id: createId(), low: 5001, high: 15000, targetGpPercent: 29, label: formatTierRange(5001, 15000) },
      { id: createId(), low: 15001, high: 30000, targetGpPercent: 27, label: formatTierRange(15001, 30000) },
      { id: createId(), low: 30001, high: 75000, targetGpPercent: 25, label: formatTierRange(30001, 75000) },
      { id: createId(), low: 75001, high: 100000, targetGpPercent: 22, label: formatTierRange(75001, 100000) },
    ],
  },
];

// Rich realistic 2026 performance snapshot (actual results)
const demoPerformance: WorkTypePerformance[] = [
  {
    name: "Residential Paving",
    ttlRevenue: 1248000,
    totalGp: 318240,
    gpPercent: 25.5,
    targetRevenue: 1190000,
    tiers: [
      { label: "$0 – $5,000", jobs: 47, accepted: 34, revenue: 118900, actualGpPercent: 27.8 },
      { label: "$5,001 – $15,000", jobs: 29, accepted: 22, revenue: 248600, actualGpPercent: 26.4 },
      { label: "$15,001 – $30,000", jobs: 18, accepted: 15, revenue: 372400, actualGpPercent: 24.9 },
      { label: "$30,001 – $75,000", jobs: 7, accepted: 6, revenue: 328500, actualGpPercent: 23.1 },
      { label: "$75,001 – $100,000", jobs: 3, accepted: 2, revenue: 179600, actualGpPercent: 20.8 },
    ],
    totalBids: 104,
    bidsAccepted: 79,
  },
  {
    name: "Commercial Paving",
    ttlRevenue: 1875000,
    totalGp: 381000,
    gpPercent: 20.3,
    targetRevenue: 1920000,
    tiers: [
      { label: "$0 – $5,000", jobs: 22, accepted: 14, revenue: 68200, actualGpPercent: 22.1 },
      { label: "$5,001 – $15,000", jobs: 31, accepted: 23, revenue: 289400, actualGpPercent: 21.6 },
      { label: "$15,001 – $30,000", jobs: 19, accepted: 14, revenue: 368200, actualGpPercent: 20.8 },
      { label: "$30,001 – $75,000", jobs: 11, accepted: 8, revenue: 472800, actualGpPercent: 19.4 },
      { label: "$75,001 – $100,000", jobs: 6, accepted: 5, revenue: 676400, actualGpPercent: 18.7 },
    ],
    totalBids: 89,
    bidsAccepted: 64,
  },
  {
    name: "Excavation & Site Work",
    ttlRevenue: 965000,
    totalGp: 205545,
    gpPercent: 21.3,
    targetRevenue: 980000,
    tiers: [
      { label: "$0 – $5,000", jobs: 18, accepted: 12, revenue: 49200, actualGpPercent: 24.6 },
      { label: "$5,001 – $15,000", jobs: 14, accepted: 11, revenue: 138500, actualGpPercent: 23.8 },
      { label: "$15,001 – $30,000", jobs: 9, accepted: 7, revenue: 198600, actualGpPercent: 22.1 },
      { label: "$30,001 – $75,000", jobs: 5, accepted: 4, revenue: 261200, actualGpPercent: 20.4 },
      { label: "$75,001 – $100,000", jobs: 3, accepted: 2, revenue: 317500, actualGpPercent: 17.9 },
    ],
    totalBids: 49,
    bidsAccepted: 36,
  },
  {
    name: "Sealcoating & Maintenance",
    ttlRevenue: 612000,
    totalGp: 175644,
    gpPercent: 28.7,
    targetRevenue: 590000,
    tiers: [
      { label: "$0 – $5,000", jobs: 61, accepted: 48, revenue: 162400, actualGpPercent: 30.8 },
      { label: "$5,001 – $15,000", jobs: 27, accepted: 21, revenue: 229800, actualGpPercent: 28.9 },
      { label: "$15,001 – $30,000", jobs: 8, accepted: 7, revenue: 148200, actualGpPercent: 27.4 },
      { label: "$30,001 – $75,000", jobs: 3, accepted: 2, revenue: 71400, actualGpPercent: 25.1 },
      { label: "$75,001 – $100,000", jobs: 1, accepted: 1, revenue: 0, actualGpPercent: 0 }, // small sample
    ],
    totalBids: 100,
    bidsAccepted: 79,
  },
  {
    name: "Asphalt Repair & Patch",
    ttlRevenue: 428000,
    totalGp: 120700,
    gpPercent: 28.2,
    targetRevenue: 410000,
    tiers: [
      { label: "$0 – $5,000", jobs: 84, accepted: 61, revenue: 187200, actualGpPercent: 29.4 },
      { label: "$5,001 – $15,000", jobs: 19, accepted: 14, revenue: 138600, actualGpPercent: 27.8 },
      { label: "$15,001 – $30,000", jobs: 6, accepted: 5, revenue: 102200, actualGpPercent: 26.2 },
      { label: "$30,001 – $75,000", jobs: 0, accepted: 0, revenue: 0, actualGpPercent: 0 },
      { label: "$75,001 – $100,000", jobs: 0, accepted: 0, revenue: 0, actualGpPercent: 0 },
    ],
    totalBids: 109,
    bidsAccepted: 80,
  },
];

interface WorkTypeFormData {
  name: string;
  notes: string;
  tiers: PricingTier[];   // editable copy while in form
}

export default function WorkTypesPage() {
  // === BUILDER STATE (targets + tiers) ===
  const [workTypes, setWorkTypes] = React.useState<WorkType[]>(demoWorkTypes);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [formData, setFormData] = React.useState<WorkTypeFormData>({
    name: "",
    notes: "",
    tiers: [],
  });

  // Per-tier inline editing (for the improved Builder UX)
  const [editingTierId, setEditingTierId] = React.useState<string | null>(null);
  const [editingTierSnapshot, setEditingTierSnapshot] = React.useState<PricingTier | null>(null);

  // === OVERVIEW STATE (2026 performance snapshot) ===
  const [year, setYear] = React.useState(2026);
  const [performance, setPerformance] = React.useState<WorkTypePerformance[]>(demoPerformance);
  const [expanded, setExpanded] = React.useState<string[]>(["Residential Paving"]); // start with one open for demo

  // Tab
  const [activeTab, setActiveTab] = React.useState<'builder' | 'overview'>('overview');

  // Memoized lookup for demo actual performance numbers by work type name.
  // This allows the Overview to always use the live workTypes from Builder for structure/ranges/targets,
  // while keeping the exact same actual numbers (and thus calculations) from the original demo for known work types.
  const actualByName = React.useMemo(() => {
    const map: Record<string, WorkTypePerformance> = {};
    demoPerformance.forEach((p) => {
      map[p.name] = p;
    });
    return map;
  }, []);

  // Derived overview data: always built from the *exact live workTypes* + fixed actual numbers.
  // This guarantees the Overview tab is fully reactive to every Builder save.
  const overviewItems = React.useMemo(() => {
    return workTypes.map((wt) => {
      const actual = actualByName[wt.name] || {
        name: wt.name,
        ttlRevenue: 0,
        totalGp: 0,
        gpPercent: 0,
        targetRevenue: 0,
        totalBids: 0,
        bidsAccepted: 0,
        tiers: [],
      };
      const tiers = wt.tiers.map((tierDef, i) => {
        const at = actual.tiers[i] || { jobs: 0, accepted: 0, revenue: 0, actualGpPercent: 0 };
        return {
          label: formatTierRange(tierDef.low, tierDef.high),
          jobs: at.jobs,
          accepted: at.accepted,
          revenue: at.revenue,
          actualGpPercent: at.actualGpPercent,
        };
      });
      return {
        name: wt.name,
        ttlRevenue: actual.ttlRevenue,
        totalGp: actual.totalGp,
        gpPercent: actual.gpPercent,
        targetRevenue: actual.targetRevenue,
        totalBids: actual.totalBids,
        bidsAccepted: actual.bidsAccepted,
        tiers,
      } as WorkTypePerformance;
    });
  }, [workTypes, actualByName]);

  // Load targets from localStorage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.workTypes) && parsed.workTypes.length > 0) {
          setWorkTypes(parsed.workTypes);
        }
      }
    } catch {}
  }, []);

  // Persist targets
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ workTypes }));
    } catch {}
  }, [workTypes]);

  // Helper: get target GP% for a specific tier label from current builder data
  function getTargetGp(workTypeName: string, tierLabel: string): number {
    const wt = workTypes.find((w) => w.name === workTypeName);
    if (!wt) return 22; // fallback
    const tier = wt.tiers.find((t) => t.label === tierLabel);
    return tier ? tier.targetGpPercent : 22;
  }

  // ==================== BUILDER: Tier helpers (now with low/high + reorder + per-tier edit) ====================

  function updateTierInForm(tierId: string, field: "low" | "high" | "targetGpPercent", value: number | null) {
    setFormData((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => {
        if (t.id !== tierId) return t;
        const updated = { ...t, [field]: value };
        // Always keep label in sync when low or high changes (for Overview matching + display)
        if (field === "low" || field === "high") {
          updated.label = formatTierRange(updated.low, updated.high);
        }
        return updated;
      }),
    }));
  }

  function addNewTier() {
    const last = formData.tiers[formData.tiers.length - 1];

    // Create a tier that feels "blank" for the user to fill in.
    // This makes splitting easy: edit previous tier's high, then Add New Tier.
    const suggestedLow = last ? (last.high ?? last.low) + 1 : 0;
    const suggestedHigh = suggestedLow + 100000; // default explicit high for new tier (full range, no special last-tier unlimited)

    const newTier: PricingTier = {
      id: createId(),
      low: suggestedLow,
      high: suggestedHigh,
      targetGpPercent: 20,           // neutral starting GP% — user will adjust
      label: formatTierRange(suggestedLow, suggestedHigh),
    };

    setFormData((prev) => ({
      ...prev,
      tiers: [...prev.tiers, newTier],
    }));

    // Open it directly in edit mode with the fields ready for input
    setEditingTierId(newTier.id);
  }

  function removeTierFromForm(tierId: string) {
    setFormData((prev) => ({
      ...prev,
      tiers: prev.tiers.filter((t) => t.id !== tierId),
    }));
    if (editingTierId === tierId) {
      setEditingTierId(null);
      setEditingTierSnapshot(null);
    }
  }

  function moveTier(tierId: string, direction: "up" | "down") {
    setFormData((prev) => {
      const idx = prev.tiers.findIndex((t) => t.id === tierId);
      if (idx === -1) return prev;

      const newTiers = [...prev.tiers];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;

      if (swapIdx < 0 || swapIdx >= newTiers.length) return prev;

      // Swap
      [newTiers[idx], newTiers[swapIdx]] = [newTiers[swapIdx], newTiers[idx]];
      return { ...prev, tiers: newTiers };
    });
  }

  function startEditTier(tierId: string) {
    const tier = formData.tiers.find((t) => t.id === tierId);
    if (tier) {
      setEditingTierSnapshot({ ...tier }); // deep enough for our purposes
    }
    setEditingTierId(tierId);
  }

  function saveEditTier() {
    setEditingTierId(null);
    setEditingTierSnapshot(null);
    // Auto-sort after the user confirms changes to a tier
    sortTiers();
  }

  function cancelEditTier(tierId: string) {
    if (editingTierSnapshot) {
      // Restore the tier to its state before editing started
      setFormData((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) =>
          t.id === tierId ? { ...editingTierSnapshot } : t
        ),
      }));
    }
    setEditingTierId(null);
    setEditingTierSnapshot(null);
  }

  /** Auto-sort tiers by Low value (ascending). Call after meaningful changes. */
  function sortTiers() {
    setFormData((prev) => {
      const sorted = [...prev.tiers].sort((a, b) => a.low - b.low);
      return { ...prev, tiers: sorted };
    });
  }

  function resetForm() {
    setFormData({ name: "", notes: "", tiers: [] });
    setEditingId(null);
    setEditingTierId(null);
    setEditingTierSnapshot(null);
  }

  function startNew() {
    // ONLY path for brand new work types. Clears editingId.
    const defaultTiers: PricingTier[] = [
      { id: createId(), low: 0, high: 5000, targetGpPercent: 28, label: formatTierRange(0, 5000) },
      { id: createId(), low: 5001, high: 15000, targetGpPercent: 26, label: formatTierRange(5001, 15000) },
      { id: createId(), low: 15001, high: 30000, targetGpPercent: 24, label: formatTierRange(15001, 30000) },
      { id: createId(), low: 30001, high: 75000, targetGpPercent: 22, label: formatTierRange(30001, 75000) },
      { id: createId(), low: 75001, high: 100000, targetGpPercent: 20, label: formatTierRange(75001, 100000) },
    ];
    setFormData({ name: "", notes: "", tiers: defaultTiers });
    setEditingId(null);
    setSelectedId(null);
    setEditingTierId(null);
    setEditingTierSnapshot(null);
    window.scrollTo({ top: 140, behavior: "smooth" });
  }

  function startEdit(wt: WorkType) {
    // Load from left list click for editing. Sets editingId so button shows "Save Changes".
    const tiersCopy = wt.tiers.map((t) => ({ ...t }));

    setFormData({
      name: wt.name,
      notes: wt.notes || "",
      tiers: tiersCopy,
    });
    setEditingId(wt.id);
    setSelectedId(wt.id);
    setEditingTierId(null);
    setEditingTierSnapshot(null);
    window.scrollTo({ top: 140, behavior: "smooth" });
  }

  function saveWorkType() {
    if (!formData.name.trim() || formData.tiers.length === 0) return;

    // Capture current editor state: name + ALL tiers.
    const updatedTiers = formData.tiers.map((t) => ({
      ...t,
      label: formatTierRange(t.low, t.high),
    }));

    const id = editingId || createId();

    const saved: WorkType = {
      id,
      name: formData.name.trim(),
      tiers: updatedTiers,
      notes: formData.notes.trim() || undefined,
    };

    // Update master state. This triggers:
    // - Left list refresh (tier count + avg GP% recomputed from new tiers)
    // - Overview tab to pick up new targets via getTargetGp
    if (editingId) {
      setWorkTypes((prev) => prev.map((w) => (w.id === editingId ? saved : w)));
    } else {
      setWorkTypes((prev) => [...prev, saved]);
    }

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2400);

    // Keep editor on the item (stays in "edit" mode)
    setFormData({
      name: saved.name,
      notes: saved.notes || "",
      tiers: updatedTiers.map((t) => ({ ...t })),
    });
    setEditingId(id);
    setSelectedId(id);
    setEditingTierId(null);
    setEditingTierSnapshot(null);
  }

  function deleteWorkType(id: string) {
    setWorkTypes((prev) => prev.filter((w) => w.id !== id));
    if (editingId === id) resetForm();
    if (selectedId === id) setSelectedId(null);
    setEditingTierSnapshot(null);
  }

  const isEditing = !!editingId;

  // ==================== OVERVIEW HELPERS ====================
  function toggleExpand(name: string) {
    setExpanded((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  // Compute overall numbers from the *live* overviewItems (derived from current workTypes).
  // This ensures totals and variance in the summary update when Builder changes.
  const overall = React.useMemo(() => {
    const ttlRevenue = overviewItems.reduce((s, p) => s + p.ttlRevenue, 0);
    const totalGp = overviewItems.reduce((s, p) => s + p.totalGp, 0);
    const targetRevenue = overviewItems.reduce((s, p) => s + p.targetRevenue, 0);
    const gpPercent = ttlRevenue > 0 ? (totalGp / ttlRevenue) * 100 : 0;
    return { ttlRevenue, totalGp, targetRevenue, gpPercent };
  }, [overviewItems]);

  const overallVariance = overall.ttlRevenue - overall.targetRevenue;

  // Bid acceptance totals — now derived from live overviewItems for full reactivity.
  const totalBids = overviewItems.reduce((s, p) => s + p.totalBids, 0);
  const totalAccepted = overviewItems.reduce((s, p) => s + p.bidsAccepted, 0);
  const acceptanceRate = totalBids > 0 ? (totalAccepted / totalBids) * 100 : 0;

  // For a given performance row, compute weighted target GP% from current builder targets (live link!)
  function getWeightedTargetGp(perf: WorkTypePerformance): number {
    let weighted = 0;
    let rev = 0;
    perf.tiers.forEach((t) => {
      const tgt = getTargetGp(perf.name, t.label);
      weighted += t.revenue * (tgt / 100);
      rev += t.revenue;
    });
    return rev > 0 ? (weighted / rev) * 100 : 22;
  }

  // ==================== RENDER ====================
  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <Tags className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Work Types</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">PILLAR 2</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Annual margin targets by work type and job size range. Pillar 2 of the PMZ system.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setWorkTypes(demoWorkTypes);
            setPerformance(demoPerformance);
            setEditingId(null);
            setSelectedId(null);
            setJustSaved(false);
            setExpanded(["Residential Paving"]);
          }}
          className="self-start sm:self-auto"
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Reset All Demo Data
        </Button>
      </div>

      {/* Clean Tabs (brand styled) */}
      <div className="flex items-center">
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-sm">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Work Type Overview — 2026
          </button>
          <button
            onClick={() => setActiveTab("builder")}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === "builder"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Work Type Builder
          </button>
        </div>
      </div>

      {/* ===================== TAB 1: WORK TYPE BUILDER ===================== */}
      <div className={activeTab === "builder" ? "" : "hidden"}>
        <Card className="card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Work Type Builder</CardTitle>
                <CardDescription>
                  Create work types and set Target GP% by job size range. These targets power the variance analysis in the Overview tab.
                </CardDescription>
              </div>
              <Button onClick={startNew} size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add New Work Type
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Saved list */}
              <div className="lg:col-span-5 xl:col-span-4">
                <div className="text-xs font-semibold tracking-[0.5px] text-muted-foreground mb-2 px-1 uppercase">Saved Work Types</div>
                {workTypes.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-surface-2 p-4 text-xs text-muted-foreground">
                    No work types yet. Click “Add New Work Type”.
                  </div>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
                    {workTypes.map((wt) => {
                      const isActive = selectedId === wt.id;
                      const avgTarget = wt.tiers.length
                        ? wt.tiers.reduce((s, t) => s + t.targetGpPercent, 0) / wt.tiers.length
                        : 0;
                      return (
                        <div
                          key={wt.id}
                          onClick={() => {
                            setSelectedId(wt.id);
                            startEdit(wt);
                          }}
                          className={cn(
                            "group flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm cursor-pointer border transition-all",
                            isActive
                              ? "border-primary/40 bg-primary/5 font-medium"
                              : "border-transparent hover:bg-muted hover:border-border"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{wt.name}</div>
                            <div className="text-[11px] text-muted-foreground">{wt.tiers.length} tiers • avg {avgTarget.toFixed(0)}% target</div>
                          </div>
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); startEdit(wt); }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); deleteWorkType(wt.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Editor */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-5">
                <div>
                  <Label className="text-sm font-medium">Work Type Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1.5 text-base font-semibold"
                    placeholder="Residential Paving"
                  />
                </div>

                {/* Pricing Tiers Editor — clean spreadsheet-style table (Pillar 3) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium">Pricing Tiers — Target GP% by Job Size</Label>
                    <Button onClick={addNewTier} size="sm" className="gap-2">
                      <Plus className="h-4 w-4" /> Add New Tier
                    </Button>
                  </div>

                  {formData.tiers.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Click “Add New Tier” above to start defining margin targets by job size range.
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[220px]">Range</TableHead>
                            <TableHead className="w-[110px]">Low</TableHead>
                            <TableHead className="w-[140px]">High</TableHead>
                            <TableHead className="w-[120px]">Target GP %</TableHead>
                            <TableHead className="text-right w-[220px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.tiers.map((tier, index) => {
                            const isEditingThis = editingTierId === tier.id;
                            const isFirst = index === 0;
                            const isLast = index === formData.tiers.length - 1;

                            // Always show full "$LOW – $HIGH" using the exact high value (HIGH is editable on every row, including last).
                            const displayHighForRange = tier.high;

                            return (
                              <TableRow key={tier.id}>
                                {/* Range column: always "$LOW – $HIGH" for every row (no "+" for last) */}
                                <TableCell className="font-medium tabular-nums">
                                  {formatTierRange(tier.low, displayHighForRange)}
                                </TableCell>

                                {isEditingThis ? (
                                  // EDITING ROW — inline inputs (HIGH always typeable for every row)
                                  <>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={tier.low.toString()}
                                        onChange={(e) => {
                                          // Sanitize: digits only, strip leading zeros, natural typing
                                          let cleaned = e.target.value.replace(/[^0-9]/g, '').replace(/^0+/, '');
                                          if (cleaned === '') cleaned = '0';
                                          updateTierInForm(tier.id, "low", Number(cleaned));
                                        }}
                                        className="h-8 font-medium tabular-nums"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={tier.high != null ? tier.high.toString() : ''}
                                        onChange={(e) => {
                                          // Sanitize for High: digits only, strip leading zeros
                                          let cleaned = e.target.value.replace(/[^0-9]/g, '').replace(/^0+/, '');
                                          const val = cleaned === '' ? null : Number(cleaned);
                                          updateTierInForm(tier.id, "high", val);
                                        }}
                                        className="h-8 font-medium tabular-nums"
                                        placeholder=""
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <PercentInput
                                        value={tier.targetGpPercent}
                                        onChange={(v) =>
                                          updateTierInForm(tier.id, "targetGpPercent", v)
                                        }
                                        wrapperClassName="h-8"
                                        className="font-semibold"
                                      />
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button size="sm" onClick={saveEditTier}>
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => cancelEditTier(tier.id)}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-destructive hover:text-destructive"
                                          onClick={() => removeTierFromForm(tier.id)}
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </>
                                ) : (
                                  // VIEW ROW
                                  <>
                                    <TableCell className="tabular-nums">{tier.low.toLocaleString()}</TableCell>
                                    <TableCell className="tabular-nums">
                                      {tier.high === null ? "—" : tier.high.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="font-semibold text-primary tabular-nums">
                                      {tier.targetGpPercent}%
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={isFirst}
                                          onClick={() => moveTier(tier.id, "up")}
                                          title="Move up"
                                        >
                                          <ChevronUp className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={isLast}
                                          onClick={() => moveTier(tier.id, "down")}
                                          title="Move down"
                                        >
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => startEditTier(tier.id)}
                                          title="Edit tier"
                                        >
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive hover:text-destructive"
                                          onClick={() => removeTierFromForm(tier.id)}
                                          title="Delete tier"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Edit any row, then click <strong>Save</strong>. Tiers auto-sort by Low value. Use “Add New Tier” then edit the new row to easily split ranges (e.g. change $75k+ high to $100k, add new tier for $100k+).
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Notes (optional)</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="mt-1.5"
                    placeholder="Driveways, patios, small residential lots — high repeat potential"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={saveWorkType} disabled={!formData.name.trim() || formData.tiers.length === 0} size="lg">
                    <Save className="mr-2 h-4 w-4" />
                    {isEditing ? "Save Changes" : "Save New Work Type"}
                  </Button>
                  {isEditing && (
                    <Button variant="outline" size="lg" onClick={resetForm}>
                      <X className="mr-2 h-4 w-4" /> Cancel Edit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Success message */}
        {justSaved && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-emerald-700 text-sm flex items-center gap-2 shadow-sm">
            ✓ Work type and all tier targets saved. Left list and Overview tab updated.
          </div>
        )}
      </div>

      {/* ===================== TAB 2: WORK TYPE OVERVIEW 2026 ===================== */}
      <div className={activeTab === "overview" ? "" : "hidden"}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Work Type Overview — {year}</h2>
            <p className="text-muted-foreground">Actual performance vs your current target GP% by job size range</p>
          </div>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-input rounded-md px-3 py-2 bg-background text-sm font-medium"
          >
            <option value={2026}>2026 (Current Year)</option>
            <option value={2025}>2025</option>
            <option value={2027}>2027 (Plan)</option>
          </select>
        </div>

        {/* Summary Table (matches requested columns + useful Variance) */}
        <Card className="card mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Annual Summary by Work Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Type</TableHead>
                    <TableHead className="text-right">Ttl Revenue</TableHead>
                    <TableHead className="text-right">GP %</TableHead>
                    <TableHead className="text-right">Total GP</TableHead>
                    <TableHead className="text-right">Target Revenue</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overviewItems.map((p, idx) => {
                    const variance = p.ttlRevenue - p.targetRevenue;
                    const vPct = p.targetRevenue > 0 ? ((p.ttlRevenue / p.targetRevenue) * 100 - 100) : 0;
                    const weightedTarget = getWeightedTargetGp(p);
                    const isOpen = expanded.includes(p.name);
                    return (
                      <TableRow
                        key={p.name}
                        className={cn("hover:bg-muted/30 cursor-pointer", isOpen && "bg-muted/30")}
                        onClick={() => toggleExpand(p.name)}
                        aria-expanded={isOpen}
                      >
                        <TableCell className="font-semibold">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p.ttlRevenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          <span className={p.gpPercent >= weightedTarget ? "text-[#16a34a]" : "text-[#dc2626]"}>
                            {p.gpPercent.toFixed(1)}%
                          </span>
                          <div className="text-[10px] text-muted-foreground font-normal">target {weightedTarget.toFixed(1)}%</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600 font-semibold">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p.totalGp)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p.targetRevenue)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold", variance >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {variance >= 0 ? "+" : ""}{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(variance)}
                          <span className="ml-1 text-xs font-normal">({vPct.toFixed(1)}%)</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Grand Total */}
                  <TableRow className="bg-muted/50 font-semibold border-t-2">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right tabular-nums">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(overall.ttlRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">
                      {(() => {
                        const tgt = overall.ttlRevenue > 0
                          ? overviewItems.reduce((s, p) => s + getWeightedTargetGp(p) * p.ttlRevenue, 0) / overall.ttlRevenue
                          : 0;
                        const isGood = overall.gpPercent >= tgt;
                        return <span className={isGood ? "text-[#16a34a]" : "text-[#dc2626]"}>{overall.gpPercent.toFixed(1)}%</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(overall.totalGp)}</TableCell>
                    <TableCell className="text-right tabular-nums">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(overall.targetRevenue)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-semibold", overallVariance >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {overallVariance >= 0 ? "+" : ""}{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(overallVariance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Expandable Detailed Tier Performance */}
        <div className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground px-1">DETAILED PERFORMANCE BY PRICING TIER</div>
        <div className="space-y-3">
          {overviewItems.map((p, idx) => {
            const isOpen = expanded.includes(p.name);
            const weightedTarget = getWeightedTargetGp(p);
            const wtVariance = p.gpPercent - weightedTarget;

            return (
              <Card key={p.name} className="card overflow-hidden">
                <div
                  className={cn(
                    "flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/40 transition-colors",
                    isOpen && "bg-muted/30"
                  )}
                  onClick={() => toggleExpand(p.name)}
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-lg">{p.name}</span>
                    <Badge className={cn("text-xs", p.gpPercent >= weightedTarget ? "bg-emerald-600 text-white" : "bg-amber-500 text-white")}>
                      {p.gpPercent.toFixed(1)}% actual
                    </Badge>
                    <span className={cn("text-xs font-medium", wtVariance >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {wtVariance >= 0 ? "+" : ""}{wtVariance.toFixed(1)} pts vs target
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="tabular-nums text-muted-foreground hidden sm:inline">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p.ttlRevenue)}
                    </span>
                    <span className={cn("font-semibold tabular-nums", p.totalGp >= (p.ttlRevenue * weightedTarget / 100) ? "text-emerald-600" : "text-red-600")}>
                      {p.gpPercent.toFixed(1)}% GP
                    </span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                <div
                  className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden min-h-0">
                    <CardContent className="pt-0 pb-5">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Range</TableHead>
                            <TableHead className="text-right"># Jobs</TableHead>
                            <TableHead className="text-right"># Accepted</TableHead>
                            <TableHead className="text-right">Avg Revenue</TableHead>
                            <TableHead className="text-right">Actual GP%</TableHead>
                            <TableHead className="text-right">Target GP%</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                            <TableHead className="text-right">Total GP$</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.tiers.map((t, tIdx) => {
                            const target = getTargetGp(p.name, t.label);
                            const variancePts = t.actualGpPercent - target;
                            const totalGpForTier = t.revenue * (t.actualGpPercent / 100);
                            const avgRev = t.accepted > 0 ? t.revenue / t.accepted : 0;
                            return (
                              <TableRow key={tIdx}>
                                <TableCell className="font-medium text-sm">{t.label}</TableCell>
                                <TableCell className="text-right tabular-nums">{t.jobs}</TableCell>
                                <TableCell className="text-right tabular-nums">{t.accepted}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(avgRev)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums font-semibold">{t.actualGpPercent.toFixed(1)}%</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{target.toFixed(1)}%</TableCell>
                                <TableCell className={cn("text-right tabular-nums font-semibold", variancePts >= 0 ? "text-emerald-600" : "text-red-600")}>
                                  {variancePts >= 0 ? "+" : ""}{variancePts.toFixed(1)} pts
                                </TableCell>
                                <TableCell className="text-right tabular-nums font-semibold text-emerald-600">
                                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalGpForTier)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground pl-1">
                      Acceptance rate in this work type: <span className="font-medium text-foreground">{((p.bidsAccepted / p.totalBids) * 100).toFixed(0)}%</span> ({p.bidsAccepted} of {p.totalBids} bids)
                    </div>
                  </CardContent>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

        {/* Bid Acceptance Rates Summary */}
        <Card className="card mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bid Acceptance Rates — {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border bg-surface-2 p-5 text-center">
                <div className="text-4xl font-semibold tabular-nums tracking-tighter">{totalBids}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Bids Submitted</div>
              </div>
              <div className="rounded-xl border bg-surface-2 p-5 text-center">
                <div className="text-4xl font-semibold tabular-nums tracking-tighter text-emerald-600">{totalAccepted}</div>
                <div className="text-sm text-muted-foreground mt-1">Bids Accepted</div>
              </div>
              <div className="rounded-xl border bg-surface-2 p-5 text-center">
                <div className="text-4xl font-semibold tabular-nums tracking-tighter text-primary">{acceptanceRate.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground mt-1">Overall Acceptance Rate</div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4">
              Strong acceptance on smaller residential and maintenance work. Large commercial jobs require more aggressive pricing or relationship selling.
            </p>
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-2">
          <Button size="sm" onClick={() => { setActiveTab("builder"); startNew(); }}>
            <Plus className="mr-2 h-4 w-4" /> New Work Type
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActiveTab("builder")}>
            <Edit2 className="mr-2 h-4 w-4" /> Edit Targets in Builder
          </Button>
        </div>

        <p className="pt-3 text-xs text-muted-foreground">
          This page will later pull real data from your estimates and completed jobs in the Project Pricer to show actual performance vs targets (including job status, pre-invoice, and invoiced work).
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto pt-4">
        All targets and 2026 performance data live in your browser (localStorage). Edit targets in the Builder tab — variance analysis updates instantly.
      </p>
    </div>
  );
}
