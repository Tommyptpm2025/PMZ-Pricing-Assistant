import { useState, useEffect, useCallback } from 'react';

/**
 * WORK TYPES — a thin, read-only reference reader over the Work Types store (pmz_work_types_v2, owned by
 * app/work-types/page.tsx). Returns just the identity every OTHER surface needs: { id, name }. The id is
 * the SAME id a saved quote carries as workTypeId (app/project-pricer sets workTypeId = the selected
 * work type's id), so goals and the scorecard join to quotes by id — never by a hand-typed name string
 * (SALES-TRACKER-SPEC.md "Fences").
 *
 * This is a reference read, not a second home for work types — it never writes. Work types are born and
 * edited on the Work Types page; this just surfaces their id + name where goals entry and the scorecard
 * need columns. SSR-safe, safe JSON.
 */

export interface WorkTypeRef {
  id: string;
  name: string;
}

export const WORK_TYPES_KEY = 'pmz_work_types_v2';

// One-time work-type-attribution backfill flag + provenance record (see WORK-TYPE ATTRIBUTION
// BACKFILL). Its mere presence — any value — means the backfill has run and must NEVER run again.
export const WORKTYPE_BACKFILL_KEY = 'pmz_worktype_backfill_v1';

/**
 * Human label for a work-type id — NEVER a raw id shown to a person. Resolution order:
 *   1. the current store name (a live work type) — shown plainly;
 *   2. else the name-string history carried on the records themselves (e.g. a saved quote's
 *      denormalized workType), marked "(retired)" so it reads as a work type that no longer exists;
 *   3. else "(unknown work type)".
 * An empty id — a record with no work type at all — reads as "Unassigned".
 *
 * The two sources are passed as accessors so any surface supplies its own live store + history without
 * this helper knowing their shape. Pure and side-effect-free.
 */
export function resolveWorkTypeLabel(
  id: string,
  liveName: (id: string) => string | undefined,
  historyName: (id: string) => string | undefined
): string {
  if (id === '') return 'Unassigned';
  const live = liveName(id);
  if (live && live.trim() !== '') return live;
  const hist = historyName(id);
  if (hist && hist.trim() !== '') return `${hist} (retired)`;
  return '(unknown work type)';
}

export function loadWorkTypes(): WorkTypeRef[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WORK_TYPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.workTypes) ? parsed.workTypes : [];
    return list
      .map((w: any) => ({ id: typeof w?.id === 'string' ? w.id : '', name: typeof w?.name === 'string' ? w.name : '' }))
      .filter((w: WorkTypeRef) => w.id !== '' && w.name !== '');
  } catch {
    return [];
  }
}

// ── WORK-TYPE ATTRIBUTION BACKFILL (pure core) ─────────────────────────────────────────────────────
//
// CLAIM THE HISTORY, work-type edition. Older saved quotes point at a workTypeId that no longer exists
// in the current work-types store (a work type was rebuilt / re-seeded and its id changed) while still
// carrying the work-type NAME string. This one-time backfill re-points such an ORPHAN id at the current
// work type of the same name — preserving the old id as `workTypeIdLegacy` for provenance.
//
// Mirrors the salesperson attribution backfill in lib/people.ts. The laws it holds:
//   • MONEY IS UNTOUCHABLE. Only the work-type attribution (workTypeId + the added workTypeIdLegacy) is
//     ever written. Amount, GP, status, dates, the name string — all pass through byte-identical.
//   • A record already pointing at a LIVE work type is NEVER rewritten.
//   • Rewrite ONLY on an exact, UNAMBIGUOUS name match: the trimmed, case-insensitive name resolves to
//     EXACTLY ONE current work type. Two live types share the name → ambiguous, skipped. No live type
//     carries it → skipped. A record with no orphan id (empty, i.e. Unassigned) or no name → left alone.
//     A skip never guesses.

// A record the backfill can re-point. It reads ONLY the work-type fields; everything else is opaque and
// carried through untouched. Name lives on `workType` (quote-storage) with `workTypeName` as an alias.
export interface WorkTypeAttributableRecord {
  workTypeId?: string;
  workType?: string;
  workTypeName?: string;
  workTypeIdLegacy?: string;
}

export interface WorkTypeAttributionCounts {
  matched: number;
  ambiguousSkipped: number;
  noMatchSkipped: number;
}

const normalizeName = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

// normalized name → the ids of every CURRENT work type with that name. length > 1 ⇒ ambiguous.
function liveNameIndex(live: WorkTypeRef[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const wt of live || []) {
    const key = normalizeName(wt.name);
    if (!key || !wt.id) continue;
    const ids = idx.get(key);
    if (ids) ids.push(wt.id);
    else idx.set(key, [wt.id]);
  }
  return idx;
}

