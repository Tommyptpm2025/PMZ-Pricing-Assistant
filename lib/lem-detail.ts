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
