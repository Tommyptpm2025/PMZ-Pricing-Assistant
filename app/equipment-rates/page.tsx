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
import { Wrench, Plus, RotateCcw, Edit2, Copy, Trash2, Calendar, Save } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import {
  calculateEquipmentRate,
  formatCurrency,
  DEFAULT_EQUIPMENT_INPUTS,
  type EquipmentRateInputs,
  type EquipmentRateResult,
} from "@/lib/calculations";
import { useRateStore } from "@/lib/rate-store";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

// Detailed line item for the tables
interface CostLine {
  id: string;
  name: string;
  cost: number; // annual or period cost input
}

// Main inputs for the rich Equipment Rate Builder
interface EquipmentBuilderInputs {
  description: string;
  // Identity / asset (manual entry; meterReading is the future telematics/depreciation hook — no automation yet)
  serialNumber: string;
  unitNumber: string;
  meterReading: number;                 // accumulated reading (hours for machines, miles/km for trucks)
  meterUnit: 'hours' | 'miles' | 'km';
  // Depreciation section
  startDate: string;
  endDate: string;
  startingValue: number;
  endingValue: number;
  // Ownership cost lines (annual)
  ownership: CostLine[];
  // Operating cost lines (annual)
  operating: CostLine[];
  // Usage for the estimate year
  estimatedHours: number;
  actualHours: number;
  // Pricing goal
  targetMargin: number;
}

interface SavedEquipmentProfile extends EquipmentBuilderInputs {
  id: string;
}

// Default detailed profile (realistic for a service truck / heavy equipment)
const DEFAULT_BUILDER_INPUTS: EquipmentBuilderInputs = {
  description: "Cat 320 Excavator - 2024",
  serialNumber: "1FT7W2BT5NEF12345",
  unitNumber: "Unit 12",
  meterReading: 4820,
  meterUnit: 'hours',
  startDate: "2022-03-15",
  endDate: "2030-03-15",
  startingValue: 52000,
  endingValue: 12000,
  ownership: [
    { id: "ins", name: "Insurance", cost: 1850 },
    { id: "tax", name: "Tax / License", cost: 420 },
    { id: "int", name: "Interest (Financing)", cost: 2450 },
    { id: "misc", name: "Misc (Storage, Transport)", cost: 650 },
    { id: "oth", name: "Other Ownership", cost: 300 },
  ],
  operating: [
    { id: "maint", name: "Maintenance & Repairs", cost: 4980 },
    { id: "fuel", name: "Fuel / Energy", cost: 5100 },
    { id: "wear", name: "Wear Items", cost: 3500 },
  ],
  estimatedHours: 1200,
  actualHours: 980,
  targetMargin: 15,
};

// Blank template — a NEW equipment entry starts empty. Ownership/operating rows are FIXED
// categories (no add/remove UI), so they're kept as labeled rows with zero cost — the cost
// inputs render a faded "0.00" placeholder. DEFAULT_BUILDER_INPUTS above stays available but
// is no longer used to seed a new entry.
const BLANK_BUILDER_INPUTS: EquipmentBuilderInputs = {
  description: "",
  serialNumber: "",
  unitNumber: "",
  meterReading: 0,
  meterUnit: 'hours',
  startDate: "",
  endDate: "",
  startingValue: 0,
  endingValue: 0,
  ownership: [
    { id: "ins", name: "Insurance", cost: 0 },
    { id: "tax", name: "Tax / License", cost: 0 },
    { id: "int", name: "Interest (Financing)", cost: 0 },
    { id: "misc", name: "Misc (Storage, Transport)", cost: 0 },
    { id: "oth", name: "Other Ownership", cost: 0 },
  ],
  operating: [
    { id: "maint", name: "Maintenance & Repairs", cost: 0 },
    { id: "fuel", name: "Fuel / Energy", cost: 0 },
    { id: "wear", name: "Wear Items", cost: 0 },
  ],
  estimatedHours: 0,
  actualHours: 0,
  targetMargin: 0,
};

// Helper to create a cost line
function createCostLine(name: string, cost: number): CostLine {
  return { id: createId(), name, cost };
}