// Re-point each ORPHAN, name-carrying record onto the current work type of the same name. Returns a NEW
// array; a changed record is a shallow copy with workTypeId rewritten + workTypeIdLegacy added (all
// other fields identical), and an unchanged record is returned by the SAME reference. Never mutates.
export function backfillWorkTypeIds<T extends WorkTypeAttributableRecord>(
  records: T[],
  live: WorkTypeRef[]
): { records: T[]; counts: WorkTypeAttributionCounts } {
  const liveIds = new Set((live || []).map((w) => w.id).filter(Boolean));
  const idx = liveNameIndex(live);
  let matched = 0;
  let ambiguousSkipped = 0;
  let noMatchSkipped = 0;
  const out = (records || []).map((rec) => {
    const oldId = (rec.workTypeId ?? '').trim();
    // GUARD: a record already pointing at a LIVE work type is NEVER rewritten. (Mutation target —
    // remove this and valid work-type ids get clobbered, which the fence forbids.)
    if (oldId !== '' && liveIds.has(oldId)) return rec;
    if (oldId === '') return rec; // no orphan id to re-point (Unassigned — a separate question)
    const name = (rec.workType ?? rec.workTypeName ?? '').trim();
    if (name === '') return rec; // orphan id but no name string → cannot match, leave alone
    const ids = idx.get(normalizeName(name)) ?? [];
    if (ids.length === 1) {
      matched++;
      return { ...rec, workTypeId: ids[0], workTypeIdLegacy: oldId }; // old id kept for provenance
    }
    if (ids.length > 1) {
      ambiguousSkipped++; // two live work types share the name — never guess which
      return rec;
    }
    noMatchSkipped++; // a real name, but no current work type carries it
    return rec;
  });
  return { records: out, counts: { matched, ambiguousSkipped, noMatchSkipped } };
}

export interface WorkTypeBackfillPlan {
  quotes: WorkTypeAttributableRecord[];
  counts: WorkTypeAttributionCounts;
}

// Decide the backfill purely: if the flag key already holds ANY value, NEVER run again (return null).
// Only on a truly absent flag (null) do we produce the re-pointed records + inspectable counts. (Only
// saved quotes carry a workTypeId; jobs store a workTypeName with no id, so they are out of scope.)
export function planWorkTypeBackfill(
  existingFlagRaw: string | null,
  quotes: WorkTypeAttributableRecord[],
  live: WorkTypeRef[]
): WorkTypeBackfillPlan | null {
  if (existingFlagRaw !== null) return null; // flag present (even '') → already ran, never twice
  const q = backfillWorkTypeIds(quotes, live);
  return { quotes: q.records, counts: q.counts };
}

// ── STORAGE BINDING ────────────────────────────────────────────────────────────────────────────────

const SAVED_QUOTES_KEY = 'pmz_saved_quotes';

function readRecordArray(key: string): WorkTypeAttributableRecord[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Run the work-type backfill ONCE, guarded by WORKTYPE_BACKFILL_KEY. DEFERS while the work-types store
// is empty (running then would burn the one-shot flag with zero matches and orphan every quote forever)
// — it runs on the first load that actually has current work types to match against. Idempotent even if
// the flag write fails: a re-pointed record now has a LIVE id, so the guard skips it on any re-run.
// MONEY UNTOUCHED: only the work-type attribution is ever written back.
export function runWorkTypeBackfillIfNeeded(live: WorkTypeRef[]): void {
  if (typeof localStorage === 'undefined') return;
  if (!live || live.length === 0) return; // defer until the current work-types store exists
  let flag: string | null;
  try {
    flag = localStorage.getItem(WORKTYPE_BACKFILL_KEY);
  } catch {
    return;
  }
  const quotes = readRecordArray(SAVED_QUOTES_KEY);
  const plan = planWorkTypeBackfill(flag, quotes, live);
  if (plan === null) return; // flag present → already ran
  try {
    if (plan.counts.matched > 0) localStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify(plan.quotes));
  } catch {
    // storage error — leave the store; the live-id guard keeps a later re-run safe
  }
  try {
    localStorage.setItem(
      WORKTYPE_BACKFILL_KEY,
      JSON.stringify({
        ranAt: new Date().toISOString(),
        matched: plan.counts.matched,
        ambiguousSkipped: plan.counts.ambiguousSkipped,
        noMatchSkipped: plan.counts.noMatchSkipped,
      })
    );
  } catch {
    // couldn't record the flag — the backfill still ran; the guard makes a re-run harmless
  }
}

/**
 * Live-synced work-types reference hook. Reads on mount and re-reads on cross-tab 'storage' events for
 * the work-types key, so editing work types on that page reflects on an open goals-entry / scorecard
 * screen. (The Work Types page persists with a plain localStorage write — no same-tab custom event — so
 * cross-tab 'storage' is the sync signal; these are always different screens anyway.)
 */
export function useWorkTypes() {
  const [workTypes, setWorkTypes] = useState<WorkTypeRef[]>([]);

  const load = useCallback(() => {
    const list = loadWorkTypes();
    // One-time work-type backfill, guarded by WORKTYPE_BACKFILL_KEY; defers while the store is empty so
    // it runs on the first load that has current work types to match legacy name-strings against.
    runWorkTypeBackfillIfNeeded(list);
    setWorkTypes(list);
  }, []);

  useEffect(() => {
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === WORK_TYPES_KEY) load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load]);

  return { workTypes, reload: load };
}
