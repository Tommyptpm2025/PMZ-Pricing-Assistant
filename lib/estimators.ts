import { useState, useEffect, useCallback } from 'react';

/**
 * PMZ Pricing Assistant — Estimator Registry (v1).
 * Central list of estimators, managed in Company Setup → Estimators, read by the Project Pricer.
 * Persisted to localStorage under 'pmz_estimators'. Deliberately mirrors the Salesperson Registry
 * (lib/salespeople.ts) one-for-one — same load/sync pattern, same hook surface — so the two
 * registries stay a single shared pattern (locked design rule: one pattern everywhere).
 *
 * On first run it migrates the legacy single Company Setup estimator (the old
 * pmz_company_settings.estimator block) into the registry so nothing is lost.
 */
export interface Estimator {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

const ESTIMATORS_KEY = 'pmz_estimators';
const COMPANY_SETTINGS_KEY = 'pmz_company_settings'; // legacy estimator source (migration only)
export const ESTIMATORS_EVENT = 'pmz-estimators-updated';

// Stable unique id (crypto.randomUUID preferred; fallback for older envs). Never use array index.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

// Defensive read + shape-normalize (fills missing ids, defaults `active` to true).
function loadRaw(): Estimator[] {
  try {
    const raw = localStorage.getItem(ESTIMATORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s: any) => s && typeof s.name === 'string' && s.name.trim() !== '')
      .map((s: any) => ({
        id: typeof s.id === 'string' && s.id.trim() !== '' ? s.id : generateId(),
        name: s.name,
        title: typeof s.title === 'string' && s.title.trim() !== '' ? s.title : undefined,
        email: typeof s.email === 'string' && s.email.trim() !== '' ? s.email : undefined,
        phone: typeof s.phone === 'string' && s.phone.trim() !== '' ? s.phone : undefined,
        active: s.active !== false, // default true
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function persist(list: Estimator[]): void {
  try {
    localStorage.setItem(ESTIMATORS_KEY, JSON.stringify(list));
  } catch {
    // storage full / private mode / quota — fail silently (consistent with other PMZ storage)
  }
}

// One-time migration: lift the legacy single Company Setup estimator into the registry. Reads the
// raw settings blob (not the typed getCompanySettings, which no longer carries an estimator group).
function seedFromCompanySettings(): Estimator[] {
  try {
    const raw = localStorage.getItem(COMPANY_SETTINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const est = parsed?.estimator;
    const name = typeof est?.name === 'string' ? est.name.trim() : '';
    if (!name) return [];
    return [{
      id: generateId(),
      name,
      title: typeof est.title === 'string' && est.title.trim() !== '' ? est.title : undefined,
      email: typeof est.email === 'string' && est.email.trim() !== '' ? est.email : undefined,
      phone: typeof est.phone === 'string' && est.phone.trim() !== '' ? est.phone : undefined,
      active: true,
      createdAt: new Date().toISOString(),
    }];
  } catch {
    return [];
  }
}

export function useEstimators() {
  const [estimators, setEstimators] = useState<Estimator[]>([]);

  const load = useCallback(() => {
    // First run ever (key absent) → migrate the legacy single estimator once, then persist so we
    // never re-seed (deleting everyone leaves an empty array under the key, which is respected).
    const exists = typeof localStorage !== 'undefined' && localStorage.getItem(ESTIMATORS_KEY) !== null;
    if (!exists) {
      const seeded = seedFromCompanySettings();
      if (seeded.length > 0) {
        persist(seeded);
      }
      setEstimators(seeded);
      return;
    }
    setEstimators(loadRaw());
  }, []);

  useEffect(() => {
    load();

    const onStorage = (e: StorageEvent) => {
      if (e.key === ESTIMATORS_KEY) load();
    };
    const onCustom = () => load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(ESTIMATORS_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(ESTIMATORS_EVENT, onCustom as EventListener);
    };
  }, [load]);

  const addEstimator = (input: { name: string; title?: string; email?: string; phone?: string; active?: boolean }) => {
    const rec: Estimator = {
      id: generateId(),
      name: input.name.trim(),
      title: input.title?.trim() || undefined,
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      active: input.active !== false,
      createdAt: new Date().toISOString(),
    };
    const next = [...estimators, rec];
    setEstimators(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(ESTIMATORS_EVENT));
    return rec.id;
  };

  const updateEstimator = (
    id: string,
    updates: Partial<Omit<Estimator, 'id' | 'createdAt'>>
  ) => {
    const next = estimators.map((s) => (s.id === id ? { ...s, ...updates } : s));
    setEstimators(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(ESTIMATORS_EVENT));
  };

  const deleteEstimator = (id: string) => {
    const next = estimators.filter((s) => s.id !== id);
    setEstimators(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(ESTIMATORS_EVENT));
  };

  return { estimators, addEstimator, updateEstimator, deleteEstimator, reload: load };
}
