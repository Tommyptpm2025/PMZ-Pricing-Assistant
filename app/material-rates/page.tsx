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
import { Package, Plus, RotateCcw, Edit2, Copy, Trash2, Save } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { useRateStore } from "@/lib/rate-store";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

interface MaterialProfile {
  id: string;
  description: string;        // Material Name / Description
  unitOfMeasure: string;
  baseCost: number;           // Cost per UOM (true cost from supplier)
  deliveryCost: number;       // Delivery / Freight per UOM (optional, 0 = none)
  supplier?: string;
  notes?: string;
}

interface SavedMaterial extends MaterialProfile {}

// Common units of measure for construction / pricing
const UOM_OPTIONS = [
  "Ton",
  "Cubic Yard",
  "Each",
  "Bag",
  "Gallon",
  "Litre",
  "Linear Foot",
  "Square Foot",
  "Cubic Foot",
  "Pound",
  "Piece",
  "Roll",
  "Sheet",
  "Pallet",
  "Other",
];

// Realistic default example
const DEFAULT_MATERIAL: MaterialProfile = {
  id: "",
  description: "Concrete - 4000 PSI",
  unitOfMeasure: "Cubic Yard",
  baseCost: 125.00,
  deliveryCost: 15.00,
  supplier: "ABC Ready Mix",
  notes: "Standard delivery within 10 miles. Fuel surcharge may apply.",
};

