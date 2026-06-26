/**
 * PMZ Pricing Assistant — Company Settings (Build D, Tier A token source).
 * Owner-sets-once company identity + default terms, persisted to localStorage under
 * 'pmz_company_settings'. SSR-safe (no window at module load), safe JSON.
 *
 * Mirrors the salespeople registry sync pattern: load on mount, react to 'storage' + a
 * custom event, so a Company Setup edit reflects live on any open document preview.
 *
 * Do not use this key anywhere else: 'pmz_company_settings'
 *
 * NOTE: `terms.late_interest_annual_pct` is DERIVED (monthly × 12), never stored as an
 * independent field — see computeAnnualInterest(). The stored shape carries only the
 * monthly rate; the annual value is computed wherever it's displayed/tokenized.
 */

import { useState, useEffect, useCallback } from 'react';

export interface CompanySettings {
  company: {
    legal_name: string;
    short_name: string;
    website: string;
    phone: string;
    email: string;
    address: string;
    city_state_zip: string;
    year_founded: string;
    years_experience: string;
    payment_methods: string;
  };
  estimator: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  terms: {
    deposit_pct: string;
    balance_due_days: string;
    late_interest_monthly_pct: string; // annual is derived (× 12), not stored
    change_order_deposit_pct: string;
    cancellation_fee_pct: string;
    quote_validity_days: string;
  };
  lien: {
    state: string;
    state_notice_text: string; // attorney-review-flagged in the UI
    withhold_days: string;
  };
  legal: {
    utility_locator: string;
  };
  process: {
    cure_avoid_hours: string;
  };
}

const COMPANY_SETTINGS_KEY = 'pmz_company_settings';
export const COMPANY_SETTINGS_EVENT = 'pmz-company-settings-updated';

export const EMPTY_COMPANY_SETTINGS: CompanySettings = {
  company: {
    legal_name: '',
    short_name: '',
    website: '',
    phone: '',
    email: '',
    address: '',
    city_state_zip: '',
    year_founded: '',
    years_experience: '',
    payment_methods: '',
  },
  estimator: { name: '', title: '', email: '', phone: '' },
  terms: {
    deposit_pct: '',
    balance_due_days: '',
    late_interest_monthly_pct: '',
    change_order_deposit_pct: '',
    cancellation_fee_pct: '',
    quote_validity_days: '',
  },
  lien: { state: '', state_notice_text: '', withhold_days: '' },
  legal: { utility_locator: '' },
  process: { cure_avoid_hours: '' },
};

/**
 * Derived annual late-interest rate = monthly × 12. Returns '' when the monthly input is
 * blank or non-numeric, so the token resolves to an empty string rather than 'NaN'.
 */
export function computeAnnualInterest(monthlyPct: string | number | undefined | null): string {
  const n = typeof monthlyPct === 'number' ? monthlyPct : parseFloat(String(monthlyPct ?? ''));
  if (!isFinite(n)) return '';
  const annual = n * 12;
  // Trim a trailing .0 / .00 so "1.5" → "18", "1.25" → "15"
  return Number(annual.toFixed(2)).toString();
}

// Deep-merge a loaded (possibly partial / legacy) object onto the empty shape so missing
// groups/keys never throw at the call site.
function normalize(parsed: any): CompanySettings {
  const base = EMPTY_COMPANY_SETTINGS;
  if (!parsed || typeof parsed !== 'object') return { ...base };
  const out: CompanySettings = JSON.parse(JSON.stringify(base));
  (Object.keys(base) as (keyof CompanySettings)[]).forEach((group) => {
    const src = parsed[group];
    if (src && typeof src === 'object') {
      Object.keys(out[group]).forEach((key) => {
        const v = (src as any)[key];
        if (typeof v === 'string') (out[group] as any)[key] = v;
        else if (typeof v === 'number') (out[group] as any)[key] = String(v);
      });
    }
  });
  return out;
}

export function getCompanySettings(): CompanySettings {
  if (typeof window === 'undefined') return { ...EMPTY_COMPANY_SETTINGS };
  try {
    const raw = localStorage.getItem(COMPANY_SETTINGS_KEY);
    if (!raw) return { ...EMPTY_COMPANY_SETTINGS };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...EMPTY_COMPANY_SETTINGS };
  }
}

export function saveCompanySettings(settings: CompanySettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COMPANY_SETTINGS_KEY, JSON.stringify(normalize(settings)));
    window.dispatchEvent(new CustomEvent(COMPANY_SETTINGS_EVENT));
  } catch {
    // storage full / private mode / quota — fail silently (consistent with other PMZ storage)
  }
}

/**
 * Live-synced company settings hook. Reads on mount and re-reads on cross-tab 'storage'
 * events and same-tab COMPANY_SETTINGS_EVENT, so Company Setup edits propagate to any
 * open document surface without a reload.
 */
export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(EMPTY_COMPANY_SETTINGS);

  const load = useCallback(() => {
    setSettings(getCompanySettings());
  }, []);

  useEffect(() => {
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPANY_SETTINGS_KEY) load();
    };
    const onCustom = () => load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(COMPANY_SETTINGS_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(COMPANY_SETTINGS_EVENT, onCustom as EventListener);
    };
  }, [load]);

  return { settings, save: saveCompanySettings, reload: load };
}
