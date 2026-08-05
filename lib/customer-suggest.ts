import type { RegistryCustomer } from "./customer-resolve";

// The ONE near-match suggester for an unresolved customer NAME. PURE: reads no localStorage, touches
// no React — the caller passes the registry in.
//
// LAW 82 LIVES HERE: the system NEVER guesses which customer a name means. This function returns
// RANKED OPTIONS and nothing else. There is deliberately no "best match", no confidence score above
// a threshold, no auto-apply flag, no `selected` — nothing a caller could mistake for a decision
// already made. A human picks, or nothing happens. What it does do (Law 50) is refuse to sit silent:
// it hands the panel something concrete to offer.
//
// The ranking rule, kept deliberately simple and explainable — the panel SHOWS the shared words, so a
// suggestion the owner can't see the reason for is a bug, not a feature:
//   • Split both names into words on any non-alphanumeric run, lowercased.
//   • Ignore legal-form and filler words (LLC, Inc, Co, The, &, …). "Acme LLC" and "Zenith LLC" share
//     nothing that means anything; ranking them as near-matches would bury the real ones.
//   • Score = how many SIGNIFICANT words the two names share, exactly. No fuzzy edit distance: a
//     near-match nobody can explain is a guess wearing a number.
//   • Zero shared words ⇒ NOT a suggestion. No shared words anywhere ⇒ an EMPTY list, and the panel
//     says so rather than padding it with the alphabetical top of the registry.

export interface CustomerSuggestion {
  id: string;
  name: string;            // the registry's name, exactly as stored
  sharedWords: string[];   // the words that earned the rank, in the queried name's order — shown to the human
}

// Legal forms and filler that carry no identity. Shared only-these ⇒ not a suggestion.
const INSIGNIFICANT = new Set([
  'llc', 'l', 'c', 'inc', 'incorporated', 'co', 'corp', 'corporation', 'ltd', 'limited',
  'company', 'group', 'holdings', 'the', 'and', 'of', 'a', 'an', 'llp', 'lp', 'pllc', 'plc', 'dba',
]);

// Words of a name, lowercased, significant ones only, de-duplicated but ORDER-PRESERVING.
export function significantWords(name: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (name || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || INSIGNIFICANT.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/**
 * Rank the registry customers that share at least one significant word with `name`.
 *
 * Returns [] when nothing shares a word — the honest answer, never a padded list. Order: most shared
 * words first; ties broken by name (case-insensitive) so the same input always renders the same list.
 * Every entry is an OPTION. Nothing in the returned shape says "this one" — see Law 82 above.
 */
export function suggestCustomerMatches(
  name: string,
  customers: RegistryCustomer[],
  limit = 5
): CustomerSuggestion[] {
  const wanted = significantWords(name);
  if (wanted.length === 0) return [];
  const scored: CustomerSuggestion[] = [];
  for (const c of customers || []) {
    if (!c || !c.id) continue;
    const have = new Set(significantWords(c.name || ''));
    const sharedWords = wanted.filter((w) => have.has(w));
    if (sharedWords.length === 0) continue; // no shared word → not a suggestion at all
    scored.push({ id: c.id, name: c.name || '', sharedWords });
  }
  scored.sort(
    (a, b) =>
      b.sharedWords.length - a.sharedWords.length ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
  return limit >= 0 ? scored.slice(0, limit) : scored;
}
