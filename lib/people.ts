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

  // ── ON-THE-SPOT AUTHORITY ────────────────────────────────────────────────────────────────────────
  // What THIS PERSON may commit on a change order without calling anyone, in dollars of COST. It rides
  // on the person and not on the job, because that is what it actually is: trust in a man, earned over
  // years, and it travels with him to every job he runs. Applies to people holding the foreman role.
  //
  // Absent — the normal case — means he works under the company default. An explicit 0 is a real
  // setting: everything he writes is held for approval. Anything negative or non-numeric is not a
  // limit and falls through to the company (see appliedChangeOrderCeiling, the ONE reader).
  //
  // IT IS A PERMISSION. It changes only through the roster's Edit → Save, and only behind the same
  // plainly-stated confirmation that guards roles and active — see authorityChangeSentence below.
  onTheSpotLimitDollars?: number;
}

/** A stored authority value is a limit only when it is a finite, non-negative number. */
export function normalizeOnTheSpotLimit(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** THIS person's on-the-spot authority, or undefined when they have none of their own. */
export function personOnTheSpotLimit(people: Person[], personId: string): number | undefined {
  const p = (people || []).find((x) => x.id === (personId || '').trim());
  return normalizeOnTheSpotLimit(p?.onTheSpotLimitDollars);
}

export const PEOPLE_KEY = 'pmz_people_v1';
export const PEOPLE_EVENT = 'pmz-people-updated';

// One-time legacy-attribution backfill flag + provenance record (see LEGACY ATTRIBUTION BACKFILL). Its
// mere presence — any value — means the backfill has run and must NEVER run again.
export const ATTRIBUTION_BACKFILL_KEY = 'pmz_attribution_backfill_v1';

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
    // An authority that arrives malformed is NO authority, never a guessed one — the fallback is the
    // company default, which is the conservative direction.
    onTheSpotLimitDollars: normalizeOnTheSpotLimit(raw.onTheSpotLimitDollars),
  };
}

/**
 * The plain sentence a change to someone's on-the-spot authority must be confirmed with, or null when
 * nothing about it changed. Money that a man may commit without a phone call is a PERMISSION, and a
 * permission changes only as a stated decision — the same rule roles and the active flag live under.
 *
 * It is pure and lives here, beside the model, so the fence tests the SENTENCE THE ROSTER ACTUALLY
 * SHOWS rather than a copy of it that can drift.
 */
