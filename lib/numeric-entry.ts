// One birthplace for parsing a numeric text-input value (the Law 50 input layer, Jul 25 2026).
//
// The distinction the LEM Gate protects starts HERE: a BLANK is the absence of an answer, and so is
// GARBAGE ("abc") — both return undefined (the gate blocks them). A typed "0" is a true answer and
// returns 0 (the gate confirm-and-carries it). Negatives floor to 0.
//
// Callers bind `value={x ?? ""}` (nullish — a stored 0 renders "0"; undefined renders blank) and
// store the returned value directly, so a deliberate zero and an unanswered blank stay distinct.
export function parseNumericEntry(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;      // blank — no answer
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return undefined;     // "abc", "NaN", etc. — garbage is not a zero
  return Math.max(0, n);                          // a real number; negatives floor to 0
}
