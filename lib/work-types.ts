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