export function authorityChangeSentence(
  name: string,
  previous: number | undefined,
  next: number | undefined
): string | null {
  const before = normalizeOnTheSpotLimit(previous);
  const after = normalizeOnTheSpotLimit(next);
  if (before === after) return null;
  const who = (name || '').trim() || 'this person';
  const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (after === undefined) {
    return `Remove ${who}'s own on-the-spot authority and fall back to the company limit?`;
  }
  return `Set ${who}'s on-the-spot authority to ${money(after)}?`;
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

// ── LEGACY ATTRIBUTION BACKFILL (pure core) ────────────────────────────────────────────────────────
//
// CLAIM THE HISTORY. Records saved before attribution moved to Person ids carry only a salesperson NAME
// STRING (a saved quote's or job's `salesperson`). This one-time backfill stamps the matching Person id
// onto those records so the scorecard and tracker can attribute history by id — WITHOUT losing the name.
//
// The laws it holds:
//   • MONEY IS UNTOUCHABLE. Only the attribution pair (salesperson / salespersonId) is ever read or
//     written. Every other field — amount, GP, status, date, anything — passes through byte-identical
//     (a changed record is a shallow copy; an unchanged one is the SAME reference).
//   • NEVER overwrite an existing salespersonId. A record already attributed is left exactly as-is.
//   • Write an id ONLY on an UNAMBIGUOUS match: the trimmed, case-insensitive name resolves to EXACTLY
//     ONE person on the roster. Two people share the name → ambiguous, skipped. No one matches → skipped.
//     A skip never guesses.
//   • The legacy name string stays in place, for provenance.

// A record the backfill can attribute. It reads ONLY these two fields; everything else is opaque and
// carried through untouched.
export interface AttributableRecord {
  salesperson?: string;
  salespersonId?: string;
}

export interface AttributionCounts {
  matched: number;
  ambiguousSkipped: number;
  noMatchSkipped: number;
}

// lowercase+trim name → the ids of every roster person with that name. length > 1 ⇒ ambiguous.
function rosterNameIndex(people: Person[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const p of people || []) {
    const key = (p.name || '').trim().toLowerCase();
    if (!key) continue;
    const ids = idx.get(key);
    if (ids) ids.push(p.id);
    else idx.set(key, [p.id]);
  }
  return idx;
}

const hasSalespersonId = (rec: AttributableRecord): boolean =>
  typeof rec.salespersonId === 'string' && rec.salespersonId.trim() !== '';

// Stamp the matching Person id onto each UNATTRIBUTED, name-carrying record. Returns a NEW array; a
// changed record is a shallow copy with salespersonId added (all other fields identical), and an
// unchanged record is returned by the SAME reference. Never mutates the input.
export function backfillAttribution<T extends AttributableRecord>(
  records: T[],
  people: Person[]
): { records: T[]; counts: AttributionCounts } {
  const idx = rosterNameIndex(people);
  let matched = 0;
  let ambiguousSkipped = 0;
  let noMatchSkipped = 0;
  const out = (records || []).map((rec) => {
    // GUARD: an already-attributed record is NEVER overwritten. (Mutation target — remove this and the
    // backfill clobbers existing salespersonIds, which the fence forbids.)
    if (hasSalespersonId(rec)) return rec;
    const name = (rec.salesperson ?? '').trim();
    if (name === '') return rec; // no legacy name → not a candidate at all
    const ids = idx.get(name.toLowerCase()) ?? [];
    if (ids.length === 1) {
      matched++;
      return { ...rec, salespersonId: ids[0] };
    }
    if (ids.length > 1) {
      ambiguousSkipped++; // two people share the name — never guess which
      return rec;
    }
    noMatchSkipped++; // a real name, but no one on the roster carries it
    return rec;
  });
  return { records: out, counts: { matched, ambiguousSkipped, noMatchSkipped } };
}

export interface AttributionBackfillPlan {
  quotes: AttributableRecord[];
  jobs: AttributableRecord[];
  counts: AttributionCounts;                                    // combined totals across both stores
  byStore: { quotes: AttributionCounts; jobs: AttributionCounts };
}

// Decide the backfill purely: if the flag key already holds ANY value, NEVER run again (return null).
// Only on a truly absent flag (null) do we produce the attributed record arrays + inspectable counts.
export function planAttributionBackfill(
  existingFlagRaw: string | null,
  quotes: AttributableRecord[],
  jobs: AttributableRecord[],
  people: Person[]
): AttributionBackfillPlan | null {
  if (existingFlagRaw !== null) return null; // flag present (even '') → already ran, never twice
  const q = backfillAttribution(quotes, people);
  const j = backfillAttribution(jobs, people);
  return {
    quotes: q.records,
    jobs: j.records,
    counts: {
      matched: q.counts.matched + j.counts.matched,
      ambiguousSkipped: q.counts.ambiguousSkipped + j.counts.ambiguousSkipped,
      noMatchSkipped: q.counts.noMatchSkipped + j.counts.noMatchSkipped,
    },
    byStore: { quotes: q.counts, jobs: j.counts },
  };
}

// ── LOAD-TIME IDENTITY RESOLUTION (the handoff into the Pricer) ──────────────────────────────────
//
// The salesperson twin of resolveCustomerFromHandoff (lib/customer-resolve.ts). A saved quote carries
// BOTH an id and a name string; the Pricer's picker is keyed by ID. This decides which one the picker
// should show — PURE, so the fence tests the real rule and not a model of it.
//
// WHY IT EXISTS AND WHY IT IS NOT THE BACKFILL: the one-shot backfill above burns its flag on its
// first run. A book whose roster was still empty that day keeps its name-only quotes forever, and no
// second run is coming. Resolving live at LOAD means an exact roster name is adopted whenever the
// roster can answer — flag or no flag.
//
// The rules:
//   • A STORED ID IS NEVER DROPPED. Attribution already recorded stays recorded, even when that person
//     has since gone inactive or off the roster — dropping it would silently re-attribute the quote on
//     the next save. When the id is still findable, the roster's CANONICAL name is what we display
//     (same live-canonical-by-id rule the customer resolver holds).
//   • No id → adopt the id of the EXACTLY ONE PICKABLE person of that name (trimmed, case-insensitive).
//     "Pickable" is the picker's own list — active people in the salesperson role — so an id adopted
//     here always renders as a real selection instead of a blank box. Two matches, or none, adopt
//     nothing: a skip never guesses.
//   • Otherwise the name stays as a legacy string with NO id — and that is the only state in which the
//     "reselect from the roster" hint may appear.

export interface SalespersonHandoffFields {
  salesperson?: string;
  salespersonId?: string;
}
export interface ResolvedSalesperson {
  salespersonId: string;
  salesperson: string;
}

export function resolveSalespersonFromHandoff(
  saved: SalespersonHandoffFields,
  people: Person[]
): ResolvedSalesperson {
  const storedId = (saved.salespersonId ?? '').trim();
  const storedName = (saved.salesperson ?? '').trim();
  if (storedId !== '') {
    // Never dropped. The name is the roster's when we can find the person, the stored one otherwise.
    const byId = (people || []).find((p) => p.id === storedId);
    return { salespersonId: storedId, salesperson: byId?.name || storedName };
  }
  if (storedName === '') return { salespersonId: '', salesperson: '' };
  const key = storedName.toLowerCase();
  const matches = listActiveByRole(people || [], 'salesperson').filter(
    (p) => (p.name || '').trim().toLowerCase() === key
  );
  if (matches.length === 1) return { salespersonId: matches[0].id, salesperson: matches[0].name };
  return { salespersonId: '', salesperson: storedName }; // ambiguous or unknown → legacy string, no id
}

// The rendered condition for the "legacy name — reselect from the roster" hint, exported so the fence
// tests the SAME predicate the Pricer renders. True ONLY when there is a name and no id survived
// resolution — i.e. the record truly has no id and no exact-match roster name.
export function showsLegacySalespersonHint(resolved: SalespersonHandoffFields): boolean {
  return (resolved.salespersonId ?? '').trim() === '' && (resolved.salesperson ?? '').trim() !== '';
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

// Legacy record stores the backfill reads/writes. Kept as local literals (JOBS_KEY mirrors
// lib/jobs.ts JOBS_STORAGE_KEY) so people.ts stays decoupled from those modules.
const SAVED_QUOTES_KEY = 'pmz_saved_quotes';
const JOBS_KEY = 'pmz_jobs_v1';

function readRecordArray(key: string): AttributableRecord[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Run the legacy-attribution backfill ONCE, guarded by ATTRIBUTION_BACKFILL_KEY. Idempotent even if the
// flag write were to fail — the per-record guard skips already-attributed records — so a re-run can
// never double-attribute or clobber. A store is rewritten only when it actually gained an attribution;
// the flag always records the summary (matched / ambiguous-skipped / no-match-skipped) so the numbers
// stay inspectable later. MONEY UNTOUCHED: only the attribution field is ever written back.
export function runAttributionBackfillIfNeeded(people: Person[]): void {
  if (typeof localStorage === 'undefined') return;
  let flag: string | null;
  try {
    flag = localStorage.getItem(ATTRIBUTION_BACKFILL_KEY);
  } catch {
    return;
  }
  const quotes = readRecordArray(SAVED_QUOTES_KEY);
  const jobs = readRecordArray(JOBS_KEY);
  const plan = planAttributionBackfill(flag, quotes, jobs, people);
  if (plan === null) return; // flag present → already ran
  try {
    if (plan.byStore.quotes.matched > 0) localStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify(plan.quotes));
  } catch {
    // storage error — leave the store; the guard keeps a later re-run safe
  }
  try {
    if (plan.byStore.jobs.matched > 0) localStorage.setItem(JOBS_KEY, JSON.stringify(plan.jobs));
  } catch {
    // storage error — as above
  }
  try {
    localStorage.setItem(
      ATTRIBUTION_BACKFILL_KEY,
      JSON.stringify({
        ranAt: nowIso(),
        matched: plan.counts.matched,
        ambiguousSkipped: plan.counts.ambiguousSkipped,
        noMatchSkipped: plan.counts.noMatchSkipped,
        byStore: plan.byStore,
      })
    );
  } catch {
    // couldn't record the flag — the backfill still ran; the guard makes a re-run harmless
  }
}

export function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);

  const load = useCallback(() => {
    const list = migrateIfNeeded();
    // Runs on load; guarded by ATTRIBUTION_BACKFILL_KEY so it can never run twice. Needs the roster
    // (list) to match legacy name-strings against, so it runs right after migration.
    runAttributionBackfillIfNeeded(list);
    setPeople(list);
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
