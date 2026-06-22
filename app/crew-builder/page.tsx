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
import { Plus, Edit2, Copy, Trash2, Save, RotateCcw, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRateStore } from "@/lib/rate-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

interface CrewLine {
  profileId: string;
  quantity: number;
}

interface Crew {
  id: string;
  name: string;
  laborLines: CrewLine[];
  equipmentLines: CrewLine[];
}

export default function CrewBuilder() {
  const {
    laborRates,
    equipmentRates,
    getLaborCostPerHour,
    getEquipmentCostPerHour,
    reloadFromStorage,
  } = useRateStore();

  const [crews, setCrews] = React.useState<Crew[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);

  const [currentCrew, setCurrentCrew] = React.useState<Partial<Crew>>({
    name: "",
    laborLines: [],
    equipmentLines: [],
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [reloadMsg, setReloadMsg] = React.useState("");

  // Pending adders for labor/equipment lines
  const [pendingLaborId, setPendingLaborId] = React.useState<string>("");
  const [pendingLaborQty, setPendingLaborQty] = React.useState<number>(1);
  const [pendingEquipId, setPendingEquipId] = React.useState<string>("");
  const [pendingEquipQty, setPendingEquipQty] = React.useState<number>(1);

  // Hydration-safe load after mount (no LS read in initial render)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("pmz_crews");
      if (raw) {
        const parsed = JSON.parse(raw);
        setCrews(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
      console.error("[crew-builder] Error loading crews from storage", e);
    }
    setIsLoaded(true);
  }, []);

  // Persist after loaded (client only)
  React.useEffect(() => {
    if (!isLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("pmz_crews", JSON.stringify(crews));
    } catch (e) {
      console.error("[crew-builder] Error saving crews", e);
    }
  }, [crews, isLoaded]);

  // Cross-tab sync via storage event
  React.useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "pmz_crews") {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          setCrews(Array.isArray(parsed) ? parsed : []);
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Live cumulative hourly rate (labor burdened + equip hourly, qty * rate, NO hours here)
  const laborTotal = React.useMemo(() => {
    return (currentCrew.laborLines || []).reduce((sum, line) => {
      const rate = getLaborCostPerHour(line.profileId);
      return sum + rate * (line.quantity || 0);
    }, 0);
  }, [currentCrew.laborLines, getLaborCostPerHour]);

  const equipmentTotal = React.useMemo(() => {
    return (currentCrew.equipmentLines || []).reduce((sum, line) => {
      const rate = getEquipmentCostPerHour(line.profileId);
      return sum + rate * (line.quantity || 0);
    }, 0);
  }, [currentCrew.equipmentLines, getEquipmentCostPerHour]);

  const cumulativeRate = Math.round((laborTotal + equipmentTotal) * 100) / 100;

  function updateCurrentName(name: string) {
    setCurrentCrew((prev) => ({ ...prev, name }));
    setJustSaved(false);
  }

  function addLaborLine() {
    if (!pendingLaborId) return;
    const qty = Math.max(1, pendingLaborQty || 1);
    setCurrentCrew((prev) => ({
      ...prev,
      laborLines: [...(prev.laborLines || []), { profileId: pendingLaborId, quantity: qty }],
    }));
    setPendingLaborId("");
    setPendingLaborQty(1);
    setJustSaved(false);
  }

  function addEquipmentLine() {
    if (!pendingEquipId) return;
    const qty = Math.max(1, pendingEquipQty || 1);
    setCurrentCrew((prev) => ({
      ...prev,
      equipmentLines: [...(prev.equipmentLines || []), { profileId: pendingEquipId, quantity: qty }],
    }));
    setPendingEquipId("");
    setPendingEquipQty(1);
    setJustSaved(false);
  }

  function updateLaborQty(index: number, qty: number) {
    const safeQty = Math.max(0, qty);
    setCurrentCrew((prev) => {
      const lines = [...(prev.laborLines || [])];
      if (lines[index]) lines[index] = { ...lines[index], quantity: safeQty };
      return { ...prev, laborLines: lines };
    });
    setJustSaved(false);
  }

  function updateEquipmentQty(index: number, qty: number) {
    const safeQty = Math.max(0, qty);
    setCurrentCrew((prev) => {
      const lines = [...(prev.equipmentLines || [])];
      if (lines[index]) lines[index] = { ...lines[index], quantity: safeQty };
      return { ...prev, equipmentLines: lines };
    });
    setJustSaved(false);
  }

  function removeLaborLine(index: number) {
    setCurrentCrew((prev) => ({
      ...prev,
      laborLines: (prev.laborLines || []).filter((_, i) => i !== index),
    }));
    setJustSaved(false);
  }

  function removeEquipmentLine(index: number) {
    setCurrentCrew((prev) => ({
      ...prev,
      equipmentLines: (prev.equipmentLines || []).filter((_, i) => i !== index),
    }));
    setJustSaved(false);
  }

  function saveCrew() {
    const name = (currentCrew.name || "").trim();
    if (!name) return;

    const crewToSave: Crew = {
      id: editingId || createId(),
      name,
      laborLines: currentCrew.laborLines || [],
      equipmentLines: currentCrew.equipmentLines || [],
    };

    setCrews((prev) => {
      const exists = prev.some((c) => c.id === crewToSave.id);
      if (exists) {
        return prev.map((c) => (c.id === crewToSave.id ? crewToSave : c));
      }
      return [...prev, crewToSave];
    });

    setJustSaved(true);
    setEditingId(crewToSave.id);
    setTimeout(() => setJustSaved(false), 1600);
  }

  function loadCrewForEdit(crew: Crew) {
    setCurrentCrew({
      name: crew.name,
      laborLines: [...crew.laborLines],
      equipmentLines: [...crew.equipmentLines],
    });
    setEditingId(crew.id);
    setJustSaved(false);
    setPendingLaborId("");
    setPendingLaborQty(1);
    setPendingEquipId("");
    setPendingEquipQty(1);
  }

  function duplicateCrew(crew: Crew) {
    setCurrentCrew({
      name: `${crew.name} (Copy)`,
      laborLines: [...crew.laborLines],
      equipmentLines: [...crew.equipmentLines],
    });
    setEditingId(null);
    setJustSaved(false);
    setPendingLaborId("");
    setPendingLaborQty(1);
    setPendingEquipId("");
    setPendingEquipQty(1);
  }

  function deleteCrew(id: string) {
    setCrews((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) {
      clearCurrent();
    }
  }

  function clearCurrent() {
    setCurrentCrew({ name: "", laborLines: [], equipmentLines: [] });
    setEditingId(null);
    setJustSaved(false);
    setPendingLaborId("");
    setPendingLaborQty(1);
    setPendingEquipId("");
    setPendingEquipQty(1);
  }

  function reloadProfiles() {
    reloadFromStorage();
    setReloadMsg("Profiles reloaded");
    setTimeout(() => setReloadMsg(""), 1800);
  }

  const laborProfiles = laborRates || [];
  const equipProfiles = equipmentRates || [];

  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Crew Builder</h1>
              <p className="mt-1 text-muted-foreground max-w-2xl">
                Build reusable Labor + Equipment crews from your saved rate profiles. Cumulative hourly rate only — apply hours later in Project Pricer.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-nowrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={clearCurrent} className="whitespace-nowrap shrink-0">
            <RotateCcw className="mr-2 h-4 w-4" /> Start New
          </Button>
          <Button variant="outline" size="sm" onClick={reloadProfiles} className="whitespace-nowrap shrink-0">
            <RotateCcw className="mr-2 h-4 w-4" /> Reload Profiles
          </Button>
        </div>
      </div>

      {reloadMsg && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400">{reloadMsg}</div>
      )}

      {/* Editor Card */}
      <Card className="card">
        <CardHeader>
          <CardTitle>Current Crew</CardTitle>
          <CardDescription>
            Name your crew and add lines from saved Labor / Equipment profiles (no material). Qty × profile rate gives the crew&apos;s hourly contribution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-xs font-medium tracking-wider text-muted-foreground">CREW NAME</Label>
            <Input
              value={currentCrew.name || ""}
              onChange={(e) => updateCurrentName(e.target.value)}
              placeholder="e.g. Paving Crew A"
              className="mt-1.5 text-lg font-medium"
              disabled={!isLoaded}
            />
          </div>

          {/* Labor Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-lg font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Labor
              </div>
              <Badge variant="outline" className="text-[10px]">{(currentCrew.laborLines || []).length} lines</Badge>
            </div>

            {/* Add labor */}
            <div className="flex flex-wrap gap-2 items-end mb-3">
              <div className="min-w-[220px] flex-1">
                <Label className="text-xs">Profile</Label>
                <Select value={pendingLaborId} onValueChange={setPendingLaborId} disabled={!isLoaded || laborProfiles.length === 0}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder={laborProfiles.length ? "Select labor rate profile" : "No labor profiles saved"} />
                  </SelectTrigger>
                  <SelectContent>
                    {laborProfiles.length > 0 ? (
                      laborProfiles.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.role || "Labor Profile"}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No saved labor profiles — add in Labor Rates</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Qty</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={pendingLaborQty}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, '');
                    const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
                    setPendingLaborQty(num);
                  }}
                  className="w-24 h-9 mt-1"
                  disabled={!isLoaded}
                />
              </div>
              <Button onClick={addLaborLine} disabled={!pendingLaborId || !isLoaded} size="sm" className="w-40">
                <Plus className="mr-1.5 h-4 w-4" /> Add Labor
              </Button>
            </div>

            {/* Current labor lines */}
            {(currentCrew.laborLines || []).length > 0 ? (
              <div className="rounded border bg-muted/10 divide-y text-sm">
                {(currentCrew.laborLines || []).map((line, idx) => {
                  const profile = laborProfiles.find((p: any) => p.id === line.profileId);
                  const rate = getLaborCostPerHour(line.profileId);
                  const lineTotal = rate * (line.quantity || 0);
                  return (
                    <div key={idx} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 truncate">{profile?.role || "Unknown labor"}</div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[^0-9]/g, '');
                            const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
                            updateLaborQty(idx, num);
                          }}
                          className="w-20 h-7 text-right"
                          disabled={!isLoaded}
                        />
                        <span className="text-muted-foreground w-8">hrs</span>
                      </div>
                      <div className="w-20 text-right tabular-nums text-muted-foreground">${rate.toFixed(2)}/hr</div>
                      <div className="w-24 text-right font-medium tabular-nums">${lineTotal.toFixed(2)}</div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive"
                        onClick={() => removeLaborLine(idx)}
                        disabled={!isLoaded}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No labor lines yet. Add from saved profiles above.</div>
            )}
          </div>

          {/* Equipment Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-lg font-medium flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Equipment
              </div>
              <Badge variant="outline" className="text-[10px]">{(currentCrew.equipmentLines || []).length} lines</Badge>
            </div>

            {/* Add equipment */}
            <div className="flex flex-wrap gap-2 items-end mb-3">
              <div className="min-w-[220px] flex-1">
                <Label className="text-xs">Profile</Label>
                <Select value={pendingEquipId} onValueChange={setPendingEquipId} disabled={!isLoaded || equipProfiles.length === 0}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder={equipProfiles.length ? "Select equipment rate profile" : "No equipment profiles saved"} />
                  </SelectTrigger>
                  <SelectContent>
                    {equipProfiles.length > 0 ? (
                      equipProfiles.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.description || "Equipment Profile"}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No saved equipment profiles — add in Equipment Rates</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Qty</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={pendingEquipQty}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, '');
                    const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
                    setPendingEquipQty(num);
                  }}
                  className="w-24 h-9 mt-1"
                  disabled={!isLoaded}
                />
              </div>
              <Button onClick={addEquipmentLine} disabled={!pendingEquipId || !isLoaded} size="sm" className="w-40">
                <Plus className="mr-1.5 h-4 w-4" /> Add Equipment
              </Button>
            </div>

            {/* Current equipment lines */}
            {(currentCrew.equipmentLines || []).length > 0 ? (
              <div className="rounded border bg-muted/10 divide-y text-sm">
                {(currentCrew.equipmentLines || []).map((line, idx) => {
                  const profile = equipProfiles.find((p: any) => p.id === line.profileId);
                  const rate = getEquipmentCostPerHour(line.profileId);
                  const lineTotal = rate * (line.quantity || 0);
                  return (
                    <div key={idx} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 truncate">{profile?.description || "Unknown equipment"}</div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[^0-9]/g, '');
                            const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
                            updateEquipmentQty(idx, num);
                          }}
                          className="w-20 h-7 text-right"
                          disabled={!isLoaded}
                        />
                        <span className="text-muted-foreground w-8">hrs</span>
                      </div>
                      <div className="w-20 text-right tabular-nums text-muted-foreground">${rate.toFixed(2)}/hr</div>
                      <div className="w-24 text-right font-medium tabular-nums">${lineTotal.toFixed(2)}</div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive"
                        onClick={() => removeEquipmentLine(idx)}
                        disabled={!isLoaded}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No equipment lines yet. Add from saved profiles above.</div>
            )}
          </div>

          {/* Cumulative */}
          <div className="border-t pt-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm font-medium tracking-wider text-muted-foreground">CREW CUMULATIVE HOURLY RATE</div>
                <div className="text-[11px] text-muted-foreground">Labor burdened + Equipment hourly × quantities (hours applied later in pricer)</div>
              </div>
              <div className="text-4xl font-semibold tabular-nums tracking-tighter">
                ${cumulativeRate.toFixed(2)}
                <span className="text-base font-normal text-muted-foreground"> /hr</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button onClick={saveCrew} disabled={!currentCrew.name?.trim() || !isLoaded}>
              <Save className="mr-2 h-4 w-4" />
              {editingId ? "Update Crew" : "Save New Crew"}
            </Button>
            <Button variant="outline" onClick={clearCurrent} disabled={!isLoaded}>
              Clear
            </Button>
            {justSaved && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-2">Saved!</span>
            )}
          </div>

          {laborProfiles.length === 0 && equipProfiles.length === 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-400">
              No profiles loaded yet. Add Labor Rates and Equipment Rates under Resources first.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saved Crews */}
      <Card className="card">
        <CardHeader>
          <CardTitle>Saved Crews</CardTitle>
          <CardDescription>
            {isLoaded ? `${crews.length} crew${crews.length === 1 ? "" : "s"} saved` : "Loading…"} — reuse these in Project Pricer later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isLoaded ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading saved crews…</div>
          ) : crews.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No crews saved yet. Build one above and click Save New Crew.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-16 text-right">Labor</TableHead>
                  <TableHead className="w-16 text-right">Equip</TableHead>
                  <TableHead className="w-28 text-right">Cum. $/hr</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crews.map((crew) => {
                  const cLabor = (crew.laborLines || []).reduce((s, l) => s + getLaborCostPerHour(l.profileId) * (l.quantity || 0), 0);
                  const cEquip = (crew.equipmentLines || []).reduce((s, l) => s + getEquipmentCostPerHour(l.profileId) * (l.quantity || 0), 0);
                  const cRate = Math.round((cLabor + cEquip) * 100) / 100;
                  return (
                    <TableRow key={crew.id}>
                      <TableCell className="font-medium">{crew.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{(crew.laborLines || []).length}</TableCell>
                      <TableCell className="text-right tabular-nums">{(crew.equipmentLines || []).length}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">${cRate.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => loadCrewForEdit(crew)} disabled={!isLoaded}>
                            <Edit2 className="h-3.5 w-3.5 mr-1" /> Load
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => duplicateCrew(crew)} disabled={!isLoaded}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive/70 hover:text-destructive"
                            onClick={() => deleteCrew(crew.id)}
                            disabled={!isLoaded}
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

      <div className="text-[11px] text-muted-foreground">
        Crews contain Labor + Equipment only. The cumulative rate is the fully-burdened hourly cost of the whole crew. Apply actual hours per line item in the Project Pricer.
      </div>
    </div>
  );
}
