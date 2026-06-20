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
import { Box, Plus, RotateCcw, Edit2, Copy, Trash2, Save } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { useRateStore } from "@/lib/rate-store";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

interface MiscProfile {
  id: string;
  description: string;        // Misc Name / Description
  unitOfMeasure: string;
  baseCost: number;           // Cost per UOM (true cost from supplier)
  deliveryCost: number;       // Delivery / Freight per UOM (optional, 0 = none)
  supplier?: string;
  notes?: string;
}

interface SavedMisc extends MiscProfile {}

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

// Realistic default example (kept for reference; builders no longer seed from it).
const DEFAULT_MISC: MiscProfile = {
  id: "",
  description: "Scaffolding Rental - Weekly",
  unitOfMeasure: "Each",
  baseCost: 250.00,
  deliveryCost: 50.00,
  supplier: "ABC Scaffolding Co",
  notes: "Includes setup and takedown. Weekly rate.",
};

// Blank template — a NEW misc rate starts empty (numeric fields show a faded placeholder,
// not a literal 0). DEFAULT_MISC above stays available but is no longer used for seeding.
const BLANK_MISC: MiscProfile = {
  id: "",
  description: "",
  unitOfMeasure: "",
  baseCost: 0,
  deliveryCost: 0,
  supplier: "",
  notes: "",
};

