/**
 * PMZ Pricing Assistant — per-line LEM detail resolver (read-only, presentation).
 *
 * Turns an EPP line's persisted costing entries (laborEntries / equipmentEntries /
 * materialEntries / miscellaneousEntries) into the same Labor / Equipment / Material / Misc
 * breakdown the Pricer shows under "Add Details" — for the customer/internal preview surfaces.
 *
 * Entries store almost no display data (material entries carry only rateId + quantity), so names,
 * UOM, and most rates are resolved LIVE from the rate catalogs by rateId. Where an entry DID
 * snapshot its rate (labor/equipment/misc), that stored value is preferred so a saved quote stays
 * stable even if the catalog changed; names/UOM always come from the catalog (best-effort).
 *
 * Crews: when a crew is added to a line the Pricer flattens it into labor/equipment entries tagged
 * with `.group = { id, crewId, name }`. Those grouped entries render under a "Crew: <name>"
 * subheader — exactly mirroring the Pricer. (No pmz_crews lookup needed: the grouped entries ARE
 * the expanded crew lines.)
 */

// Catalog surface this resolver needs — satisfied by useRateStore() on either page.
export interface LemRateCatalogs {
  laborRates: Array<{ id: string; role?: string }>;
  equipmentRates: Array<{ id: string; description?: string }>;
  materialRates: Array<{ id: string; description?: string; unitOfMeasure?: string }>;
  miscRates: Array<{ id: string; description?: string; unitOfMeasure?: string }>;
  getLaborCostPerHour: (id: string) => number;
  getEquipmentCostPerHour: (id: string) => number;
  getMaterialCostPerUnit: (id: string) => number;
  getMiscCostPerUnit: (id: string) => number;
}

export interface LemRow {
  // Structured columns for the aligned PDF table (Type/Name | Qty/Hours | Rate | Cost).
  name: string; // role / asset / material / misc item (for crew rows, prefixed with the kind)
  qty: string;  // "6 hrs" | "150 Ton" | "1"
  rate: string; // "$88.67/hr" | "$35.00/Ton" | "$350.00"
  cost: string; // "$532.02"
  // Pre-formatted single-line "name — qty @ rate = cost" — the on-screen surfaces render this as-is.
  text: string;
}
export interface LemSection {
  title: string;   // "Labor" | "Equipment" | "Material" | "Miscellaneous" | "Crew: <name>"
  isCrew: boolean; // crew sections render their title as a maroon subheader (print typography)
  rows: LemRow[];
}
export interface LineLemDetail {
  sections: LemSection[];
  hasAny: boolean;
}

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// --- Per-entry row builders (each returns a structured row + an on-screen `text` line) ---

// Assemble the on-screen single-line string from the structured parts (kept identical to the
// previous output so the on-screen surfaces are unchanged).
function makeRow(name: string, qty: string, rate: string, cost: string): LemRow {
  return { name, qty, rate, cost, text: `${name} — ${qty} @ ${rate} = ${cost}` };
}

function laborRow(entry: any, cats: LemRateCatalogs): LemRow {
  const name = cats.laborRates.find((r) => r.id === entry.rateId)?.role || entry.labor?.role || "Labor";
  const rate =
    entry.rate != null
      ? entry.rate
      : typeof entry.labor?.burdenedHourlyRate === "number"
      ? entry.labor.burdenedHourlyRate
      : cats.getLaborCostPerHour(entry.rateId || "");
  const hours = entry.hours || 0;
  return makeRow(name, `${num(hours)} hrs`, `$${money(rate)}/hr`, `$${money(rate * hours)}`);
}

function equipmentRow(entry: any, cats: LemRateCatalogs): LemRow {
  const name = cats.equipmentRates.find((r) => r.id === entry.rateId)?.description || "Equipment";
  const rate = entry.rate != null ? entry.rate : cats.getEquipmentCostPerHour(entry.rateId || "");
  const hours = entry.hours || 0;
  return makeRow(name, `${num(hours)} hrs`, `$${money(rate)}/hr`, `$${money(rate * hours)}`);
}

function materialRow(entry: any, cats: LemRateCatalogs): LemRow {
  const profile = cats.materialRates.find((r) => r.id === entry.rateId);
  const name = profile?.description || "Material";
  const uom = profile?.unitOfMeasure || "unit";
  const rate = entry.rate != null ? entry.rate : cats.getMaterialCostPerUnit(entry.rateId || "");
  const qty = entry.quantity || 0;
  return makeRow(name, `${num(qty)} ${uom}`, `$${money(rate)}/${uom}`, `$${money(rate * qty)}`);
}

