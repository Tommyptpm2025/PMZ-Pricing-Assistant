"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PercentInput } from "@/components/ui/percent-input";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Plus, RotateCcw, Edit2, Copy, Trash2, TrendingUp, Save } from "lucide-react";
import {
  calculateLaborRate,
  calculateSensitivity,
  formatCurrency,
  formatPercent,
  DEFAULT_LABOR_INPUTS,
  normalizeLaborRateInputs,
  type LaborRateInputs,
  type LaborRateResult,
} from "@/lib/calculations";
import { useRateStore, STORAGE_EVENT } from "@/lib/rate-store";

// Helper to generate a simple id for saved rates (kept for any local needs; store now manages persistence ids)
function createId() {
  return Math.random().toString(36).slice(2, 11);
}

interface SavedRate extends LaborRateInputs {
  id: string;
}

export default function LaborRateBuilder() {
  // Current working inputs (live calculator)
  const [inputs, setInputs] = React.useState<LaborRateInputs>(DEFAULT_LABOR_INPUTS);

  // Live calculation result
  const result: LaborRateResult = React.useMemo(() => calculateLaborRate(inputs), [inputs]);

  // Track which saved rate we are currently editing (if any)
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Track the currently selected saved rate (persists after save for table highlight)
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Brief success message after saving changes
  const [justSaved, setJustSaved] = React.useState(false);
  const [reloadMsg, setReloadMsg] = React.useState('');

  // Tab state for the clean tabbed interface (matching Equipment)
  const [activeTab, setActiveTab] = React.useState<'builder' | 'saved'>('builder');

  // Sensitivity quick scenarios
  const [sensitivityDelta, setSensitivityDelta] = React.useState(3);

  // Centralized rate store (single source for labor/equip/material; survives tab switches, Fast Refresh, reloads)
  const {
    laborRates: savedRates,
    saveLaborRate,
    updateLaborRate,
    deleteLaborRate,
    getLaborRates,
    reloadFromStorage,
  } = useRateStore();

  const sensitivity = React.useMemo(
    () => calculateSensitivity(inputs, sensitivityDelta),
    [inputs, sensitivityDelta]
  );

  // Update a single field (keeps everything reactive)
  function updateField<K extends keyof LaborRateInputs>(field: K, value: LaborRateInputs[K]) {
    setInputs((prev) => ({ ...prev, [field]: value }));
    // If we were editing, clear the "editing" banner when user starts tweaking
    if (editingId) {
      // keep editingId so user knows they can "Update" instead of "Add New"
    }
  }

  function resetToDefaults() {
    setInputs(DEFAULT_LABOR_INPUTS);
    setEditingId(null);
    setSelectedId(null);
    setJustSaved(false);
  }

  // Add current calculation as a new saved rate (delegates persistence to centralized store)
  function addCurrentRate() {
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Current form data:", inputs);
    // store generates id + does defensive write + dispatch for cross-component sync + logs
    const newId = saveLaborRate({ ...inputs });
    console.log('[Labor Rates] saveLaborRate delegated to store, new id:', newId);
    console.log('[Labor Rates] New profile added (via store):', inputs, 'new total count will be logged by store');
    setEditingId(null);
    setSelectedId(newId);
    setJustSaved(false);
  }

  // Update an existing saved rate (when editing) (delegates persistence to centralized store)
  function updateSavedRate() {
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Current form data:", inputs);
    if (!editingId) {
      console.warn('[Labor Rates] SAVE CHANGES but no editingId, aborting');
      return;
    }
    const currentId = editingId;
    // store does the map + write + dispatch + log
    updateLaborRate(currentId, { ...inputs });
    console.log('[Labor Rates] updateLaborRate delegated to store for id:', currentId);
    // Clear editing state (hides banner and "EDITING" badges in form area)
    // but keep selectedId so the table row stays highlighted as the active profile
    setEditingId(null);
    setJustSaved(true);
    // Auto-hide success message after 2.5 seconds
    setTimeout(() => setJustSaved(false), 2500);
  }

  // Load a saved rate into the live calculator for editing / what-if
  function loadRate(rate: SavedRate) {
    // Normalize in case the saved rate is from before the union fields were added
    const normalized = normalizeLaborRateInputs(rate);
    setInputs(normalized);
    setEditingId(rate.id);
    setSelectedId(rate.id);
    setJustSaved(false);
    setActiveTab('builder');
    // Scroll to top of form for better UX
    window.scrollTo({ top: 120, behavior: "smooth" });
  }

  function duplicateRate(rate: SavedRate) {
    // delegate to store (it will assign a fresh id and persist + sync)
    saveLaborRate({ ...rate, role: `${rate.role} (Copy)` });
  }

  function deleteRate(id: string) {
    console.log(`[Labor Rates] Deleting ID: ${id}`);
    const currentList: SavedRate[] = savedRates || [];
    const updatedList = currentList.filter((r: SavedRate) => r.id !== id);
    console.log(`[Labor Rates] Items remaining after delete: ${updatedList.length}`);
    // Write updated array back to localStorage immediately (do not clear/replace entire array)
    localStorage.setItem('pmz_labor_rates', JSON.stringify(updatedList));
    // Emit update so EPP/LEM dropdowns react
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    // Update this page's state from store (via reload which re-reads LS + sets)
    reloadFromStorage();
    if (editingId === id) {
      setEditingId(null);
    }
    if (selectedId === id) {
      setSelectedId(null);
    }
    setJustSaved(false);
  }

  // Manual reload from central store (forces fresh read from localStorage for recovery)
  function reloadSavedRates() {
    reloadFromStorage();
    console.log('[Labor Rates] reloadSavedRates -> delegated to rate-store reloadFromStorage');
    setReloadMsg("Rates reloaded from storage");
    setTimeout(() => setReloadMsg(''), 2000);
  }

  // Quick sensitivity buttons
  const quickDeltas = [-5, -3, -1, 1, 3, 5];

  // Is the current form representing a saved rate we're editing?
  const isEditing = !!editingId;

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <Users className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Labor Rate Builder</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">PILLAR 3</Badge>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">LIVE</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Know your real cost per billable hour. Every input changes the numbers instantly.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={resetToDefaults}
          className="self-start sm:self-auto"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to Defaults
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={reloadSavedRates}
          className="self-start sm:self-auto"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reload Saved Rates
        </Button>
        {reloadMsg && (
          <span className="text-xs text-emerald-600 self-start sm:self-auto ml-2">{reloadMsg}</span>
        )}
      </div>

      {/* Clean modern tabbed interface at the very top (exact match to Equipment Rate Builder) */}
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
            Saved Labor Rates
            {savedRates.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0 text-[10px] font-mono text-muted-foreground">
                {savedRates.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Rate Builder tab content (full calculator + editing UI + banners) */}
      <div className={activeTab === 'builder' ? '' : 'hidden'}>

      {/* Prominent Save Changes banner — appears at the top of the calculator/form area when editing a saved rate.
          Matches the Equipment Rate Builder pattern for discoverable updates without duplicates. */}
      {isEditing && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-primary text-white border-0">EDITING</Badge>
              <span className="font-semibold text-lg truncate">
                {inputs.role}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Changes below are live. Click <span className="font-medium">Save Changes</span> to update the selected saved rate.
            </p>
          </div>
          <Button 
            onClick={updateSavedRate} 
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
          ✓ Saved successfully! The selected rate has been updated.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* INPUT FORM */}
        <div className="xl:col-span-7 space-y-6">
          <Card className="card">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Role &amp; Pay Inputs</CardTitle>
              <CardDescription>
                Enter real numbers from your payroll and field reality. The outputs update live.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Role + Base Wage */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="role" className="text-sm">Role / Position</Label>
                  <Input
                    id="role"
                    value={inputs.role}
                    onChange={(e) => updateField("role", e.target.value)}
                    className="mt-1.5 text-base"
                    placeholder="Journeyman Electrician"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">This name will appear in the Project Pricer.</p>
                </div>
                <div>
                  <Label htmlFor="baseWage" className="text-sm">Base Hourly Wage</Label>
                  <CurrencyInput
                    id="baseWage"
                    value={inputs.baseWage}
                    onChange={(v) => updateField("baseWage", v)}
                    wrapperClassName="h-10"
                    className="font-semibold"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">What the employee actually receives per hour worked.</p>
                </div>
              </div>

              {/* Statutory Percentage Burdens */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-wider text-muted-foreground">STATUTORY BURDENS</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
                  {[
                    { key: "payrollTaxes" as const, label: "Payroll Taxes", hint: "FICA, Medicare, FUTA, SUTA — usually calculated on base wage only" },
                    { key: "pto" as const, label: "Paid Time Off / Vacation", hint: "Holidays, vacation, sick leave — typically % of base wage" },
                  ].map(({ key, label, hint }) => (
                    <div key={key}>
                      <Label htmlFor={key} className="text-sm">{label}</Label>
                      <div className="mt-1.5">
                        <PercentInput
                          id={key}
                          value={inputs[key]}
                          onChange={(v) => updateField(key, v)}
                          className="font-medium"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-tight">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fixed Fringes — flat dollars-per-hour benefits (union, prevailing-wage, or open-shop) */}
              <div className="rounded-xl border bg-surface-2 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-wider text-muted-foreground">
                    FIXED FRINGES &amp; BENEFITS
                  </span>
                  <span className="text-xs font-mono text-primary">
                    Real dollars per hour (not %)
                  </span>
                </div>

                {/* Clean 2x2 grid for the four fringe fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {[
                    { key: "healthAndWelfare" as const, label: "Health & Welfare (H&W)", hint: "Medical, dental, vision benefits" },
                    { key: "pension" as const, label: "Pension / Retirement", hint: "Pension, annuity, or 401(k) contributions" },
                    { key: "training" as const, label: "Training", hint: "Apprenticeship or training contributions" },
                    { key: "otherFixedFringes" as const, label: "Other Fixed Fringes", hint: "Vacation, supplemental, other fixed benefits" },
                  ].map(({ key, label, hint }) => (
                    <div key={key}>
                      <Label htmlFor={key} className="text-sm">{label}</Label>
                      <div className="mt-1.5">
                        <CurrencyInput
                          id={key}
                          value={inputs[key]}
                          onChange={(v) => updateField(key, v)}
                          unit="/ hr"
                          className="font-medium"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-tight">{hint}</p>
                    </div>
                  ))}
                </div>

                {/* Prominent Total Fixed Fringes summary */}
                <div className="mt-6 rounded-xl border border-primary/30 bg-white px-5 py-4 flex items-center justify-between shadow-sm">
                  <span className="text-base font-semibold text-muted-foreground">Total Fixed Fringes</span>
                  <span className="font-bold tabular-nums text-2xl text-primary">
                    {formatCurrency(
                      (inputs.healthAndWelfare || 0) +
                      (inputs.pension || 0) +
                      (inputs.training || 0) +
                      (inputs.otherFixedFringes || 0)
                    )} <span className="text-sm font-medium text-muted-foreground">/ hr</span>
                  </span>
                </div>

                <p className="mt-3 text-[11px] text-muted-foreground">
                  Enter any fixed hourly benefits you pay — from a union remittance, a prevailing-wage determination, or your own benefit package. They add dollar-for-dollar to your cost.
                </p>
              </div>

              {/* Operational & Insurance */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-wider text-muted-foreground">OPERATIONAL &amp; INSURANCE</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Insurance Burden sub-group (prominent for heavy / civil work) */}
                <div className="mb-6">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-sm font-semibold tracking-wider text-muted-foreground">INSURANCE BURDEN</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    {/* Workers Compensation — first */}
                    <div>
                      <Label htmlFor="workersComp" className="text-sm">Workers’ Compensation</Label>
                      <div className="mt-1.5">
                        <CurrencyInput
                          id="workersComp"
                          value={inputs.workersComp}
                          onChange={(v) => updateField("workersComp", v)}
                          unit="/ $100"
                          className="font-medium"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-tight">Commonly billed per $100 of payroll.</p>
                    </div>

                    {/* General Liability — directly under Workers Comp in the insurance group */}
                    <div>
                      <Label htmlFor="generalLiabilityPerThousand" className="text-sm">General Liability</Label>
                      <div className="mt-1.5">
                        <CurrencyInput
                          id="generalLiabilityPerThousand"
                          value={inputs.generalLiabilityPerThousand}
                          onChange={(v) => updateField("generalLiabilityPerThousand", v)}
                          unit="/ $1,000 payroll"
                          className="font-medium"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Commonly billed per $1,000 of payroll.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Other Operational fields */}
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {/* Supervision & Downtime */}
                  {[
                    { key: "supervision" as const, label: "Supervision / Oversight", hint: "Foremen, superintendents, and PM time allocated across billable hours" },
                    { key: "downtime" as const, label: "Downtime / Non-Billable", hint: "Weather, travel, shop time, breaks, mobilization — time you cannot invoice" },
                  ].map(({ key, label, hint }) => (
                    <div key={key}>
                      <Label htmlFor={key} className="text-sm">{label}</Label>
                      <div className="mt-1.5">
                        <PercentInput
                          id={key}
                          value={inputs[key]}
                          onChange={(v) => updateField(key, v)}
                          className="font-medium"
                        />
                      </div>
                      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{hint}</p>
                    </div>
                  ))}

                  {/* Per Diem / Vehicle Allowance */}
                  <div>
                    <Label htmlFor="perDiem" className="text-sm">Per Diem / Vehicle Allowance</Label>
                    <div className="mt-1.5">
                      <CurrencyInput
                        id="perDiem"
                        value={inputs.perDiem}
                        onChange={(v) => updateField("perDiem", v)}
                        unit="/ hr"
                        className="font-medium"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Truck, fuel, per diem, tool allowance added to every hour.</p>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Sensitivity Analysis */}
          <Card className="card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> What-if Sensitivity
              </CardTitle>
              <CardDescription>
                See instantly how a wage increase (or decrease) flows through to your recommended rate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {quickDeltas.map((d) => (
                  <Button
                    key={d}
                    variant={sensitivityDelta === d ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSensitivityDelta(d)}
                  >
                    {d > 0 ? "+" : ""}${d}/hr
                  </Button>
                ))}
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-sm text-muted-foreground">Custom:</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={sensitivityDelta}
                    onChange={(e) => setSensitivityDelta(parseFloat(e.target.value) || 0)}
                    className="w-20 h-9 text-center"
                  />
                  <span className="text-sm text-muted-foreground">$/hr</span>
                </div>
              </div>

              <div className="rounded-lg border bg-white p-4 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <div>
                    <span className="text-muted-foreground">At </span>
                    <span className="font-semibold tabular-nums">${(inputs.baseWage + sensitivityDelta).toFixed(2)}/hr</span>
                    <span className="text-muted-foreground"> base wage</span>
                  </div>
                  <div className="font-semibold tabular-nums text-lg">
                    {formatCurrency(sensitivity.newRecommendedRate)}
                  </div>
                  <div className={sensitivity.delta >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {sensitivity.delta >= 0 ? "+" : ""}{formatCurrency(sensitivity.delta)} 
                    <span className="ml-1 text-xs font-normal">({sensitivity.percentChange > 0 ? "+" : ""}{sensitivity.percentChange}%)</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  This is the new recommended billable rate if base wages moved by ${sensitivityDelta}.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LIVE RESULTS — THE IMPORTANT PART */}
        <div className="xl:col-span-5">
          <Card className="card border-primary/30 sticky top-20 shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm tracking-[0.5px] text-muted-foreground">LIVE RESULTS</CardTitle>
                  <div className="text-xl font-semibold tracking-tight mt-0.5">{inputs.role}</div>
                </div>
                {isEditing && (
                  <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/30">Editing saved rate</Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-2">
              {/* True Cost */}
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">TRUE COST PER BILLABLE HOUR</div>
                <div className="text-6xl font-semibold tabular-nums tracking-[-0.04em] text-foreground">
                  {formatCurrency(result.trueCostPerBillableHour)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-snug">
                  This is what it actually costs you — after every tax, benefit, supervision hour, and non-billable minute — 
                  for every hour you can invoice a customer.
                </p>
              </div>

              {/* Quick breakdown — shows fixed-fringe contributions clearly */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base wage</span>
                  <span className="font-mono tabular-nums">{formatCurrency(inputs.baseWage)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">+ Fixed Fringes</span>
                  <span className="font-mono tabular-nums text-primary">{formatCurrency(result.fixedFringesTotal)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ Statutory &amp; Supervision</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(
                      result.employerCostPerWorkedHour -
                      result.fixedFringesTotal -
                      result.workersCompPerHour -
                      result.generalLiabilityPerHour -
                      (inputs.perDiem || 0) -
                      inputs.baseWage
                    )}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">+ Workers' Comp</span>
                  <span className="font-mono tabular-nums">{formatCurrency(result.workersCompPerHour)}</span>
                </div>

                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">+ General Liability</span>
                  <span className="font-mono tabular-nums">{formatCurrency(result.generalLiabilityPerHour)}</span>
                </div>

                <div className="col-span-2 pt-2 border-t flex justify-between text-base font-semibold">
                  <span>Employer cost per worked hour</span>
                  <span className="font-mono tabular-nums">{formatCurrency(result.employerCostPerWorkedHour)}</span>
                </div>

                <div className="col-span-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Billable utilization after downtime</span>
                  <span className="font-mono tabular-nums">{formatPercent(100 - inputs.downtime)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                {isEditing ? (
                  <Button onClick={updateSavedRate} size="lg" className="flex-1 text-base">
                    <Edit2 className="mr-2 h-4 w-4" /> Update Saved Rate
                  </Button>
                ) : (
                  <Button onClick={addCurrentRate} size="lg" className="flex-1 text-base">
                    <Plus className="mr-2 h-4 w-4" /> Add to My Rates
                  </Button>
                )}
                <Button
                  onClick={isEditing ? () => { setEditingId(null); } : addCurrentRate}
                  variant="outline"
                  size="lg"
                  className="flex-1 text-base"
                >
                  {isEditing ? "Cancel Edit" : "Save as New Rate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div> {/* End Rate Builder tab content */}

      {/* Saved Labor Rates tab content */}
      <div className={activeTab === 'saved' ? '' : 'hidden'}>

      {/* SAVED RATES TABLE */}
      <Card className="card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Saved Labor Rates</CardTitle>
              <CardDescription>
                These rates are stored in your browser and will be available when you build jobs in the Project Pricer.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {savedRates.length} saved
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {savedRates.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-surface-2 p-10 text-center">
              <p className="text-muted-foreground">No rates saved yet. Use the form above and click “Add to My Rates”.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Fixed Fringes</TableHead>
                    <TableHead className="text-right">Total Burden</TableHead>
                    <TableHead className="text-right">True Cost / Billable</TableHead>
                    <TableHead className="text-right font-semibold">Recommended Rate</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedRates.map((rate) => {
                    const r = calculateLaborRate(rate);
                    const isSelected = selectedId === rate.id;
                    const isActivelyEditing = editingId === rate.id;
                    const rowKey = rate.id;
                    return (
                      <TableRow 
                        key={rowKey} 
                        className={cn(
                          "transition-colors",
                          isSelected && "bg-primary/10 border-l-4 border-primary font-medium"
                        )}
                      >
                        <TableCell className="font-medium">
                          {rate.role}
                          {isActivelyEditing && (
                            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 align-middle">Editing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(rate.baseWage)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-primary">
                          {formatCurrency(
                            (rate.healthAndWelfare || 0) +
                            (rate.pension || 0) +
                            (rate.training || 0) +
                            (rate.otherFixedFringes || 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(r.totalBurdenPercent)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.trueCostPerBillableHour)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-lg text-primary">
                          {formatCurrency(r.recommendedBillableRate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => loadRate(rate)}
                              title="Load into calculator"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => duplicateRate(rate)}
                              title="Duplicate"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteRate(rate.id)}
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
      </div> {/* End Saved Labor Rates tab content */}

      {/* Footer note */}
      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto">
        All calculations happen in your browser. Nothing is sent anywhere. 
        These rates will feed directly into the Project Pricer when that tool is complete.
      </p>
    </div>
  );
}
