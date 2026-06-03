"use client";

import * as React from "react";
import Link from "next/link";
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
  TrendingUp,
  Plus,
  Trash2,
  RotateCcw,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calculateLaborRate,
  type LaborRateInputs,
} from "@/lib/calculations";

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
  unitPrice: number; // selling price to customer
}

interface CurrentEstimate {
  jobName: string;
  workTypeName: string;
  salesperson: string;
  estimatedRevenue: number; // the total they are bidding (used for tier + target comparison)
  bidItems: BidItem[];
}

const ESTIMATE_STORAGE = "pmz_current_estimate_v1";

const COMMON_UNITS = [
  "EA", "SF", "SY", "LF", "TON", "CY", "GAL", "BAG", "LS", "HR",
  "DAY", "WEEK", "MO", "SQ", "CF", "LB", "PC", "RL", "SH", "PL", "YD"
];

const SALESPERSON_OPTIONS = ["Owner", "Scott Sinnott", "Mike Johnson", "Alex Rivera"];

export default function ProjectPricerPage() {
  // Loaded from other pillars
  const [workTypes, setWorkTypes] = React.useState<WorkType[]>([]);
  const [laborProfiles, setLaborProfiles] = React.useState<any[]>([]);
  const [equipmentProfiles, setEquipmentProfiles] = React.useState<any[]>([]);
  const [materialProfiles, setMaterialProfiles] = React.useState<any[]>([]);

  // Current estimate (only revenue side in Level 1)
  const [estimate, setEstimate] = React.useState<CurrentEstimate>({
    jobName: "Downtown Plaza Paving - Phase 1",
    workTypeName: "",
    salesperson: "",
    estimatedRevenue: 24500,
    bidItems: [],
  });

  // For the educational "See True Job Costs" dialog (kept for links)
  const [showCostDialog, setShowCostDialog] = React.useState(false);

  // Toggle for the new LEM breakdown (the activated feature)
  const [showLEM, setShowLEM] = React.useState(false);

  // Toggle for the second "full real" LEM breakdown using actual saved profiles
  const [showRealLEM, setShowRealLEM] = React.useState(false);

  // Interactive real LEM lines for the Pro green section (pulls from actual saved profiles)
  interface RealLEMItem {
    id: string;
    type: 'labor' | 'equipment' | 'material';
    profileId: string;
    description: string;
    quantity: number;
    unitCost: number;
  }
  const [realLEMItems, setRealLEMItems] = React.useState<RealLEMItem[]>([]);

  // Transient state for the three adder controls in the green Pro section
  const [pendingLaborId, setPendingLaborId] = React.useState("");
  const [pendingLaborQty, setPendingLaborQty] = React.useState(0);
  const [pendingEquipId, setPendingEquipId] = React.useState("");
  const [pendingEquipQty, setPendingEquipQty] = React.useState(0);
  const [pendingMatId, setPendingMatId] = React.useState("");
  const [pendingMatQty, setPendingMatQty] = React.useState(0);

  // Per-row editing strings for the Qty/Hrs inputs in Added Items (enables full text editing + clearing while keeping live numbers)
  const [qtyEdits, setQtyEdits] = React.useState<Record<string, string>>({});

  // Edit strings for adder qty fields to support full decimal typing without snap
  const [pendingLaborQtyEdit, setPendingLaborQtyEdit] = React.useState<string>("");
  const [pendingEquipQtyEdit, setPendingEquipQtyEdit] = React.useState<string>("");
  const [pendingMatQtyEdit, setPendingMatQtyEdit] = React.useState<string>("");

  // Editable Gross Profit % for the Grand Total section (user enters %, GP$ and Grand Total computed)
  const [editableGrossProfitPercent, setEditableGrossProfitPercent] = React.useState(0);
  const [gpPercentEdit, setGpPercentEdit] = React.useState<string>("");

  // Salesperson required validation
  const [salespersonError, setSalespersonError] = React.useState(false);

  // Load work types, saved estimate, and rate profiles from other pillars
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("pmz_work_types_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.workTypes)) setWorkTypes(parsed.workTypes);
      }
    } catch {}

    try {
      const raw = localStorage.getItem("pmz_labor_rates");
      if (raw) {
        const parsed = JSON.parse(raw);
        setLaborProfiles(Array.isArray(parsed) ? parsed : []);
      }
    } catch {}

    try {
      const raw = localStorage.getItem("pmz_equipment_rates_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        setEquipmentProfiles(Array.isArray(parsed) ? parsed : []);
      }
    } catch {}

    try {
      const raw = localStorage.getItem("pmz_material_rates");
      if (raw) {
        const parsed = JSON.parse(raw);
        setMaterialProfiles(Array.isArray(parsed) ? parsed : []);
      }
    } catch {}

    try {
      const raw = localStorage.getItem(ESTIMATE_STORAGE);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.bidItems) {
          setEstimate({
            jobName: saved.jobName || "New Project",
            workTypeName: saved.workTypeName || "",
            salesperson: saved.salesperson || "",
            estimatedRevenue: saved.estimatedRevenue || 20000,
            bidItems: saved.bidItems || [],
          });
          setSalespersonError(false);
        }
      }
    } catch {}
  }, []);

  // Persist
  React.useEffect(() => {
    try {
      localStorage.setItem(ESTIMATE_STORAGE, JSON.stringify(estimate));
    } catch {}
  }, [estimate]);

  // Running Total Revenue (the detailed bid the user is building)
  const totalRevenue = React.useMemo(() => {
    return estimate.bidItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [estimate.bidItems]);

  // Target Margin % — pulled from selected Work Type + the Estimated Job Size in the top section
  // Only returns a real value AFTER a work type is selected (no default 20 until chosen)
  const targetMargin = React.useMemo(() => {
    if (!estimate.workTypeName || workTypes.length === 0) return 0;
    const wt = workTypes.find((w) => w.name === estimate.workTypeName);
    if (!wt || !wt.tiers || wt.tiers.length === 0) return 0;
    const size = estimate.estimatedRevenue || 0;
    for (let i = 0; i < wt.tiers.length; i++) {
      const t = wt.tiers[i];
      const low = t.low ?? 0;
      const high = t.high ?? Infinity;
      if (size >= low && size <= high) return t.targetGpPercent;
    }
    return wt.tiers[wt.tiers.length - 1].targetGpPercent;
  }, [estimate.workTypeName, estimate.estimatedRevenue, workTypes]);

  // Target Bid Price = the value the user put in "Estimated Job Size / Revenue" (the total they are bidding)
  const targetBidPrice = estimate.estimatedRevenue;

  // Simple "On Target / Below Target" logic for Level 1 educational feel
  // Compares the detailed table total to the top-level bid target
  const isOnTarget = React.useMemo(() => {
    if (targetBidPrice <= 0) return true;
    const diff = Math.abs(totalRevenue - targetBidPrice);
    const pctDiff = targetBidPrice > 0 ? (diff / targetBidPrice) * 100 : 0;
    return pctDiff <= 5; // within 5% is "on target"
  }, [totalRevenue, targetBidPrice]);

  const belowTargetBy = targetBidPrice > 0 ? Math.max(0, targetBidPrice - totalRevenue) : 0;

  const workTypeOptions = workTypes.map((wt) => wt.name);

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
      id: Math.random().toString(36).slice(2, 11),
      description: "",
      quantity: 1,
      unit: "EA",
      unitPrice: 0,
    };
    setEstimate((prev) => ({ ...prev, bidItems: [...prev.bidItems, newItem] }));
  }

  function updateBidItem(id: string, field: keyof BidItem, value: string | number) {
    setEstimate((prev) => ({
      ...prev,
      bidItems: prev.bidItems.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "description" || field === "unit" ? value : Math.max(0, Number(value)),
            }
          : item
      ),
    }));
  }

  function removeBidItem(id: string) {
    setEstimate((prev) => ({
      ...prev,
      bidItems: prev.bidItems.filter((i) => i.id !== id),
    }));
  }

  function clearAll() {
    setEstimate({
      jobName: "New Project",
      workTypeName: estimate.workTypeName,
      salesperson: estimate.salesperson,
      estimatedRevenue: 20000,
      bidItems: [],
    });
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
    });
  }

  // Helper: sync the top "Estimated Job Size" to the current table total (makes tier lookup accurate)
  function syncEstimatedToTable() {
    updateEstimate({ estimatedRevenue: Math.round(totalRevenue) });
  }

  // Validate required fields (esp. salesperson) before calculate/save actions
  function validateForAction(): boolean {
    const sp = (estimate.salesperson || "").trim();
    if (!sp) {
      setSalespersonError(true);
      return false;
    }
    setSalespersonError(false);
    return true;
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

  // Computed for Grand Total using editable % as true margin
  const p = editableGrossProfitPercent;
  const computedGrossProfit = (p > 0 && p < 100) ? realTotalLEM * (p / (100 - p)) : 0;
  const computedGrandTotal = realTotalLEM + computedGrossProfit;

  // Educational dialog content (the hook that makes them curious about real LEM)
  const MaxDirectCost = targetBidPrice > 0 && targetMargin > 0
    ? Math.round(targetBidPrice * (1 - targetMargin / 100))
    : 0;

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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetToDemo}>
            <RotateCcw className="mr-2 h-4 w-4" /> Load Demo
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear
          </Button>
        </div>
      </div>

      {/* 1. Top section — Job Name, Work Type, Salesperson, Estimated Job Size / Revenue */}
      <Card className="card">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground">JOB NAME</Label>
              <Input
                value={estimate.jobName}
                onChange={(e) => updateEstimate({ jobName: e.target.value })}
                className="mt-1.5 text-lg font-medium"
                placeholder="Project name or number"
              />
            </div>

            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground">WORK TYPE</Label>
              <Select
                value={estimate.workTypeName}
                onValueChange={(val) => updateEstimate({ workTypeName: val })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select work type..." />
                </SelectTrigger>
                <SelectContent>
                  {workTypeOptions.length > 0 ? (
                    workTypeOptions.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No work types saved yet. <Link href="/work-types" className="underline">Create in Work Types</Link>.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium tracking-wider text-muted-foreground">SALESPERSON</Label>
              <Input
                list="salesperson-options"
                value={estimate.salesperson}
                onChange={(e) => {
                  updateEstimate({ salesperson: e.target.value });
                  if (salespersonError) setSalespersonError(false);
                }}
                className={cn("mt-1.5 text-lg font-medium", salespersonError && "border-red-500 focus-visible:border-red-500")}
                placeholder="Select or type name"
              />
              <datalist id="salesperson-options">
                {SALESPERSON_OPTIONS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {salespersonError && (
                <p className="mt-1 text-[10px] text-red-600">Salesperson is required</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium tracking-wider text-muted-foreground">
                  ESTIMATED JOB SIZE / REVENUE
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[10px] text-primary"
                  onClick={syncEstimatedToTable}
                  disabled={Math.abs(totalRevenue - estimate.estimatedRevenue) < 1}
                >
                  Use table total
                </Button>
              </div>
              <div className="relative mt-1.5">
                <Input
                  type="number"
                  value={estimate.estimatedRevenue}
                  onChange={(e) => updateEstimate({ estimatedRevenue: Math.max(0, Number(e.target.value)) })}
                  className="pl-7 text-lg font-medium tabular-nums"
                  placeholder="24500"
                />
                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                This is the total you are bidding. Used to pick your target margin tier.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Main estimating area — "Bid Items" (feels like classic estimating paper) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="text-sm font-semibold tracking-[0.5px] text-muted-foreground">BID ITEMS</div>
          <Button size="sm" onClick={addBidItem}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Line
          </Button>
        </div>

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
                  <TableHead className="w-10"></TableHead>
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
                  estimate.bidItems.map((item) => {
                    const lineTotal = item.quantity * item.unitPrice;
                    return (
                      <TableRow key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                        <TableCell>
                          <Input
                            value={item.description}
                            onChange={(e) => updateBidItem(item.id, "description", e.target.value)}
                            className="h-9 border-0 bg-transparent px-1 font-medium focus-visible:bg-white focus-visible:border focus-visible:border-border"
                            placeholder="Driveway Paving, Site Grading, etc."
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateBidItem(item.id, "quantity", e.target.value)}
                            className="h-11 w-28 text-right text-base tabular-nums font-mono border-0 bg-transparent focus-visible:bg-white focus-visible:border focus-visible:border-border px-2"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={item.unit} onValueChange={(val) => updateBidItem(item.id, "unit", val)}>
                            <SelectTrigger className="h-9 border-0 bg-transparent px-2 text-sm focus-visible:bg-white focus-visible:border focus-visible:border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMON_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <CurrencyInput
                            value={item.unitPrice}
                            onChange={(v) => updateBidItem(item.id, "unitPrice", v)}
                            wrapperClassName="h-11 w-28"
                            className="text-base font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/70 hover:text-destructive"
                            onClick={() => removeBidItem(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Running Total Revenue at the bottom of the table — classic paper feel */}
          <div className="border-t bg-muted/40 px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-medium tracking-wide text-muted-foreground">TOTAL REVENUE (YOUR BID)</div>
            <div className="text-3xl font-semibold tabular-nums tracking-tighter">
              ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Compact Target Banner — sits directly under Total Revenue (small, low vertical footprint) */}
          {estimate.workTypeName && targetMargin > 0 && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-5 text-amber-900">
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-amber-700/70">Target Margin</span>
                  <span className="font-semibold tabular-nums text-sm">{targetMargin.toFixed(1)}%</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-amber-700/70">Target Bid</span>
                  <span className="font-semibold tabular-nums text-sm">${targetBidPrice.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                </div>
                {realLEMItems.length > 0 && (
                  <div className="pl-3 border-l border-amber-200 text-[10px] text-amber-800/90 whitespace-nowrap">
                    Your profit <span className="font-semibold tabular-nums">{realGPPercent.toFixed(1)}%</span> vs target <span className="font-semibold tabular-nums">{targetMargin.toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "px-2 py-0.5 rounded font-medium text-[10px]",
                  isOnTarget ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                )}
              >
                {isOnTarget
                  ? "On Target (within 5%)"
                  : totalRevenue < targetBidPrice
                    ? `Below Target — $${belowTargetBy.toLocaleString()} short`
                    : "Above Target"}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* LEM action buttons — placed directly after bid table + compact target banner */}
      {estimate.workTypeName && (
        <div className="space-y-3">
          {/* The prominent educational button — now fully activated */}
          <Button
            className="w-full h-12 text-base font-semibold bg-orange-600 hover:bg-orange-700 text-white"
            onClick={() => {
              const next = !showLEM;
              if (next && !validateForAction()) return;
              setShowLEM(next);
            }}
          >
            {showLEM ? "Hide Real LEM Breakdown" : "Calculate Real LEM Costs →"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            See what your actual labor, equipment &amp; material costs would be
          </p>

          {/* SECOND more prominent button for full real LEM using actual saved profiles */}
          <Button
            className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-700"
            onClick={() => {
              const next = !showRealLEM;
              if (next && !validateForAction()) return;
              setShowRealLEM(next);
            }}
          >
            {showRealLEM ? "Hide My Real LEM Breakdown" : "Use My Actual Saved Rates"}
          </Button>
          <p className="text-center text-[11px] text-emerald-700/80 -mt-1">
            Pulls directly from your saved Labor, Equipment &amp; Material profiles for accurate costing
          </p>
        </div>
      )}

      {/* LEM Breakdown - clean, educational, toggleable (full-width for spaciousness) */}
      {showLEM && (
        <div className="mt-4 rounded-lg border bg-orange-50/50 p-4 text-sm space-y-2">
          <div className="font-semibold text-orange-900 flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Real LEM Cost Estimate (Level 1 default allocation)
          </div>
          <div className="text-xs text-orange-800/80">
            Based on your saved rates and a typical cost mix for “{estimate.workTypeName || "this work type"}” at the target margin.
          </div>

          <div className="pt-2 space-y-1 font-medium">
            <div className="flex justify-between">
              <span>Estimated Labor Cost</span>
              <span className="tabular-nums">${lemAllocation.labor.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Estimated Equipment Cost</span>
              <span className="tabular-nums">${lemAllocation.equipment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Estimated Material Cost</span>
              <span className="tabular-nums">${lemAllocation.material.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Total Real LEM Cost</span>
              <span className="tabular-nums">${lemAllocation.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="pt-2 border-t space-y-1">
            <div className="flex justify-between font-semibold text-lg">
              <span>True Gross Profit $</span>
              <span className={cn("tabular-nums", trueGrossProfit >= 0 ? "text-emerald-700" : "text-red-700")}>
                ${trueGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>True Gross Profit %</span>
              <span className={cn("font-semibold tabular-nums", grossProfitPercent >= targetMargin ? "text-emerald-700" : "text-red-700")}>
                {grossProfitPercent.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="text-[10px] text-orange-900/70 pt-1">
            Your saved rates avg: Labor ${avgLaborRate.toFixed(2)}/hr • Materials ${avgMaterialRate.toFixed(2)} • {equipmentCount} equipment profiles loaded.
            This is an estimate — real numbers will come from linking your exact LEM quantities in future levels.
          </div>
        </div>
      )}

      {/* Full Real LEM Breakdown (green pro section) — spacious layout, horizontal summaries, breathing room on Added Items table */}
      {showRealLEM && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50/60 p-5 text-sm space-y-3">
          <style>{`
input[type="text"][inputmode="numeric"] {
  -webkit-appearance: none;
  -moz-appearance: textfield;
  appearance: textfield;
}
`}</style>
          <div className="font-semibold text-emerald-900 flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Full Real LEM Breakdown — Powered by Your Saved Profiles
          </div>
          <div className="text-xs text-emerald-800/80">
            Select profiles from your builders and adjust quantities/hours. Costs update live using the actual saved rates (true burdened costs).
          </div>

          {/* Interactive adders - three clean columns with est totals directly under each */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            {/* Labor column */}
            <div className="border rounded p-2.5 bg-white/70">
              {pendingLaborId && laborProfiles.find((p: any) => p.id === pendingLaborId) && (
                <div className="text-[9px] text-emerald-800/90 truncate mb-1">
                  {laborProfiles.find((p: any) => p.id === pendingLaborId).role}
                </div>
              )}
              <div className="flex gap-1 items-end">
                <Select value={pendingLaborId} onValueChange={setPendingLaborId}>
                  <SelectTrigger className="h-8 text-xs flex-1 max-w-[110px] truncate"><SelectValue placeholder="Select role..." /></SelectTrigger>
                  <SelectContent>
                    {laborProfiles.length > 0 ? laborProfiles.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.role}</SelectItem>
                    )) : <div className="p-2 text-xs text-muted-foreground">No labor profiles saved. <Link href="/labor-rates" className="underline">Go add your rates in the Labor Builder</Link></div>}
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
                  if (pendingLaborId) {
                    addRealLEMItem('labor', pendingLaborId, pendingLaborQty);
                    setPendingLaborId('');
                    setPendingLaborQty(0);
                    setPendingLaborQtyEdit("");
                  }
                }}>Add Labor</Button>
              </div>
              <div className="mt-2 pt-1 border-t text-[10px]">
                <div className="flex justify-between">
                  <span>Est. Labor</span>
                  <span className="font-medium tabular-nums">${realLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Equipment column */}
            <div className="border rounded p-2.5 bg-white/70">
              {pendingEquipId && equipmentProfiles.find((p: any) => p.id === pendingEquipId) && (
                <div className="text-[9px] text-emerald-800/90 truncate mb-1">
                  {equipmentProfiles.find((p: any) => p.id === pendingEquipId).description}
                </div>
              )}
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
                    addRealLEMItem('equipment', pendingEquipId, pendingEquipQty);
                    setPendingEquipId('');
                    setPendingEquipQty(0);
                    setPendingEquipQtyEdit("");
                  }
                }}>Add Equip</Button>
              </div>
              <div className="mt-2 pt-1 border-t text-[10px]">
                <div className="flex justify-between">
                  <span>Est. Equipment</span>
                  <span className="font-medium tabular-nums">${realEquipCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Material column */}
            <div className="border rounded p-2.5 bg-white/70">
              {pendingMatId && materialProfiles.find((p: any) => p.id === pendingMatId) && (
                <div className="text-[9px] text-emerald-800/90 truncate mb-1">
                  {materialProfiles.find((p: any) => p.id === pendingMatId).description}
                </div>
              )}
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
                    addRealLEMItem('material', pendingMatId, pendingMatQty);
                    setPendingMatId('');
                    setPendingMatQty(0);
                    setPendingMatQtyEdit("");
                  }
                }}>Add Mat</Button>
              </div>
              <div className="mt-2 pt-1 border-t text-[10px]">
                <div className="flex justify-between">
                  <span>Est. Material</span>
                  <span className="font-medium tabular-nums">${realMatCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Added Items table — more breathing room (taller rows, wider columns, extra padding) */}
          <div className="border-t pt-3">
            {realLEMItems.length > 0 ? (
              <div className="bg-white border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Description</TableHead>
                      <TableHead className="w-28 text-right">Unit Rate</TableHead>
                      <TableHead className="w-28 text-right">Qty/Hrs</TableHead>
                      <TableHead className="w-32 text-right">Line Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {realLEMItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium py-1">{item.description}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs py-1">${item.unitCost.toFixed(2)}</TableCell>
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
                            className="h-8 w-20 text-sm text-right tabular-nums border border-input px-2"
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium py-1">${(item.quantity * item.unitCost).toFixed(2)}</TableCell>
                        <TableCell className="py-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:text-red-800" onClick={() => removeRealLEMItem(item.id)}>
                            ×
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>

          {/* Profit Summary */}
          <div className="pt-3 border-t">
            <div className="border rounded p-2.5 bg-white/70">
              <div className="text-[10px] font-medium text-emerald-900 mb-1">Profit Summary</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span>Gross Profit %</span>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={gpPercentEdit !== "" ? gpPercentEdit : (editableGrossProfitPercent === 0 ? '' : editableGrossProfitPercent.toString())}
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
                    />
                    <span>%</span>
                  </div>
                  <div className="text-[10px] text-emerald-700/70 mt-1 leading-snug">This is true gross profit margin (not markup). Margin is what you actually keep out of the selling price.</div>
                </div>
                <div>
                  <span>Gross Profit $</span>
                  <span className="font-semibold tabular-nums">${computedGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grand Total */}
          <div className="pt-4 border-t-2 border-emerald-400">
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-4">
              <div className="font-bold text-emerald-900 mb-2">Grand Total</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total Real LEM Cost</span>
                  <span className="font-semibold tabular-nums">${realTotalLEM.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gross Profit %</span>
                  <span className="font-semibold tabular-nums">{editableGrossProfitPercent.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Gross Profit $</span>
                  <span className="font-semibold tabular-nums">${computedGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-bold">
                  <span>Grand Total</span>
                  <span className="tabular-nums text-3xl text-emerald-900">
                    ${computedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-emerald-900/80 pt-1 border-t border-emerald-200">
            Live from your saved profiles. Adjust quantities above to see how different crew/equipment/material choices affect your true profit on this bid.
            <br />This is the Pro view — experiment freely. (Future: auto-suggest quantities from bid items.)
          </div>
        </div>
      )}

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
              your total direct costs (L+E+M) need to stay at or below <strong>${MaxDirectCost.toLocaleString()}</strong> 
              to hit your goal on a ${targetBidPrice.toLocaleString()} bid.
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
