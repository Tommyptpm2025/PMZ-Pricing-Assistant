import { useState, useEffect, useCallback } from 'react';
import { getAllQuotes } from './quote-storage';

/**
 * PMZ Pricing Assistant — Salesperson Registry (v1).
 * Central list of salespeople, managed in Settings → Salespeople, read by the Project Pricer.
 * Persisted to localStorage under 'pmz_salespeople'. Mirrors the rate-store sync pattern
 * (load on mount, react to 'storage' + a custom update event) so Settings edits reflect in the Pricer.
 */
export interface Salesperson {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

const SALESPEOPLE_KEY = 'pmz_salespeople';
export const SALESPEOPLE_EVENT = 'pmz-salespeople-updated';

// Stable unique id (crypto.randomUUID preferred; fallback for older envs). Never use array index.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

// Defensive read + shape-normalize (fills missing ids, defaults `active` to true).
function loadRaw(): Salesperson[] {
  try {
    const raw = localStorage.getItem(SALESPEOPLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s: any) => s && typeof s.name === 'string' && s.name.trim() !== '')
      .map((s: any) => ({
        id: typeof s.id === 'string' && s.id.trim() !== '' ? s.id : generateId(),
        name: s.name,
        email: typeof s.email === 'string' && s.email.trim() !== '' ? s.email : undefined,
        phone: typeof s.phone === 'string' && s.phone.trim() !== '' ? s.phone : undefined,
        active: s.active !== false, // default true
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function persist(list: Salesperson[]): void {
  try {
    localStorage.setItem(SALESPEOPLE_KEY, JSON.stringify(list));
  } catch {
    // storage full / private mode / quota — fail silently (consistent with other PMZ storage)
  }
}

// Build seed records from the distinct, non-empty salesperson names already on saved quotes.
function seedFromQuotes(): Salesperson[] {
  let names: string[] = [];
  try {
    names = getAllQuotes()
      .map((q) => (q.salesperson || '').trim())
      .filter((n) => n.length > 0);
  } catch {
    names = [];
  }
  const distinct = Array.from(new Set(names));
  const now = new Date().toISOString();
  return distinct.map((name) => ({
    id: generateId(),
    name,
    active: true,
    createdAt: now,
  }));
}

export function useSalespeople() {
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);

  const load = useCallback(() => {
    // First run ever (key absent) → seed once from existing quotes, then persist so we never re-seed
    // (deleting everyone leaves an empty array under the key, which is respected, not re-seeded).
    const exists = typeof localStorage !== 'undefined' && localStorage.getItem(SALESPEOPLE_KEY) !== null;
    if (!exists) {
      const seeded = seedFromQuotes();
      // Only lock in a non-empty seed. If there were no quotes to seed from yet,
      // leave the key absent so a later load (once real quotes exist) can seed once.
      // The deliberate "delete all → empty array sticks" path is unaffected: that
      // writes the key explicitly via deleteSalesperson, so `exists` is true thereafter.
      if (seeded.length > 0) {
        persist(seeded);
      }
      setSalespeople(seeded);
      return;
    }
    setSalespeople(loadRaw());
  }, []);

  useEffect(() => {
    // Load on every mount AND keep the cross-surface sync listeners registered for the lifetime of
    // the mount. (Previously a one-shot `hasLoadedRef` guard skipped re-registering the listeners
    // after a remount, so an open Pricer kept a stale registry snapshot and never saw salespeople
    // added later in Settings.) `load` is an idempotent localStorage read, so any double-run is safe.
    load();

    const onStorage = (e: StorageEvent) => {
      if (e.key === SALESPEOPLE_KEY) load();
    };
    const onCustom = () => load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(SALESPEOPLE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SALESPEOPLE_EVENT, onCustom as EventListener);
    };
  }, [load]);

  const addSalesperson = (input: { name: string; email?: string; phone?: string; active?: boolean }) => {
    const rec: Salesperson = {
      id: generateId(),
      name: input.name.trim(),
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      active: input.active !== false,
      createdAt: new Date().toISOString(),
    };
    const next = [...salespeople, rec];
    setSalespeople(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(SALESPEOPLE_EVENT));
    return rec.id;
  };

  const updateSalesperson = (
    id: string,
    updates: Partial<Omit<Salesperson, 'id' | 'createdAt'>>
  ) => {
    const next = salespeople.map((s) => (s.id === id ? { ...s, ...updates } : s));
    setSalespeople(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(SALESPEOPLE_EVENT));
  };

  const deleteSalesperson = (id: string) => {
    const next = salespeople.filter((s) => s.id !== id);
    setSalespeople(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(SALESPEOPLE_EVENT));
  };

  return { salespeople, addSalesperson, updateSalesperson, deleteSalesperson, reload: load };
}
