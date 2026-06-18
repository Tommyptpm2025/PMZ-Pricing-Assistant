/**
 * PMZ Pricing Assistant — Terms & Conditions localStorage layer (Stage 1: builder only)
 * SSR-safe (no window access at module load), safe JSON, unique ids.
 * Do not use key anywhere else: 'pmz_terms'
 */

export interface TermsBlock {
  id: string;
  name: string;
  body: string; // multi-line text
  isDefault: boolean;
  updatedAt: string;
}

const TERMS_KEY = 'pmz_terms';

// --- Internal safe loaders (SSR guard) ---

function loadTerms(): TermsBlock[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TERMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistTerms(terms: TermsBlock[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify(terms));
  } catch {
    // storage full / private mode / quota — fail silently
  }
}

// --- Terms helpers ---

export function getAllTerms(): TermsBlock[] {
  const terms = loadTerms();
  return [...terms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDefaultTerms(): TermsBlock | null {
  const terms = loadTerms();
  return terms.find(t => t.isDefault) ?? (terms.length > 0 ? terms[0] : null);
}

export function saveTermsBlock(input: {
  id?: string;
  name: string;
  body: string;
  isDefault?: boolean;
}): void {
  let terms = loadTerms();
  const now = new Date().toISOString();

  if (input.id) {
    // edit existing
    const idx = terms.findIndex(t => t.id === input.id);
    if (idx >= 0) {
      terms[idx] = {
        ...terms[idx],
        name: input.name.trim(),
        body: input.body,
        isDefault: !!input.isDefault,
        updatedAt: now,
      };
    }
  } else {
    // create new with unique id
    const newBlock: TermsBlock = {
      id: `terms_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: input.name.trim(),
      body: input.body,
      isDefault: !!input.isDefault,
      updatedAt: now,
    };
    terms.push(newBlock);
  }

  // enforce only one default
  if (input.isDefault) {
    terms.forEach(t => {
      if (t.id !== (input.id || terms[terms.length - 1].id)) {
        t.isDefault = false;
      }
    });
  } else if (!terms.some(t => t.isDefault) && terms.length > 0) {
    // if no default, make the first one default (or the edited one)
    const first = terms[0];
    if (first) first.isDefault = true;
  }

  persistTerms(terms);
}

export function deleteTermsBlock(id: string): void {
  let terms = loadTerms().filter(t => t.id !== id);

  // if we deleted the default and there are others, promote the first
  if (!terms.some(t => t.isDefault) && terms.length > 0) {
    terms[0].isDefault = true;
  }

  persistTerms(terms);
}

export function setDefaultTerms(id: string): void {
  const terms = loadTerms();
  terms.forEach(t => {
    t.isDefault = t.id === id;
  });
  persistTerms(terms);
}