export default function MaterialRateBuilder() {
  // Current working profile (live calculator)
  const [inputs, setInputs] = React.useState<MaterialProfile>({ ...DEFAULT_MATERIAL });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [reloadMsg, setReloadMsg] = React.useState('');

  // Tab state - exact same pattern as Labor & Equipment
  const [activeTab, setActiveTab] = React.useState<'builder' | 'saved'>('builder');

  // Centralized rate store (single source for labor/equip/material; survives tab switches, Fast Refresh, reloads)
  const {
    materialRates: savedMaterials,
    saveMaterialRate,
    updateMaterialRate,
    deleteMaterialRate,
    getMaterialRates,
    reloadFromStorage,
  } = useRateStore();

  // Manual reload from central store (forces fresh read from localStorage for recovery)
  function reloadSavedRates() {
    reloadFromStorage();
    console.log('[Material Rates] reloadSavedRates -> delegated to rate-store reloadFromStorage');
    setReloadMsg("Rates reloaded from storage");
    setTimeout(() => setReloadMsg(''), 2000);
  }

  // Live landed / total true cost calculation (pure cost only)
  const landedCost = React.useMemo(() => {
    const base = inputs.baseCost || 0;
    const delivery = inputs.deliveryCost || 0;
    return Math.round((base + delivery) * 100) / 100;
  }, [inputs.baseCost, inputs.deliveryCost]);

  // ==================== UPDATE HELPERS ====================
  function updateField<K extends keyof MaterialProfile>(field: K, value: MaterialProfile[K]) {
    setInputs((prev) => ({ ...prev, [field]: value }));
  }

  function resetToDefaults() {
    setInputs({ ...DEFAULT_MATERIAL });
    setEditingId(null);
    setSelectedId(null);
    setJustSaved(false);
  }

  // ==================== SAVED PROFILES (delegates to centralized store) ====================
  function addCurrentMaterial() {
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Current form data:", inputs);
    const newId = saveMaterialRate({ ...inputs });
    console.log('[Material Rates] saveMaterialRate delegated to store, new id:', newId);
    setEditingId(null);
    setSelectedId(newId);
    setJustSaved(false);
  }

  function updateSavedMaterial() {
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Current form data:", inputs);
    if (!editingId) {
      console.warn('[Material Rates] SAVE CHANGES but no editingId, aborting');
      return;
    }
    const currentId = editingId;
    updateMaterialRate(currentId, { ...inputs });
    console.log('[Material Rates] updateMaterialRate delegated to store for id:', currentId);
    // Clear editing UI after successful save (banner + Save Changes button disappear)
    // but keep selectedId so the table row stays highlighted
    setEditingId(null);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  }

  function loadMaterial(profile: SavedMaterial) {
    setInputs({ ...profile });
    setEditingId(profile.id);
    setSelectedId(profile.id);
    setJustSaved(false);
    window.scrollTo({ top: 120, behavior: "smooth" });
  }

  function duplicateMaterial(profile: SavedMaterial) {
    // delegate to store (fresh id + persist + sync)
    saveMaterialRate({ ...profile, description: `${profile.description} (Copy)` });
  }

  function deleteMaterial(id: string) {
    deleteMaterialRate(id);
    if (editingId === id) setEditingId(null);
    if (selectedId === id) setSelectedId(null);
    setJustSaved(false);
  }

  const isEditing = !!editingId;

  // ==================== RENDER ====================
  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Header - exact match to Labor & Equipment */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <Package className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Material Rate Builder</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">PILLAR 3</Badge>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">LIVE</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Know your true landed cost per unit. Pure cost tracking for accurate project pricing.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={resetToDefaults} className="self-start sm:self-auto">
          <RotateCcw className="mr-2 h-4 w-4" /> Reset to Defaults
        </Button>
        <Button variant="outline" size="sm" onClick={reloadSavedRates} className="self-start sm:self-auto">
          <RotateCcw className="mr-2 h-4 w-4" /> Reload Saved Rates
        </Button>
        {reloadMsg && (
          <span className="text-xs text-emerald-600 self-start sm:self-auto ml-2">{reloadMsg}</span>
        )}
      </div>

      {/* Clean modern tabbed interface - exact same as Labor & Equipment */}
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
            Saved Materials
            {savedMaterials.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0 text-[10px] font-mono text-muted-foreground">
                {savedMaterials.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Rate Builder tab content */}
      <div className={activeTab === 'builder' ? '' : 'hidden'}>

        {/* Material Manager - modeled exactly after Equipment Manager */}
        <Card className="card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Material Manager</CardTitle>
                <CardDescription className="mt-0.5">
                  Manage your reusable material library. Switch profiles instantly.
                </CardDescription>
              </div>
              <Button onClick={addCurrentMaterial} size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add New Material
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: clean list of saved materials */}
              <div className="lg:col-span-4 xl:col-span-3">
                <div className="text-xs font-semibold tracking-wider text-muted-foreground mb-2 px-1">SAVED MATERIALS</div>
                {savedMaterials.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-surface-2 p-4 text-xs text-muted-foreground">
                    No materials saved yet. Use the form below and click “Add New Material”.
                  </div>
                ) : (
                  <div className="max-h-[168px] overflow-y-auto space-y-1 pr-1">
                    {savedMaterials.map((profile) => {
                      const isActive = selectedId === profile.id;
                      return (
                        <div
                          key={profile.id}
                          onClick={() => loadMaterial(profile)}
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
                              deleteMaterial(profile.id);
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

              {/* Right: editable current material + actions */}
              <div className="lg:col-span-8 xl:col-span-9 space-y-3">
                <div>
                  <Label htmlFor="mgrDescription" className="text-sm font-medium">Material Name / Description</Label>
                  <Input
                    id="mgrDescription"
                    value={inputs.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    className="mt-1.5 text-base font-semibold"
                    placeholder="Concrete - 4000 PSI"
                  />
                </div>

                <div>
                  <Label htmlFor="mgrNotes" className="text-sm font-medium">Notes / Delivery Terms</Label>
                  <Input
                    id="mgrNotes"
                    value={inputs.notes || ""}
                    onChange={(e) => updateField("notes", e.target.value)}
                    className="mt-1.5"
                    placeholder="Lead time, minimum order, delivery radius..."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isEditing ? (
                    <Button onClick={updateSavedMaterial} size="sm">
                      <Save className="mr-2 h-4 w-4" /> Save Changes to This Material
                    </Button>
                  ) : (
                    <Button onClick={addCurrentMaterial} size="sm" variant="default">
                      <Plus className="mr-2 h-4 w-4" /> Save Current as New Material
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      const fresh = { ...DEFAULT_MATERIAL };
                      setInputs(fresh);
                      setEditingId(null);
                      setSelectedId(null);
                      setJustSaved(false);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Start Fresh (New Blank)
                  </Button>
                  <Button
                    onClick={() => {
                      if (editingId) {
                        const current = savedMaterials.find((m) => m.id === editingId);
                        if (current) duplicateMaterial(current);
                      } else {
                        addCurrentMaterial();
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

        {/* Prominent Editing Banner (only on Rate Builder tab when editing) */}
        {isEditing && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-primary text-white border-0">EDITING</Badge>
                <span className="font-semibold text-lg truncate">{inputs.description}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Changes below are live. Click <span className="font-medium">Save Changes</span> to update this material profile.
              </p>
            </div>
            <Button 
              onClick={updateSavedMaterial} 
              size="lg" 
              className="text-base font-semibold px-8 whitespace-nowrap"
            >
              <Save className="mr-2 h-4 w-4" /> Save Changes
            </Button>
          </div>
        )}

        {/* Brief success message after saving */}
        {!isEditing && justSaved && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-emerald-700 text-sm flex items-center gap-2 shadow-sm">
            ✓ Saved successfully! The selected material profile has been updated.
          </div>
        )}

        {/* MAIN CALCULATOR - Rate Builder content */}
        <div className="grid gap-6 xl:grid-cols-12">
          {/* LEFT COLUMN - Inputs */}
          <div className="xl:col-span-7 space-y-6">
            <Card className="card">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Material Details</CardTitle>
                <CardDescription>
                  Enter the true supplier cost. Landed cost updates instantly with no markup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  {/* Unit of Measure */}
                  <div>
                    <Label htmlFor="unitOfMeasure" className="text-sm">Unit of Measure (UOM)</Label>
                    <select
                      id="unitOfMeasure"
                      value={inputs.unitOfMeasure}
                      onChange={(e) => updateField("unitOfMeasure", e.target.value)}
                      className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {UOM_OPTIONS.map((uom) => (
                        <option key={uom} value={uom}>{uom}</option>
                      ))}
                    </select>
                  </div>

                  {/* Base Cost per UOM */}
                  <div>
                    <Label htmlFor="baseCost" className="text-sm">Base Cost per UOM</Label>
                    <CurrencyInput
                      id="baseCost"
                      value={inputs.baseCost}
                      onChange={(v) => updateField("baseCost", v)}
                      unit={inputs.unitOfMeasure}
                      className="font-semibold"
                    />
                  </div>

                  {/* Delivery / Freight per UOM (optional) */}
                  <div>
                    <Label htmlFor="deliveryCost" className="text-sm">Delivery / Freight per UOM (optional)</Label>
                    <CurrencyInput
                      id="deliveryCost"
                      value={inputs.deliveryCost}
                      onChange={(v) => updateField("deliveryCost", v)}
                      unit={inputs.unitOfMeasure}
                      className="font-medium"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">Freight, fuel surcharge, or other per-unit delivery cost.</p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="notes" className="text-sm">Notes / Delivery Terms</Label>
                  <Input
                    id="notes"
                    value={inputs.notes || ""}
                    onChange={(e) => updateField("notes", e.target.value)}
                    className="mt-1.5"
                    placeholder="Lead time, minimum order quantity, delivery radius..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN - Live Landed Cost (prominent, true-cost only) */}
          <div className="xl:col-span-5">
            <Card className="card border-primary/30 sticky top-20 shadow-lg">
              <CardHeader className="pb-2">
                <div>
                  <CardTitle className="text-sm tracking-[0.5px] text-muted-foreground">LIVE LANDED COST</CardTitle>
                  <div className="text-xl font-semibold tracking-tight mt-0.5 truncate">{inputs.description}</div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-2">
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
                  <div className="text-xs uppercase tracking-[1px] text-primary font-semibold">LANDED / TOTAL COST PER UNIT</div>
                  <div className="text-[56px] leading-none font-semibold tabular-nums tracking-[-0.04em] text-primary mt-1">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(landedCost)}
                  </div>
                  <div className="mt-2 text-sm text-primary/90">
                    Base + Delivery per {inputs.unitOfMeasure}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  This is your true cost. No markup is applied on this page.
                </div>

                {/* Action buttons - exact same pattern */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  {isEditing ? (
                    <Button onClick={updateSavedMaterial} size="lg" className="flex-1 text-base">
                      <Save className="mr-2 h-4 w-4" /> Update Saved Material
                    </Button>
                  ) : (
                    <Button onClick={addCurrentMaterial} size="lg" className="flex-1 text-base">
                      <Plus className="mr-2 h-4 w-4" /> Add to My Materials
                    </Button>
                  )}
                  <Button
                    onClick={isEditing ? () => setEditingId(null) : addCurrentMaterial}
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
      </div> {/* End Rate Builder tab */}

      {/* Saved Materials tab content */}
      <div className={activeTab === 'saved' ? '' : 'hidden'}>
        <Card className="card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Saved Materials</CardTitle>
                <CardDescription>
                  Your reusable true-cost material library. These profiles are available for the Project Pricer.
                </CardDescription>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {savedMaterials.length} saved
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {savedMaterials.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-surface-2 p-10 text-center text-sm text-muted-foreground">
                No materials saved yet. Use the Rate Builder tab to add your first material.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Base Cost</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead className="text-right font-semibold">Landed Cost</TableHead>
                      <TableHead className="w-px" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedMaterials.map((mat) => {
                      const landed = Math.round((mat.baseCost + (mat.deliveryCost || 0)) * 100) / 100;
                      const isSelected = selectedId === mat.id;
                      return (
                        <TableRow 
                          key={mat.id} 
                          className={cn(
                            "transition-colors",
                            isSelected && "bg-primary/10 border-l-4 border-primary font-medium"
                          )}
                        >
                          <TableCell className="font-medium">
                            {mat.description}
                            {editingId === mat.id && (
                              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 align-middle">Editing</Badge>
                            )}
                          </TableCell>
                          <TableCell>{mat.unitOfMeasure}</TableCell>
                          <TableCell className="text-right tabular-nums">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(mat.baseCost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(mat.deliveryCost || 0)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-primary">
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(landed)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => loadMaterial(mat)} title="Load into calculator">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => duplicateMaterial(mat)} title="Duplicate">
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMaterial(mat.id)}
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
      </div>

      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto">
        All calculations happen in your browser. Nothing is sent anywhere. These true-cost material profiles feed directly into the Project Pricer.
      </p>
    </div>
  );
}
