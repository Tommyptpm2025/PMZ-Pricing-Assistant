// Presentation split for the gate panel (B1). PURELY presentational, and it does NOT re-decide what
// blocks. Every line it receives is ALREADY in the gate's blocking set — classifyGateFailures put it
// there, and that is the decision that actually refuses the send. This function only splits each
// blocking line's ENTRIES for display: blanks/missing are the blocker detail (Section 1), typed zeros
// are shown separately (Section 2). The blank-vs-zero distinction is the gate's OWN per-entry `isZero`
// flag (set once in buildLineGateFailures) — read here, never recomputed. One brain decides what
// blocks (the gate); the panel just presents it. (Cross-checked in scripts/gate-panel-copy-fence.)
import type { LemGateLineFailure, LemGateEntryIssue } from "./lem-detail";

export interface GatePanelLine {
  line: LemGateLineFailure;
  issues: LemGateEntryIssue[];
}
export interface GatePanelSplit {
  blockers: GatePanelLine[]; // Section 1 — every received (already-blocking) line, with its blank/missing entries
  zeros: GatePanelLine[];    // Section 2 — the typed-zero entries riding along on those lines
  zeroCount: number;         // total typed-zero entries shown in Section 2
}

export function partitionGatePanel(failures: LemGateLineFailure[]): GatePanelSplit {
  const blockers: GatePanelLine[] = [];
  const zeros: GatePanelLine[] = [];
  let zeroCount = 0;
  for (const line of failures) {
    // Do NOT re-decide whether this line blocks — the gate already did. Every received line is a
    // blocker; we only split its entries for display (blanks here, typed zeros in Section 2).
    const blankIssues = line.issues.filter((i) => !i.isZero);
    const zeroIssues = line.issues.filter((i) => i.isZero);
    blockers.push({ line, issues: blankIssues });
    if (zeroIssues.length > 0) {
      zeros.push({ line, issues: zeroIssues });
      zeroCount += zeroIssues.length;
    }
  }
  return { blockers, zeros, zeroCount };
}
