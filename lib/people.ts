import { useState, useEffect, useCallback } from 'react';

/**
 * PMZ — the Person model (Company Roster). The ONE home for people across roles
 * (COMPANY-ROSTER-AND-ROLES.md; Law 9, One Birthplace). Persisted under 'pmz_people_v1'.
 *
 * A person is NEVER deleted — departed people go inactive, because their id is stamped on history.
 *
 * On first load (only when 'pmz_people_v1' does not yet exist) this migrates, once, from the two
 * legacy registries it consolidates — 'pmz_salespeople' and 'pmz_estimators' — plus the legacy single
 * estimator inside 'pmz_company_settings'. Every migrated person gets the `salesperson` role, because
 * the estimator concept folds into salesperson (gaveled ruling). Same-name records merge to one id.
 * The old keys are left in place, untouched — they simply stop being read (UI retirement is step 2).
 *
 * The pure core (normalize / list / add / update / deactivate / migrate / gate) carries no localStorage
 * and is unit-tested directly by scripts/people-fence.test.mjs. The hook + migrateIfNeeded bind it to
 * storage, mirroring the rate-store / salespeople sync pattern (load on mount, react to storage + a
 * custom update event).
 */

export type Role = 'salesperson' | 'foreman' | 'accountant' | 'boss';
export const ROLES: Role[] = ['salesperson', 'foreman', 'accountant', 'boss'];

export interface Person {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  roles: Role[];
  active: boolean;
  createdAt: string;
}

export const PEOPLE_KEY = 'pmz_people_v1';
export const PEOPLE_EVENT = 'pmz-people-updated';

// Legacy source keys — read once at migration, then left untouched.
const SALESPEOPLE_KEY = 'pmz_salespeople';
const ESTIMATORS_KEY = 'pmz_estimators';
const COMPANY_SETTINGS_KEY = 'pmz_company_settings';

const VALID_ROLES = new Set<Role>(ROLES);

interface LegacyRecord {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  active?: boolean;
  createdAt?: string;
}

// Stable unique id (crypto.randomUUID preferred; fallback for older envs). Never use array index.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeRoles(raw: unknown): Role[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((r): r is Role => VALID_ROLES.has(r as Role))));
}

// ── PURE CORE (no localStorage — the fence tests these directly) ─────────────────────────────────

// Defensive shape-normalize of one raw record into a Person (fills id, sanitizes roles, defaults active).
export function normalizePerson(
  raw: any,
  idFactory: () => string = generateId,
  now: () => string = nowIso
): Person | null {
  if (!raw || typeof raw.name !== 'string' || raw.name.trim() === '') return null;
  const roles = sanitizeRoles(raw.roles);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id : idFactory(),
    name: raw.name,
    email: typeof raw.email === 'string' && raw.email.trim() !== '' ? raw.email : undefined,
    phone: typeof raw.phone === 'string' && raw.phone.trim() !== '' ? raw.phone : undefined,
    roles: roles.length > 0 ? roles : (['salesperson'] as Role[]),
    active: raw.active !== false,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now(),
  };
}

// Active people who hold a given role, in insertion order.
export function listActiveByRole(people: Person[], role: Role): Person[] {
  return people.filter((p) => p.active && p.roles.includes(role));
}

export function addPerson(
  people: Person[],
  input: { name: string; email?: string; phone?: string; roles?: Role[]; active?: boolean },
  idFactory: () => string = generateId,
  now: () => string = nowIso
): { people: Person[]; person: Person } {
  const roles = input.roles && input.roles.length > 0
    ? Array.from(new Set(input.roles.filter((r) => VALID_ROLES.has(r))))
    : (['salesperson'] as Role[]);
  const person: Person = {
    id: idFactory(),
    name: input.name.trim(),
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    roles,
    active: input.active !== false,
    createdAt: now(),
  };
  return { people: [...people, person], person };
}

export function updatePerson(
  people: Person[],
  id: string,
  updates: Partial<Omit<Person, 'id' | 'createdAt'>>
): Person[] {
  // id and createdAt are immutable — protect them even if passed in.
  return people.map((p) => (p.id === id ? { ...p, ...updates, id: p.id, createdAt: p.createdAt } : p));
}

// Departed people go INACTIVE — never removed (their id is stamped on history).
export function deactivatePerson(people: Person[], id: string): Person[] {
  return people.map((p) => (p.id === id ? { ...p, active: false } : p));
}