/**
 * Normalizes operating cost lines to the new simplified structure:
 * - Maintenance & Repairs (includes former Shop Supplies / Tools)
 * - Fuel / Energy
 * - Wear Items (includes former Tires) + description is rendered in the table
 * This provides backward compatibility for old saved profiles.
 */
function normalizeOperatingLines(operating: CostLine[]): CostLine[] {
  let lines = [...operating];

  // Find items by flexible name matching (handles old saved data)
  const findByName = (search: string) =>
    lines.find((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  const maint = findByName("maintenance");
  const shop = findByName("shop");
  const fuel = findByName("fuel");
  const wear = findByName("wear");
  const tires = findByName("tire");

  // Merge costs
  if (maint && shop) {
    maint.cost = (maint.cost || 0) + (shop.cost || 0);
  }
  if (wear && tires) {
    wear.cost = (wear.cost || 0) + (tires.cost || 0);
  }

  // Keep only the three desired rows (in a stable order)
  const desiredOrder = ["Maintenance & Repairs", "Fuel / Energy", "Wear Items"];
  lines = desiredOrder
    .map((desiredName) => {
      const existing = lines.find((l) =>
        l.name === desiredName ||
        (desiredName === "Maintenance & Repairs" && l.name.toLowerCase().includes("maintenance")) ||
        (desiredName === "Fuel / Energy" && l.name.toLowerCase().includes("fuel")) ||
        (desiredName === "Wear Items" && l.name.toLowerCase().includes("wear"))
      );
      if (existing) return { ...existing, name: desiredName }; // normalize the name
      return null;
    })
    .filter((l): l is CostLine => l !== null);

  // Fallback: ensure we always have exactly the three rows (for very old data)
  if (lines.length === 0) {
    lines = [
      { id: "maint", name: "Maintenance & Repairs", cost: (shop?.cost || 0) + (maint?.cost || 0) },
      { id: "fuel", name: "Fuel / Energy", cost: fuel?.cost || 0 },
      { id: "wear", name: "Wear Items", cost: (wear?.cost || 0) + (tires?.cost || 0) },
    ];
  }

  return lines;
}

export default function EquipmentRateBuilder() {
  // Current working inputs (rich live calculator)
  const [inputs, setInputs] = React.useState<EquipmentBuilderInputs>(BLANK_BUILDER_INPUTS);

  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Track the currently selected saved profile (persists after save for list/table highlight)
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Brief success message after saving changes
  const [justSaved, setJustSaved] = React.useState(false);
  const [reloadMsg, setReloadMsg] = React.useState('');

  // Tab state for the new clean tabbed interface
  const [activeTab, setActiveTab] = React.useState<'builder' | 'saved'>('builder');

  // Centralized rate store (single source for labor/equip/material; survives tab switches, Fast Refresh, reloads)
  const {
    equipmentRates: savedProfiles,
    saveEquipmentRate,
    updateEquipmentRate,
    deleteEquipmentRate,
    getEquipmentRates,
    reloadFromStorage,
  } = useRateStore();

  // Manual reload from central store (forces fresh read from localStorage for recovery)
  function reloadSavedRates() {
    reloadFromStorage();
    console.log('[Equipment Rates] reloadSavedRates -> delegated to rate-store reloadFromStorage');
    setReloadMsg("Rates reloaded from storage");
    setTimeout(() => setReloadMsg(''), 2000);
  }

  // ==================== LIVE CALCULATIONS ====================
  // Single shared source of equipment-rate math (same fn the rate store uses) — no re-implementation.
  const calculations = React.useMemo(() => calculateEquipmentRate(inputs), [inputs]);

  // ==================== UPDATE HELPERS ====================
  function updateField<K extends keyof EquipmentBuilderInputs>(field: K, value: EquipmentBuilderInputs[K]) {
    setInputs((prev) => ({ ...prev, [field]: value }));
    if (editingId) {
      // user is editing a saved profile
    }
  }

  function updateCostLine(category: "ownership" | "operating", id: string, newCost: number) {
    setInputs((prev) => ({
      ...prev,
      [category]: prev[category].map((line) =>
        line.id === id ? { ...line, cost: Math.max(0, newCost) } : line
      ),
    }));
  }

  function resetToDefaults() {
    setInputs(BLANK_BUILDER_INPUTS);
    setEditingId(null);
    setSelectedId(null);
    setJustSaved(false);
  }

  // ==================== SAVED PROFILES (delegates persistence to centralized store) ====================
  function addCurrentProfile() {
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Current form data:", inputs);
    const newId = saveEquipmentRate({ ...inputs });
    console.log('[Equipment Rates] saveEquipmentRate delegated to store, new id:', newId);
    setEditingId(null);
    setSelectedId(newId);
    setJustSaved(false);
  }

  function updateSavedProfile() {
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Current form data:", inputs);
    if (!editingId) {
      console.warn('[Equipment Rates] SAVE CHANGES but no editingId, aborting');
      return;
    }
    const currentId = editingId;
    updateEquipmentRate(currentId, { ...inputs });
    console.log('[Equipment Rates] updateEquipmentRate delegated to store for id:', currentId);
    // Clear editing state (hides banner and "EDITING" badges in form area)
    // but keep selectedId so the list and table rows stay highlighted as the active profile
    setEditingId(null);
    setJustSaved(true);
    // Auto-hide success message after 2.5 seconds
    setTimeout(() => setJustSaved(false), 2500);
  }

  function loadProfile(profile: SavedEquipmentProfile) {
    const normalizedOperating = normalizeOperatingLines(profile.operating || []);
    const normalized = {
      ...profile,
      operating: normalizedOperating,
    };
    setInputs(normalized);
    setEditingId(profile.id);
    setSelectedId(profile.id);
    setJustSaved(false);
    window.scrollTo({ top: 120, behavior: "smooth" });
  }

  function duplicateProfile(profile: SavedEquipmentProfile) {
    // delegate to store (fresh id + persist + sync to other consumers)
    saveEquipmentRate({ ...profile, description: `${profile.description} (Copy)` });
  }

  function deleteProfile(id: string) {
    deleteEquipmentRate(id);
    if (editingId === id) setEditingId(null);
    if (selectedId === id) setSelectedId(null);
    setJustSaved(false);
  }

  const isEditing = !!editingId;

  // ==================== RENDER ====================
  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Header - matches Labor exactly */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <Wrench className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Equipment Rate Builder</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">PILLAR 3</Badge>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">LIVE</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Know your true cost per billable hour for every piece of equipment. Ownership + operating + depreciation.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            <RotateCcw className="mr-2 h-4 w-4" /> Start New
          </Button>
          <Button variant="outline" size="sm" onClick={reloadSavedRates}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reload Saved Rates
          </Button>
          {reloadMsg && (
            <span className="text-xs text-emerald-600 ml-1">{reloadMsg}</span>
          )}
        </div>
      </div>

      {/* Clean modern tabbed interface at the very top */}
      <div className="flex items-center">
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-sm">
          <button
            onClick={() => setActiveTab('builder')}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === 'builder'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Rate Builder
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === 'saved'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Saved Equipment
            {savedProfiles.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0 text-[10px] font-mono text-muted-foreground">
                {savedProfiles.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Rate Builder tab content */}
      <div className={activeTab === 'builder' ? '' : 'hidden'}>

      {/* Equipment Manager */}
      <Card className="card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Equipment Manager</CardTitle>
              <CardDescription className="mt-0.5">
                Manage multiple pieces of equipment. Click a profile on the left to load it instantly into the calculator below.
              </CardDescription>
            </div>
            <Button onClick={addCurrentProfile} size="sm">
              <Plus className="mr-2 h-4 w-4" /> Add New Equipment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: clean list of saved equipment (names only) */}
            <div className="lg:col-span-4 xl:col-span-3">
              <div className="text-xs font-semibold tracking-wider text-muted-foreground mb-2 px-1">SAVED PROFILES</div>
              {savedProfiles.length === 0 ? (
                <div className="rounded-md border border-dashed bg-surface-2 p-4 text-xs text-muted-foreground">
                  No profiles saved yet.<br />Use “Add New Equipment” or customize the form below then save.
                </div>
              ) : (
                <div className="max-h-[168px] overflow-y-auto space-y-1 pr-1">
                  {savedProfiles.map((profile) => {
                    const isActive = selectedId === profile.id;
                    return (
                      <div
                        key={profile.id}
                        onClick={() => loadProfile(profile)}
                        className={cn(
                          "group flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm cursor-pointer border transition-colors",
                          isActive
                            ? "border-primary/40 bg-primary/5 font-medium"
                            : "border-transparent hover:bg-muted hover:border-border"
                        )}
                      >
                        <span className="truncate">{profile.description}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-60 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProfile(profile.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Editable Equipment Name for the current working profile + actions */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-3">
              <div>
                <Label htmlFor="mgrDescription" className="text-sm font-medium">Equipment Name</Label>
                <Input
                  id="mgrDescription"
                  value={inputs.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  className="mt-1.5 text-base font-semibold placeholder:font-normal"
                  placeholder="e.g. Cat 320 Excavator - 2024"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Rename the current profile here. All sections below update live.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isEditing ? (
                  <Button onClick={updateSavedProfile} size="sm">
                    Save Changes to This Profile
                  </Button>
                ) : (
                  <Button onClick={addCurrentProfile} size="sm" variant="default">
                    Save Current Form as New Profile
                  </Button>
                )}
                <Button
                  onClick={() => {
                    if (editingId) {
                      const current = savedProfiles.find((p) => p.id === editingId);
                      if (current) duplicateProfile(current);
                    } else {
                      addCurrentProfile();
                    }
                  }}
                  size="sm"
                  variant="outline"
                >
                  Duplicate Current
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prominent Update Banner — appears at the top of the calculator area when editing a saved profile */}
      {isEditing && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-primary text-white border-0">EDITING</Badge>
              <span className="font-semibold text-lg truncate">
                {savedProfiles.find((p) => p.id === editingId)?.description || "Selected Equipment"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Changes below are live. Click <span className="font-medium">Save Changes</span> to update this saved profile.
            </p>
          </div>
          <Button 
            onClick={updateSavedProfile} 
            size="lg" 
            className="text-base font-semibold px-8 whitespace-nowrap"
          >
            <Save className="mr-2 h-4 w-4" /> Save Changes
          </Button>
        </div>
      )}

      {/* Brief success message after saving (replaces editing banner) */}
      {!isEditing && justSaved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-emerald-700 text-sm flex items-center gap-2 shadow-sm">
          ✓ Saved successfully! The selected equipment profile has been updated.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* LEFT COLUMN — INPUTS */}
        <div className="xl:col-span-7 space-y-6">
          {/* EQUIPMENT IDENTITY SECTION — asset identifiers (manual entry) */}
          <Card className="card">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Equipment Identity</CardTitle>
              <CardDescription>
                Asset identifiers for this machine. Meter hours is the lifetime/odometer reading — not this year&apos;s usage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <Label htmlFor="serialNumber" className="text-sm">Serial Number</Label>
                  <Input
                    id="serialNumber"
                    value={inputs.serialNumber || ""}
                    onChange={(e) => updateField("serialNumber", e.target.value)}
                    className="mt-1.5 h-10"
                    placeholder="Manufacturer serial #"
                  />
                </div>
                <div>
                  <Label htmlFor="unitNumber" className="text-sm">Unit Number</Label>
                  <Input
                    id="unitNumber"
                    value={inputs.unitNumber || ""}
                    onChange={(e) => updateField("unitNumber", e.target.value)}
                    className="mt-1.5 h-10"
                    placeholder="e.g. Unit 12"
                  />
                </div>
                <div>
                  <Label htmlFor="meterReading" className="text-sm">Meter Reading</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      id="meterReading"
                      type="number"
                      value={inputs.meterReading || ""}
                      onChange={(e) => updateField("meterReading", parseFloat(e.target.value) || 0)}
                      className="h-10 flex-1 text-center font-medium tabular-nums"
                      placeholder="0"
                    />
                    <select
                      aria-label="Meter unit"
                      value={inputs.meterUnit || "hours"}
                      onChange={(e) => updateField("meterUnit", e.target.value as 'hours' | 'miles' | 'km')}
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="hours">Hours</option>
                      <option value="miles">Miles</option>
                      <option value="km">KM</option>
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Total accumulated reading — hours for machines, miles/km for trucks. Not this year&apos;s usage.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DEPRECIATION SECTION */}
          <Card className="card">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Depreciation</CardTitle>
              <CardDescription>
                Define the service life and book values. Depreciation is calculated automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                {/* Dates */}
                <div>
                  <Label htmlFor="startDate" className="text-sm flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" /> Start Date (In Service)
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={inputs.startDate}
                    onChange={(e) => updateField("startDate", e.target.value)}
                    className="mt-1.5 h-10 text-center font-medium"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate" className="text-sm flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" /> End Date (End of Life)
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={inputs.endDate}
                    onChange={(e) => updateField("endDate", e.target.value)}
                    className="mt-1.5 h-10 text-center font-medium"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Approx. {calculations.years} years of useful life
                  </p>
                </div>

                {/* Values */}
                <div>
                  <Label htmlFor="startingValue" className="text-sm">Starting Value (Purchase / Book)</Label>
                  <CurrencyInput
                    id="startingValue"
                    value={inputs.startingValue}
                    onChange={(v) => updateField("startingValue", v)}
                    placeholder="0.00"
                    className="font-semibold placeholder:font-normal"
                  />
                </div>
                <div>
                  <Label htmlFor="endingValue" className="text-sm">Ending Value (Salvage / Residual)</Label>
                  <CurrencyInput
                    id="endingValue"
                    value={inputs.endingValue}
                    onChange={(v) => updateField("endingValue", v)}
                    placeholder="0.00"
                    className="font-semibold placeholder:font-normal"
                  />
                </div>

                {/* Calculated Depreciation */}
                <div className="sm:col-span-2 rounded-xl border bg-surface-2 p-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Depreciation (Total over life)</div>
                      <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1 text-foreground">
                        {formatCurrency(calculations.depreciationTotal)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Annualized</div>
                      <div className="text-2xl font-semibold tabular-nums text-primary">
                        {formatCurrency(calculations.annualDepreciation)} <span className="text-sm font-normal">/ yr</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* OWNERSHIP COST TABLE */}
          <Card className="card">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Ownership Cost</CardTitle>
              <CardDescription>
                Annual fixed costs of owning the equipment, regardless of hours worked.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[38%]">Category</TableHead>
                      <TableHead className="text-right">Cost ($ / yr)</TableHead>
                      <TableHead className="text-right">Per Unit ($/hr)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inputs.ownership.map((line) => {
                      const perHour = inputs.estimatedHours > 0
                        ? line.cost / inputs.estimatedHours
                        : 0;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">{line.name}</TableCell>
                          <TableCell>
                            <CurrencyInput
                              value={line.cost}
                              onChange={(v) => updateCostLine("ownership", line.id, v)}
                              placeholder="0.00"
                              wrapperClassName="h-9"
                              className="font-medium text-sm"
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-muted-foreground">
                            {formatCurrency(perHour)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Ownership subtotal */}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Total Ownership</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(calculations.ownershipAnnual)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary">
                        {formatCurrency(calculations.ownershipPerHour)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* OPERATING COST TABLE */}
          <Card className="card">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Operating Cost</CardTitle>
              <CardDescription>
                Variable costs that scale with usage. Enter expected annual spend in each category.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[38%]">Category</TableHead>
                      <TableHead className="text-right">Cost ($ / yr)</TableHead>
                      <TableHead className="text-right">Per Unit ($/hr)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inputs.operating.map((line) => {
                      const perHour = inputs.estimatedHours > 0
                        ? line.cost / inputs.estimatedHours
                        : 0;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">
                            {line.name}
                            {line.name === "Wear Items" && (
                              <div className="text-[10px] leading-tight text-muted-foreground mt-0.5">
                                e.g. Tracks, Tires, Teeth…
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <CurrencyInput
                              value={line.cost}
                              onChange={(v) => updateCostLine("operating", line.id, v)}
                              placeholder="0.00"
                              wrapperClassName="h-9"
                              className="font-medium text-sm"
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-muted-foreground">
                            {formatCurrency(perHour)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Operating subtotal */}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Total Operating</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(calculations.operatingAnnual)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary">
                        {formatCurrency(calculations.operatingPerHour)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN — LIVE RESULTS (sticky, matching Labor Rate Builder style) */}
        <div className="xl:col-span-5">
          <Card className="card border-primary/30 sticky top-20 shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm tracking-[0.5px] text-muted-foreground">LIVE RESULTS</CardTitle>
                  <div className="text-xl font-semibold tracking-tight mt-0.5">{inputs.description}</div>
                </div>
                {isEditing && <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/30">Editing</Badge>}
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-2">
              {/* Usage inputs (kept for core functionality) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Estimated Use (hours)</Label>
                  <Input
                    type="number"
                    value={inputs.estimatedHours || ""}
                    onChange={(e) => updateField("estimatedHours", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="mt-1 h-9 text-center font-semibold tabular-nums placeholder:font-normal"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Actual Use (hours)</Label>
                  <Input
                    type="number"
                    value={inputs.actualHours || ""}
                    onChange={(e) => updateField("actualHours", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="mt-1 h-9 text-center font-semibold tabular-nums placeholder:font-normal"
                  />
                </div>
              </div>

              {/* True Cost - prominent focal point like Labor's TRUE COST PER BILLABLE HOUR */}
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">TOTAL COST PER UNIT</div>
                <div className="text-6xl font-semibold tabular-nums tracking-[-0.04em] text-foreground">
                  {formatCurrency(calculations.totalCostPerHour)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-snug">
                  This is the accurate break-even cost per billable hour based on estimated use.
                </p>
              </div>

              {/* Clean breakdown list matching Labor style (grid list below main number) */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Depreciation</span>
                  <span className="font-mono tabular-nums">{formatCurrency(calculations.depreciationPerHour)}<span className="text-xs font-normal text-muted-foreground">/hr</span></span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">+ Ownership Cost</span>
                  <span className="font-mono tabular-nums text-primary">{formatCurrency(calculations.ownershipPerHour)}<span className="text-xs font-normal text-muted-foreground">/hr</span></span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ Operating Cost</span>
                  <span className="font-mono tabular-nums">{formatCurrency(calculations.operatingPerHour)}<span className="text-xs font-normal text-muted-foreground">/hr</span></span>
                </div>

                <div className="col-span-2 pt-2 border-t flex justify-between text-base font-semibold">
                  <span>Total Cost per Unit</span>
                  <span className="font-mono tabular-nums">{formatCurrency(calculations.totalCostPerHour)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                {isEditing ? (
                  <Button onClick={updateSavedProfile} size="lg" className="flex-1 text-base">
                    <Edit2 className="mr-2 h-4 w-4" /> Update Saved Equipment
                  </Button>
                ) : (
                  <Button onClick={addCurrentProfile} size="lg" className="flex-1 text-base">
                    <Plus className="mr-2 h-4 w-4" /> Add to My Equipment
                  </Button>
                )}
                <Button
                  onClick={isEditing ? () => setEditingId(null) : addCurrentProfile}
                  variant="outline"
                  size="lg"
                  className="flex-1 text-base"
                >
                  {isEditing ? "Cancel Edit" : "Save as New"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* BOTTOM — FULL EQUIPMENT COSTS SUMMARY TABLE */}
      <Card className="card">
        <CardHeader>
          <CardTitle>Equipment Costs Summary</CardTitle>
          <CardDescription>
            Roll-up of every cost category for the current estimate. All values update live as you edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cost Category</TableHead>
                  <TableHead className="text-right">Annual Cost</TableHead>
                  <TableHead className="text-right">Per Hour (Est. Use)</TableHead>
                  <TableHead className="text-right">Per Hour (Actual Use)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Depreciation row */}
                <TableRow>
                  <TableCell className="font-medium">Depreciation</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(calculations.annualDepreciation)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(calculations.depreciationPerHour)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(calculations.actualDepreciationPerHour)}
                  </TableCell>
                </TableRow>

                {/* All ownership lines */}
                {inputs.ownership.map((line) => {
                  const estPerHr = inputs.estimatedHours > 0 ? line.cost / inputs.estimatedHours : 0;
                  const actPerHr = inputs.actualHours > 0 ? line.cost / inputs.actualHours : 0;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(line.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(estPerHr)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(actPerHr)}</TableCell>
                    </TableRow>
                  );
                })}

                {/* All operating lines */}
                {inputs.operating.map((line) => {
                  const estPerHr = inputs.estimatedHours > 0 ? line.cost / inputs.estimatedHours : 0;
                  const actPerHr = inputs.actualHours > 0 ? line.cost / inputs.actualHours : 0;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(line.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(estPerHr)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(actPerHr)}</TableCell>
                    </TableRow>
                  );
                })}

                {/* Grand Total */}
                <TableRow className="border-t-2 font-semibold text-base bg-muted/40">
                  <TableCell>TOTAL ALL COSTS</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(calculations.totalAnnualCost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-primary">
                    {formatCurrency(calculations.totalCostPerHour)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-primary">
                    {formatCurrency(calculations.actualTotalPerHour)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Per-hour rates on the left use your Estimated Use. Right column shows the same costs spread over Actual hours used this year.
          </p>
        </CardContent>
      </Card>
      </div> {/* End Rate Builder tab content */}

      {/* Saved Equipment tab content */}
      <div className={activeTab === 'saved' ? '' : 'hidden'}>

      {/* SAVED EQUIPMENT PROFILES */}
      <Card className="card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Saved Equipment Profiles</CardTitle>
              <CardDescription>
                These detailed profiles are saved in your browser and available for future jobs.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {savedProfiles.length} saved
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {savedProfiles.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-surface-2 p-10 text-center text-sm text-muted-foreground">
              No equipment profiles saved yet. Use the Equipment Manager above or the buttons in the summary panel to save your first profile.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead className="text-right">Depreciation /yr</TableHead>
                    <TableHead className="text-right">Total Annual</TableHead>
                    <TableHead className="text-right font-semibold">Cost per Hour</TableHead>
                    <TableHead className="text-right font-semibold">Recommended Rate</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedProfiles.map((profile) => {
                    // Quick recalc for display using the saved profile's own values
                    const dep = Math.max(0, profile.startingValue - profile.endingValue);
                    const own = profile.ownership.reduce((s, l) => s + (l.cost || 0), 0);
                    const op = profile.operating.reduce((s, l) => s + (l.cost || 0), 0);
                    const annDep = dep / 8; // approximate for display
                    const totalAnn = annDep + own + op;
                    const hours = Math.max(1, profile.estimatedHours || 1000);
                    const cph = totalAnn / hours;
                    const rec = cph / (1 - (profile.targetMargin || 0) / 100);

                    const isSelected = selectedId === profile.id;
                    const isActivelyEditing = editingId === profile.id;

                    return (
                      <TableRow 
                        key={profile.id} 
                        onClick={() => {
                          loadProfile(profile);
                          setActiveTab('builder');
                        }}
                        className={cn(
                          "transition-colors cursor-pointer",
                          isSelected && "bg-primary/10 border-l-4 border-primary font-medium"
                        )}
                      >
                        <TableCell className="font-medium">
                          {profile.description}
                          {isActivelyEditing && (
                            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 align-middle">Editing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(annDep)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(totalAnn)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(cph)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-lg text-primary">
                          {formatCurrency(rec)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); loadProfile(profile); setActiveTab('builder'); }} title="Load">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); duplicateProfile(profile); }} title="Duplicate">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </div> {/* End Saved Equipment tab content */}

      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto">
        All calculations happen in your browser. Nothing is sent anywhere. These profiles feed directly into the Project Pricer.
      </p>
    </div>
  );
}