function miscRow(entry: any, cats: LemRateCatalogs): LemRow {
  const profile = cats.miscRates.find((r) => r.id === entry.rateId);
  const name = entry.description || profile?.description || "Miscellaneous";
  const uom = profile?.unitOfMeasure || "";
  const rate = entry.rate != null ? entry.rate : cats.getMiscCostPerUnit(entry.rateId || "");
  const qty = entry.quantity || 0;
  return makeRow(name, uom ? `${num(qty)} ${uom}` : num(qty), `$${money(rate)}`, `$${money(rate * qty)}`);
}

// Re-tag a crew member row with its kind in the Type/Name column (and the on-screen text),
// preserving the exact previous on-screen string ("Labor — <base text>").
function crewRow(base: LemRow, kind: string): LemRow {
  return { ...base, name: `${kind} — ${base.name}`, text: `${kind} — ${base.text}` };
}

/**
 * Build the grouped LEM detail for one EPP line. Ungrouped entries fall under plain
 * Labor/Equipment/Material/Misc sections; entries tagged with `.group` fall under a
 * "Crew: <name>" section (labor + equipment rows). Empty sections are omitted.
 */
export function buildLineLemDetail(item: any, cats: LemRateCatalogs): LineLemDetail {
  const labor: any[] = item?.laborEntries || [];
  const equipment: any[] = item?.equipmentEntries || [];
  const material: any[] = item?.materialEntries || [];
  const misc: any[] = item?.miscellaneousEntries || [];

  const sections: LemSection[] = [];

  // Ungrouped (non-crew) entries first, in spec order.
  const laborRows = labor.filter((e) => !e?.group).map((e) => laborRow(e, cats));
  if (laborRows.length) sections.push({ title: "Labor", isCrew: false, rows: laborRows });

  const equipRows = equipment.filter((e) => !e?.group).map((e) => equipmentRow(e, cats));
  if (equipRows.length) sections.push({ title: "Equipment", isCrew: false, rows: equipRows });

  const matRows = material.map((e) => materialRow(e, cats));
  if (matRows.length) sections.push({ title: "Material", isCrew: false, rows: matRows });

  const miscRows = misc.map((e) => miscRow(e, cats));
  if (miscRows.length) sections.push({ title: "Miscellaneous", isCrew: false, rows: miscRows });

  // Crew groups: gather grouped labor + equipment entries by group id, preserving first-seen order.
  const groupOrder: string[] = [];
  const groupName: Record<string, string> = {};
  const groupLabor: Record<string, any[]> = {};
  const groupEquip: Record<string, any[]> = {};
  const note = (gid: string, name: string) => {
    if (!groupOrder.includes(gid)) {
      groupOrder.push(gid);
      groupName[gid] = name || "Crew";
      groupLabor[gid] = [];
      groupEquip[gid] = [];
    }
  };
  labor.filter((e) => e?.group).forEach((e) => {
    note(e.group.id, e.group.name);
    groupLabor[e.group.id].push(e);
  });
  equipment.filter((e) => e?.group).forEach((e) => {
    note(e.group.id, e.group.name);
    groupEquip[e.group.id].push(e);
  });
  groupOrder.forEach((gid) => {
    const rows: LemRow[] = [
      ...groupLabor[gid].map((e) => crewRow(laborRow(e, cats), "Labor")),
      ...groupEquip[gid].map((e) => crewRow(equipmentRow(e, cats), "Equipment")),
    ];
    if (rows.length) sections.push({ title: `Crew: ${groupName[gid]}`, isCrew: true, rows });
  });

  return { sections, hasAny: sections.length > 0 };
}

// One numeric work-order recipe line (planned quantity + unit cost), aggregated from a bid
// line's LEM entries. Distinct from LemRow (which is display-formatted strings) because the
// Job recipe / variance report needs real numbers. Misc entries are intentionally excluded —
// the Job recipe type is Labor / Equipment / Material only.
export interface RecipeLine {
  type: "labor" | "equipment" | "material";
  description: string;
  quantity: number;
  unitCost: number;
}

/**
 * Resolve one EPP line's labor/equipment/material entries into numeric recipe lines for the
 * work-order handoff. Same rate resolution as the display resolver (stored rate where present,
 * else the live catalog). Crew-grouped entries are flattened and prefixed with the crew name so
 * the recipe mirrors what the Pricer shows. Misc is omitted (no recipe type).
 */