export default function MiscRateBuilder() {
  // Current working profile (live calculator)
  const [inputs, setInputs] = React.useState<MiscProfile>({ ...BLANK_MISC });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [reloadMsg, setReloadMsg] = React.useState('');

  // Tab state - exact same pattern as Material
  const [activeTab, setActiveTab] = React.useState<'builder' | 'saved'>('builder');

  // Centralized rate store - using MISC specific functions (independent from material)
  const {
    miscRates: savedMisc,
    saveMiscRate,
    updateMiscRate,
    deleteMiscRate,
    getMiscRates,
    reloadFromStorage,
  } = useRateStore();

  // Manual reload from central store (forces fresh read from localStorage for recovery)
  function reloadSavedRates() {
    reloadFromStorage();
    console.log('[Misc Rates] reloadSavedRates -> delegated to rate-store reloadFromStorage');
    setReloadMsg("Rates reloaded from storage");
    setTimeout(() => setReloadMsg(''), 2000);
  }

  // Live landed / total true cost calculation (pure cost only)
  const landedCost = React.useMemo(() => {
    const base = inputs.baseCost || 0;
    const delivery = inputs.deliveryCost || 0;
    return base + delivery;
  }, [inputs.baseCost, inputs.deliveryCost]);

  // Load selected into builder
  function loadIntoBuilder(item: MiscProfile) {
    setInputs({ ...item });
    setEditingId(item.id);
    setSelectedId(item.id);
    setActiveTab('builder');
    setJustSaved(false);
  }

  // Save current builder as new or update
  function saveCurrent() {
    if (!inputs.description.trim()) {
      alert("Description is required.");
      return;
    }
    const now = new Date().toISOString();
    const profile: Omit<MiscProfile, 'id'> & { id?: string } = {
      ...inputs,
      description: inputs.description.trim(),
      unitOfMeasure: inputs.unitOfMeasure || "Each",
      baseCost: Number(inputs.baseCost) || 0,
      deliveryCost: Number(inputs.deliveryCost) || 0,
      supplier: inputs.supplier?.trim() || undefined,
      notes: inputs.notes?.trim() || undefined,
    };

    if (editingId) {
      // update existing
      updateMiscRate(editingId, profile);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
      console.log('[Misc Rates] updated id=', editingId);
    } else {
      // save new
      const newId = saveMiscRate(profile);
      setEditingId(newId);
      setSelectedId(newId);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
      console.log('[Misc Rates] saved new id=', newId);
    }
    // refresh list from store
    // (store already updated and dispatched event)
  }

  function deleteSelected() {
    if (!selectedId) return;
    if (!confirm("Delete this saved miscellaneous rate?")) return;
    deleteMiscRate(selectedId);
    setSelectedId(null);
    if (editingId === selectedId) {
      setEditingId(null);
      setInputs({ ...BLANK_MISC });
    }
    console.log('[Misc Rates] deleted id=', selectedId);
  }

  function startNew() {
    setInputs({ ...BLANK_MISC });
    setEditingId(null);
    setSelectedId(null);
    setActiveTab('builder');
    setJustSaved(false);
  }

  function clearAll() {
    if (!confirm("Clear ALL saved miscellaneous rates? This cannot be undone.")) return;
    // delete one by one (or direct clear, but use store)
    const current = getMiscRates();
    current.forEach(r => deleteMiscRate(r.id));
    setSelectedId(null);
    setEditingId(null);
    setInputs({ ...BLANK_MISC });
    console.log('[Misc Rates] cleared all');
  }

  // When saved list updates via store, optionally auto-select or refresh UI
  // (the hook state is reactive)

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.02em] flex items-center gap-3">
              <Box className="h-8 w-8 text-primary" />
              Miscellaneous Rates
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">PILLAR 3</Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Builder for other/miscellaneous items with unit-based landed cost (base + delivery). Data is independent from Material Rates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reloadSavedRates} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Reload from Storage
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} className="gap-2 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Clear All Saved
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab('builder')}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-t border-b-2",
            activeTab === 'builder' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Builder
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-t border-b-2",
            activeTab === 'saved' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Saved Miscellaneous Rates ({savedMisc.length})
        </button>
      </div>

      {/* BUILDER TAB */}
      {activeTab === 'builder' && (
        <div className="space-y-6">
          {/* Live Calculator - FULL WIDTH form with 3-column grid */}
          <Card className="border border-border bg-card dark:border-white/10 dark:bg-[#1a1a1a]">
            <CardHeader>
              <CardTitle className="text-xl">Live Cost Calculator</CardTitle>
              <CardDescription>Enter details; landed cost updates instantly. Save to persist.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="description">Description / Name</Label>
                  <Input
                    id="description"
                    value={inputs.description}
                    onChange={(e) => setInputs({ ...inputs, description: e.target.value })}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm dark:border-white/20 dark:bg-black/30"
                  />
                </div>
                <div>
                  <Label htmlFor="uom">Unit of Measure</Label>
                  <select
                    id="uom"
                    value={inputs.unitOfMeasure}
                    onChange={(e) => setInputs({ ...inputs, unitOfMeasure: e.target.value })}
                    className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm dark:border-white/20 dark:bg-black/30"
                  >
                    <option value="" disabled>Select unit…</option>
                    {UOM_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="baseCost">Base Cost per Unit ($)</Label>
                  <CurrencyInput
                    id="baseCost"
                    value={inputs.baseCost}
                    onChange={(v) => setInputs({ ...inputs, baseCost: v })}
                    placeholder="0.00"
                    wrapperClassName="h-10 rounded-md border border-border bg-background dark:border-white/20 dark:bg-black/30"
                    className="pl-0 text-left"
                  />
                </div>
                <div>
                  <Label htmlFor="deliveryCost">Delivery / Freight per Unit ($)</Label>
                  <CurrencyInput
                    id="deliveryCost"
                    value={inputs.deliveryCost}
                    onChange={(v) => setInputs({ ...inputs, deliveryCost: v })}
                    placeholder="0.00"
                    wrapperClassName="h-10 rounded-md border border-border bg-background dark:border-white/20 dark:bg-black/30"
                    className="pl-0 text-left"
                  />
                </div>
                <div>
                  <Label htmlFor="supplier">Supplier (optional)</Label>
                  <Input
                    id="supplier"
                    value={inputs.supplier || ""}
                    onChange={(e) => setInputs({ ...inputs, supplier: e.target.value })}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm dark:border-white/20 dark:bg-black/30"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input
                    id="notes"
                    value={inputs.notes || ""}
                    onChange={(e) => setInputs({ ...inputs, notes: e.target.value })}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm dark:border-white/20 dark:bg-black/30"
                  />
                </div>
              </div>

              {/* Live Result - kept prominent */}
              <div className="mt-4 p-4 rounded border border-border bg-muted/50 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm text-muted-foreground">Landed Cost per Unit (true cost)</div>
                <div className="text-4xl font-semibold tabular-nums tracking-tighter mt-1">
                  ${landedCost.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">= Base + Delivery (per unit)</div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={saveCurrent} className="gap-2">
                  <Save className="h-4 w-4" /> {editingId ? "Update Saved Rate" : "Save New Rate"}
                </Button>
                <Button variant="outline" onClick={startNew} className="gap-2">
                  <Plus className="h-4 w-4" /> New / Clear
                </Button>
                {editingId && (
                  <Button variant="destructive" onClick={deleteSelected} className="gap-2">
                    <Trash2 className="h-4 w-4" /> Delete This Saved
                  </Button>
                )}
              </div>

              {justSaved && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400">Saved! (persisted to storage)</div>
              )}
              {reloadMsg && (
                <div className="text-xs text-amber-600 dark:text-amber-400">{reloadMsg}</div>
              )}
            </CardContent>
          </Card>

          {/* How to use - full-width strip at BOTTOM (moved from right column) */}
          <Card className="border border-border bg-card dark:border-white/10 dark:bg-[#1a1a1a]">
            <CardHeader>
              <CardTitle className="text-lg">How to use</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3 text-muted-foreground">
              <div>• Fill the fields above — landed cost recalculates live.</div>
              <div>• Click <strong>Save New Rate</strong> to persist to your saved list (or Update if editing).</div>
              <div>• Switch to the Saved tab to browse / load past profiles back into the calculator.</div>
              <div>• Rates are stored independently in your browser (separate from Material Rates).</div>
              <div className="pt-2 text-xs">Tip: Use for scaffolding, small tools, permits, or other per-unit costs not covered by Labor/Equip/Material.</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SAVED TAB */}
      {activeTab === 'saved' && (
        <Card className="border border-border bg-card dark:border-white/10 dark:bg-[#1a1a1a]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Saved Miscellaneous Rates</CardTitle>
                <CardDescription>Load any saved profile back into the builder for quick edits or reference.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={reloadSavedRates} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Reload from Storage
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {savedMisc.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No saved miscellaneous rates yet. Use the Builder tab to create and save your first one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Base Cost</TableHead>
                    <TableHead className="text-right">Delivery</TableHead>
                    <TableHead className="text-right">Landed / Unit</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedMisc.map((m) => {
                    const landed = (m.baseCost || 0) + (m.deliveryCost || 0);
                    const isSelected = selectedId === m.id;
                    return (
                      <TableRow key={m.id} className={cn("hover:bg-muted dark:hover:bg-white/5", isSelected && "bg-muted dark:bg-white/5")}>
                        <TableCell className="font-medium">{m.description}</TableCell>
                        <TableCell>{m.unitOfMeasure}</TableCell>
                        <TableCell className="text-right tabular-nums">${(m.baseCost || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">${(m.deliveryCost || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">${landed.toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.supplier || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => loadIntoBuilder(m)}
                              className="h-7 px-2 text-xs"
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" /> Load / Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                // quick duplicate from saved list (same as builder action would do)
                                const copy = { ...m, id: undefined as any, description: `${m.description} (Copy)` };
                                const newId = saveMiscRate(copy);
                                // reload list
                                reloadFromStorage();
                                // optionally load the copy
                                setTimeout(() => {
                                  const fresh = getMiscRates().find((x: any) => x.id === newId);
                                  if (fresh) loadIntoBuilder(fresh);
                                }, 0);
                              }}
                              className="h-7 w-7"
                              title="Duplicate this rate"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm(`Delete saved rate "${m.description}"?`)) {
                                  deleteMiscRate(m.id);
                                }
                              }}
                              className="h-7 w-7 text-red-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <div className="text-[11px] text-muted-foreground px-1">
        Miscellaneous rates are stored independently in your browser (localStorage key: pmz_misc_rates) and do not affect Material Rates.
      </div>
    </div>
  );
}
