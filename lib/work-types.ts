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

/**
 * Live-synced work-types reference hook. Reads on mount and re-reads on cross-tab 'storage' events for
 * the work-types key, so editing work types on that page reflects on an open goals-entry / scorecard
 * screen. (The Work Types page persists with a plain localStorage write — no same-tab custom event — so
 * cross-tab 'storage' is the sync signal; these are always different screens anyway.)
 */
export function useWorkTypes() {
  const [workTypes, setWorkTypes] = useState<WorkTypeRef[]>([]);

  const load = useCallback(() => {
    setWorkTypes(loadWorkTypes());
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