export function buildLineRecipe(item: any, cats: LemRateCatalogs): RecipeLine[] {
  const lines: RecipeLine[] = [];
  const labor: any[] = item?.laborEntries || [];
  const equipment: any[] = item?.equipmentEntries || [];
  const material: any[] = item?.materialEntries || [];

  labor.forEach((e) => {
    const name = cats.laborRates.find((r) => r.id === e.rateId)?.role || e.labor?.role || "Labor";
    const rate =
      e.rate != null
        ? e.rate
        : typeof e.labor?.burdenedHourlyRate === "number"
        ? e.labor.burdenedHourlyRate
        : cats.getLaborCostPerHour(e.rateId || "");
    lines.push({
      type: "labor",
      description: e.group ? `${e.group.name} — ${name}` : name,
      quantity: e.hours || 0,
      unitCost: rate || 0,
    });
  });

  equipment.forEach((e) => {
    const name = cats.equipmentRates.find((r) => r.id === e.rateId)?.description || "Equipment";
    const rate = e.rate != null ? e.rate : cats.getEquipmentCostPerHour(e.rateId || "");
    lines.push({
      type: "equipment",
      description: e.group ? `${e.group.name} — ${name}` : name,
      quantity: e.hours || 0,
      unitCost: rate || 0,
    });
  });

  material.forEach((e) => {
    const name = cats.materialRates.find((r) => r.id === e.rateId)?.description || "Material";
    const rate = e.rate != null ? e.rate : cats.getMaterialCostPerUnit(e.rateId || "");
    lines.push({ type: "material", description: name, quantity: e.quantity || 0, unitCost: rate || 0 });
  });

  return lines;
}

// One incomplete LEM entry flagged by the Accepted gate — category, the entry's resolved name,
// and what's wrong (so the dialog can point the user at the exact thing to fix).
export interface LemGateEntryIssue {
  category: "Labor" | "Equipment" | "Material" | "Miscellaneous";
  name: string;  // role / asset / material / misc item — resolved from the catalogs
  issue: string; // "hours is 0" | "qty is 0" | "hours missing" | "qty missing"
}
export interface LemGateLineFailure {
  description: string;          // the bid line description
  noEntries: boolean;          // true when the line has no LEM entries at all
  issues: LemGateEntryIssue[]; // the specific incomplete entries (empty when noEntries)
}

/**
 * Per-line Accepted-gate detail: which LEM entries on a bid line are incomplete (zero or missing
 * quantity/hours), with names resolved from the SAME catalogs the display resolver uses. Returns
 * null when the line passes (has entries and every one carries a positive quantity/hours).
 */
export function buildLineGateFailures(
  item: any,
  cats: LemRateCatalogs,
  description: string
): LemGateLineFailure | null {
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
  const why = (v: unknown, word: "hours" | "qty") =>
    typeof v === "number" && v === 0 ? `${word} is 0` : `${word} missing`;

  const labor: any[] = item?.laborEntries || [];
  const equipment: any[] = item?.equipmentEntries || [];
  const material: any[] = item?.materialEntries || [];
  const misc: any[] = item?.miscellaneousEntries || [];
  const hasAnyEntry = labor.length + equipment.length + material.length + misc.length > 0;

  const issues: LemGateEntryIssue[] = [];
  labor.forEach((e) => {
    if (!ok(e.hours)) {
      const name = cats.laborRates.find((r) => r.id === e.rateId)?.role || e.labor?.role || "Labor";
      issues.push({ category: "Labor", name, issue: why(e.hours, "hours") });
    }
  });
  equipment.forEach((e) => {
    if (!ok(e.hours)) {
      const name = cats.equipmentRates.find((r) => r.id === e.rateId)?.description || "Equipment";
      issues.push({ category: "Equipment", name, issue: why(e.hours, "hours") });
    }
  });
  material.forEach((e) => {
    if (!ok(e.quantity)) {
      const name = cats.materialRates.find((r) => r.id === e.rateId)?.description || "Material";
      issues.push({ category: "Material", name, issue: why(e.quantity, "qty") });
    }
  });
  misc.forEach((e) => {
    if (!ok(e.quantity)) {
      const name = e.description || cats.miscRates.find((r) => r.id === e.rateId)?.description || "Miscellaneous";
      issues.push({ category: "Miscellaneous", name, issue: why(e.quantity, "qty") });
    }
  });

  if (!hasAnyEntry) return { description, noEntries: true, issues: [] };
  if (issues.length > 0) return { description, noEntries: false, issues };
  return null;
}
