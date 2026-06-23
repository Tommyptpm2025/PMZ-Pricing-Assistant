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
import { UOM_OPTIONS } from "@/lib/uom";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

// Supplier placeholder text. Browsers can autofill location-ish fields with this string; it must
// never be persisted as a real value, so we strip it on both load and save.
const SUPPLIER_PLACEHOLDER = "City near you";
function cleanSupplier(s?: string): string {
  const v = (s || "").trim();
  return v.toLowerCase() === SUPPLIER_PLACEHOLDER.toLowerCase() ? "" : v;
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

  // Editing flag — drives the EDITING banner and create-vs-update buttons (matches Equipment).
  const isEditing = !!editingId;

  // Load selected into builder
  function loadIntoBuilder(item: MiscProfile) {
    // Treat a stored "City near you" autofill artifact as an empty supplier.
    setInputs({ ...item, supplier: cleanSupplier(item.supplier) });
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
      supplier: cleanSupplier(inputs.supplier) || undefined,
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

  // Save the current form as a brand-new profile (always creates, even while editing) —
  // mirrors Equipment's addCurrentProfile, used by "Add New" / "Save Current Form as New Profile".
  function addCurrentAsNew() {
    if (!inputs.description.trim()) {
      alert("Description is required.");
      return;
    }
    const newId = saveMiscRate({
      ...inputs,
      description: inputs.description.trim(),
      unitOfMeasure: inputs.unitOfMeasure || "Each",
      baseCost: Number(inputs.baseCost) || 0,
      deliveryCost: Number(inputs.deliveryCost) || 0,
      supplier: cleanSupplier(inputs.supplier) || undefined,
      notes: inputs.notes?.trim() || undefined,
    });
    setEditingId(newId);
    setSelectedId(newId);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  }

  // Clone a profile as a new saved rate (matches Equipment's duplicateProfile).
  function duplicateProfile(item: MiscProfile) {
    saveMiscRate({ ...item, description: `${item.description} (Copy)` });
  }

  // Delete a profile from the left list and clear builder state if it was loaded.
  function deleteProfile(id: string) {
    deleteMiscRate(id);
    if (editingId === id) {
      setEditingId(null);
      setInputs({ ...BLANK_MISC });
    }
    if (selectedId === id) setSelectedId(null);
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
            <RotateCcw className="h-4 w-4" /> Reload Saved Rates
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
          {/* Miscellaneous Manager — left-panel Saved Profiles list + name + actions (mirrors Equipment Manager) */}
          <Card className="card">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Miscellaneous Manager</CardTitle>
                  <CardDescription className="mt-0.5">
                    Manage multiple items. Click a profile on the left to load it instantly into the calculator below.
                  </CardDescription>
                </div>
                <Button onClick={startNew} size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Add New Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: clean list of saved items (names only) */}
                <div className="lg:col-span-4 xl:col-span-3">
                  <div className="text-xs font-semibold tracking-wider text-muted-foreground mb-2 px-1">SAVED PROFILES</div>
                  {savedMisc.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-surface-2 p-4 text-xs text-muted-foreground">
                      No profiles saved yet.<br />Use &ldquo;Add New Item&rdquo; or customize the form below then save.
                    </div>
                  ) : (
                    <div className="max-h-[168px] overflow-y-auto space-y-1 pr-1">
                      {savedMisc.map((m) => {
                        const isActive = selectedId === m.id;
                        return (
                          <div
                            key={m.id}
                            onClick={() => loadIntoBuilder(m)}
                            className={cn(
                              "group flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm cursor-pointer border transition-colors",
                              isActive
                                ? "border-primary/40 bg-primary/5 font-medium"
                                : "border-transparent hover:bg-muted hover:border-border"
                            )}
                          >
                            <span className="truncate">{m.description || "Untitled item"}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-60 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteProfile(m.id);
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

                {/* Right: editable Item name for the current working profile + actions */}
                <div className="lg:col-span-8 xl:col-span-9 space-y-3">
                  <div>
                    <Label htmlFor="mgrDescription" className="text-sm font-medium">Item Name / Description</Label>
                    <Input
                      id="mgrDescription"
                      value={inputs.description}
                      onChange={(e) => setInputs({ ...inputs, description: e.target.value })}
                      className="mt-1.5 text-base font-semibold placeholder:font-normal"
                      placeholder="e.g. Scaffolding rental - weekly"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Rename the current profile here. All fields below update live.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <Button onClick={saveCurrent} size="sm">
                        Save Changes to This Profile
                      </Button>
                    ) : (
                      <Button onClick={addCurrentAsNew} size="sm" variant="default">
                        Save Current Form as New Profile
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        if (editingId) {
                          const current = savedMisc.find((m) => m.id === editingId);
                          if (current) duplicateProfile(current);
                        } else {
                          addCurrentAsNew();
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

          {/* Prominent Save Changes banner — appears when editing a saved rate (matches Equipment/Labor) */}
          {isEditing && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-primary text-white border-0">EDITING</Badge>
                  <span className="font-semibold text-lg truncate">
                    {inputs.description || "Selected Item"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Changes below are live. Click <span className="font-medium">Save Changes</span> to update the selected saved rate.
                </p>
              </div>
              <Button
                onClick={saveCurrent}
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
              ✓ Saved successfully! The selected miscellaneous rate has been saved.
            </div>
          )}

          {/* Main grid — inputs (left) + sticky LIVE RESULTS (right) */}
          <div className="grid gap-6 xl:grid-cols-12">
            {/* LEFT COLUMN — INPUTS */}
            <div className="xl:col-span-7 space-y-6">
              <Card className="card">
                <CardHeader>
                  <CardTitle className="text-lg">Cost Inputs</CardTitle>
                  <CardDescription>Enter details; landed cost updates instantly on the right. Save to persist.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="uom">Unit of Measure</Label>
                      <select
                        id="uom"
                        value={inputs.unitOfMeasure}
                        onChange={(e) => setInputs({ ...inputs, unitOfMeasure: e.target.value })}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm mt-1.5"
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
                        wrapperClassName="h-10 mt-1.5"
                        className="font-semibold placeholder:font-normal"
                      />
                    </div>
                    <div>
                      <Label htmlFor="deliveryCost">Delivery / Freight per Unit ($)</Label>
                      <CurrencyInput
                        id="deliveryCost"
                        value={inputs.deliveryCost}
                        onChange={(v) => setInputs({ ...inputs, deliveryCost: v })}
                        placeholder="0.00"
                        wrapperClassName="h-10 mt-1.5"
                        className="font-semibold placeholder:font-normal"
                      />
                    </div>
                    <div>
                      <Label htmlFor="supplier">Supplier (optional)</Label>
                      <Input
                        id="supplier"
                        name="misc-supplier"
                        autoComplete="off"
                        value={inputs.supplier || ""}
                        onChange={(e) => setInputs({ ...inputs, supplier: e.target.value })}
                        onBlur={() => setInputs((prev) => ({ ...prev, supplier: cleanSupplier(prev.supplier) }))}
                        placeholder={SUPPLIER_PLACEHOLDER}
                        className="mt-1.5 h-10"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Input
                        id="notes"
                        value={inputs.notes || ""}
                        onChange={(e) => setInputs({ ...inputs, notes: e.target.value })}
                        placeholder="e.g. Includes setup and takedown"
                        className="mt-1.5 h-10"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* How to use */}
              <Card className="card">
                <CardHeader>
                  <CardTitle className="text-lg">How to use</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3 text-muted-foreground">
                  <div>• Fill the fields — landed cost recalculates live on the right.</div>
                  <div>• Click a saved profile on the left to load it; the <strong>EDITING</strong> banner appears.</div>
                  <div>• Use <strong>Save Changes to This Profile</strong> to update in place, or <strong>Duplicate Current</strong> to branch a copy.</div>
                  <div>• Rates are stored independently in your browser (separate from Material Rates).</div>
                  <div className="pt-2 text-xs">Tip: Use for scaffolding, small tools, permits, or other per-unit costs not covered by Labor/Equip/Material.</div>
                </CardContent>
              </Card>
            </div>

            {/* RIGHT COLUMN — LIVE RESULTS (sticky) */}
            <div className="xl:col-span-5">
              <Card className="card border-primary/30 sticky top-20 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm tracking-[0.5px] text-muted-foreground">LIVE RESULTS</CardTitle>
                  <div className="text-xl font-semibold tracking-tight mt-0.5">{inputs.description || "New Item"}</div>
                  {isEditing && <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/30 w-fit">Editing</Badge>}
                </CardHeader>
                <CardContent className="space-y-6 pt-2">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">LANDED COST PER UNIT</div>
                    <div className="text-6xl font-semibold tabular-nums tracking-[-0.04em] text-foreground">
                      ${landedCost.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      = Base + Delivery {inputs.unitOfMeasure ? `(per ${inputs.unitOfMeasure})` : "(per unit)"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border bg-surface-2 p-3">
                      <div className="text-xs text-muted-foreground">Base Cost</div>
                      <div className="font-semibold tabular-nums">${(inputs.baseCost || 0).toFixed(2)}</div>
                    </div>
                    <div className="rounded-md border bg-surface-2 p-3">
                      <div className="text-xs text-muted-foreground">Delivery / Freight</div>
                      <div className="font-semibold tabular-nums">${(inputs.deliveryCost || 0).toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {isEditing ? (
                      <Button onClick={saveCurrent} size="lg" className="flex-1 text-base">
                        <Edit2 className="mr-2 h-4 w-4" /> Update Saved Rate
                      </Button>
                    ) : (
                      <Button onClick={addCurrentAsNew} size="lg" className="flex-1 text-base">
                        <Plus className="mr-2 h-4 w-4" /> Add to My Rates
                      </Button>
                    )}
                    <Button onClick={startNew} size="lg" variant="outline">
                      Start New
                    </Button>
                    {isEditing && (
                      <Button onClick={deleteSelected} size="lg" variant="destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
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
            </div>
          </div>
        </div>
      )}

      {/* SAVED TAB */}
      {activeTab === 'saved' && (
        <Card className="border border-border bg-card dark:border-white/10 dark:bg-[#1a1a1a]">
          <CardHeader>
            <div>
              <CardTitle className="text-xl">Saved Miscellaneous Rates</CardTitle>
              <CardDescription>Load any saved profile back into the builder for quick edits or reference.</CardDescription>
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
                      <TableRow
                        key={m.id}
                        onClick={() => loadIntoBuilder(m)}
                        className={cn(
                          "transition-colors cursor-pointer hover:bg-muted dark:hover:bg-white/5",
                          isSelected && "bg-primary/10 border-l-4 border-primary font-medium"
                        )}
                      >
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
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); loadIntoBuilder(m); }}
                              className="h-7 w-7"
                              title="Load"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
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
                              onClick={(e) => {
                                e.stopPropagation();
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