// Consolidate the two legacy registries (+ the legacy single estimator) into Person records. Every
// person gets the `salesperson` role. Same-name records (case-insensitive, trimmed) merge to ONE id:
// the first id wins, active wins (never hide someone active somewhere), missing email/phone fill in.
export function migratePeople(
  salespeople: LegacyRecord[],
  estimators: LegacyRecord[],
  legacyEstimator: { name?: string; title?: string; email?: string; phone?: string } | null,
  idFactory: () => string = generateId,
  now: () => string = nowIso
): Person[] {
  const byName = new Map<string, Person>();
  const ingest = (rec: LegacyRecord) => {
    const name = (rec.name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, {
        id: typeof rec.id === 'string' && rec.id.trim() !== '' ? rec.id : idFactory(),
        name,
        email: rec.email?.trim() || undefined,
        phone: rec.phone?.trim() || undefined,
        roles: ['salesperson'] as Role[],
        active: rec.active !== false,
        createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : now(),
      });
    } else {
      if (rec.active !== false) existing.active = true; // active wins across duplicates
      if (!existing.email && rec.email?.trim()) existing.email = rec.email.trim();
      if (!existing.phone && rec.phone?.trim()) existing.phone = rec.phone.trim();
    }
  };
  (salespeople || []).forEach(ingest);
  (estimators || []).forEach(ingest);
  if (legacyEstimator && (legacyEstimator.name || '').trim()) {
    ingest({ name: legacyEstimator.name, email: legacyEstimator.email, phone: legacyEstimator.phone, active: true });
  }
  return Array.from(byName.values());
}

// Decide migration purely: if 'pmz_people_v1' already has a value, NEVER migrate again (return null).
// Only on a truly absent key (null) do we produce the migrated list from the legacy sources.
export function planMigration(
  existingPeopleRaw: string | null,
  sources: { salespeople: LegacyRecord[]; estimators: LegacyRecord[]; legacyEstimator: { name?: string; title?: string; email?: string; phone?: string } | null },
  idFactory: () => string = generateId,
  now: () => string = nowIso
): Person[] | null {
  if (existingPeopleRaw !== null) return null; // key exists → already migrated, never run twice
  return migratePeople(sources.salespeople, sources.estimators, sources.legacyEstimator, idFactory, now);
}

// ── ATTRIBUTION GATE (Law 50 spirit) ─────────────────────────────────────────────────────────────

// Enforcement switch. The roster picker is wired (step 2), so the attribution gate is now LIVE: with an
// active salesperson on the roster, a blank salespersonId blocks a save. The gate LOGIC below remains
// pure and unit-tested independently of this switch.
export const ROSTER_PICKER_ENABLED: boolean = true;

// A salesperson attribution is required at save once at least one ACTIVE salesperson exists.
export function salespersonRequired(people: Person[]): boolean {
  return listActiveByRole(people, 'salesperson').length > 0;
}

// True when a save must be blocked: an active salesperson exists but no non-blank salespersonId is set.
export function salespersonGateBlocks(people: Person[], salespersonId: string | undefined | null): boolean {
  return salespersonRequired(people) && !(typeof salespersonId === 'string' && salespersonId.trim() !== '');
}

// ── LOCALSTORAGE BINDING ─────────────────────────────────────────────────────────────────────────

export function loadPeople(): Person[] {
  try {
    const raw = localStorage.getItem(PEOPLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => normalizePerson(r)).filter((p): p is Person => p !== null);
  } catch {
    return [];
  }
}

function persist(list: Person[]): void {
  try {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(list));
  } catch {
    // storage full / private mode / quota — fail silently (consistent with other PMZ storage)
  }
}

function readLegacyArray(key: string): LegacyRecord[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLegacyEstimator(): { name?: string; title?: string; email?: string; phone?: string } | null {
  try {
    const raw = localStorage.getItem(COMPANY_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const est = parsed?.estimator;
    return est && typeof est.name === 'string' && est.name.trim() !== '' ? est : null;
  } catch {
    return null;
  }
}

// Run migration once, only when 'pmz_people_v1' does not yet exist; otherwise just load. Never twice.
export function migrateIfNeeded(): Person[] {
  const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(PEOPLE_KEY) : '[]';
  const planned = planMigration(existing, {
    salespeople: readLegacyArray(SALESPEOPLE_KEY),
    estimators: readLegacyArray(ESTIMATORS_KEY),
    legacyEstimator: readLegacyEstimator(),
  });
  if (planned === null) return loadPeople();
  persist(planned);
  return planned;
}

export function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);

  const load = useCallback(() => {
    setPeople(migrateIfNeeded());
  }, []);

  useEffect(() => {
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === PEOPLE_KEY) load();
    };
    const onCustom = () => load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(PEOPLE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PEOPLE_EVENT, onCustom as EventListener);
    };
  }, [load]);

  const add = (input: { name: string; email?: string; phone?: string; roles?: Role[]; active?: boolean }) => {
    const { people: next, person } = addPerson(people, input);
    setPeople(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(PEOPLE_EVENT));
    return person.id;
  };

  const update = (id: string, updates: Partial<Omit<Person, 'id' | 'createdAt'>>) => {
    const next = updatePerson(people, id, updates);
    setPeople(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(PEOPLE_EVENT));
  };

  const deactivate = (id: string) => {
    const next = deactivatePerson(people, id);
    setPeople(next);
    persist(next);
    window.dispatchEvent(new CustomEvent(PEOPLE_EVENT));
  };

  return { people, addPerson: add, updatePerson: update, deactivatePerson: deactivate, reload: load };
}
