/**
 * Quote lifecycle transitions — the single source of truth shared by the Quotes
 * tab and the Project Pricer. These are pure transforms over a SavedQuote; the
 * caller is responsible for persisting the returned record (e.g. via updateQuote).
 */

import {
  STATUS_FLOW,
  isStatusLocked,
  type QuoteStatus,
  type SavedQuote,
  type StatusChangeCause,
  type StatusHistoryEntry,
} from "./pmz-types";
import {
  buildLineGateFailures,
  classifyGateFailures,
  type LemGateLineFailure,
  type LemRateCatalogs,
} from "./lem-detail";

// Is `to` a legal next status from `from` per the lifecycle flow?
export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return (STATUS_FLOW[from] || []).includes(to);
}

// A neutral catalog for the send DECISION. buildLineGateFailures needs a catalog only to resolve
// display NAMES (role/description) for the panel; whether a field is blank is catalog-independent.
// So the decision runs with empty catalogs; the presentation layer re-asks WITH real catalogs when
// it needs named entries for the panel.
const NO_CATS: LemRateCatalogs = {
  laborRates: [], equipmentRates: [], materialRates: [], miscRates: [],
  getLaborCostPerHour: () => 0, getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0, getMiscCostPerUnit: () => 0,
};

// THE single copy of the send-blank rule (Law 50). Returns the BLOCKING failures — bid lines whose
// LEM detail is blank / missing / has no entries — that must stop a price from reaching a customer.
// A TYPED ZERO is NOT blocking (it confirms-and-carries; that is an Accept concern). Non-EPP quotes
// have no LEM detail, so nothing blocks. Pass real `cats` when you need named entries for display.
// The send-gate gather loop: build each line's failure through the ONE rule (buildLineGateFailures)
// and classify. Returns BOTH blocking (blanks / undeclared no-entry) and zeros (typed zeros +
// declared flat-rate lines). One loop — sendBlockingFailures reads its .blocking (no second copy).
export function sendGateFailures(
  quote: Pick<SavedQuote, "quoteType" | "eppLineItems">,
  cats: LemRateCatalogs = NO_CATS,
): { blocking: LemGateLineFailure[]; zeros: LemGateLineFailure[] } {
  if (quote.quoteType !== "EPP") return { blocking: [], zeros: [] };
  const failures = (quote.eppLineItems || [])
    .map((it, i) => buildLineGateFailures(it, cats, it.description?.trim() || `Line ${i + 1}`))
    .filter((f): f is LemGateLineFailure => !!f);
  return classifyGateFailures(failures);
}

export function sendBlockingFailures(
  quote: Pick<SavedQuote, "quoteType" | "eppLineItems">,
  cats: LemRateCatalogs = NO_CATS,
): LemGateLineFailure[] {
  return sendGateFailures(quote, cats).blocking;
}

// The result of a transition attempt. The send gate makes a transition REFUSABLE, so the outcome
// is a discriminated union the caller MUST narrow — reading `.quote` off it without checking `.ok`
// fails typecheck. That is the point: the refusal cannot be ignored (not a throw, not a silent
// no-op). Only the transition INTO "Ready for Approval" can refuse; every other target is always ok.
export type ApplyStatusResult =
  | { ok: true; quote: SavedQuote }
  | { ok: false; refusedInto: QuoteStatus; blocking: LemGateLineFailure[] };

// Append to statusHistory, apply the lock rule (latches true at "Approved" and
// never un-locks — the frozen bid snapshot must never change), and stamp the
// optional sentAt / decidedAt / decisionNote. Returns the next-state quote — UNLESS the target is
// "Ready for Approval" and the send gate finds blocking (blank / no-entry) LEM detail, in which case
// it REFUSES. The gate lives here, at the transition, so EVERY door into Sent inherits it: no policy
// bolted to individual UI controls, no path that can reach Sent without this check.
export function applyStatusChange(
  quote: SavedQuote,
  newStatus: QuoteStatus,
  extra?: {
    sentAt?: string;
    decidedAt?: string;
    decisionNote?: string;
    zeroConfirmation?: SavedQuote["zeroConfirmation"];
    /** Only for moves the SYSTEM made. A human transition leaves this absent — see StatusChangeCause. */
    cause?: StatusChangeCause;
  },
  nowIso?: string
): ApplyStatusResult {
  // Send gate (Law 50) — scoped to the one target that reaches a customer. A blank price is refused;
  // typed zeros carry (Accept concern, not checked here). Every other transition is untouched.
  if (newStatus === "Ready for Approval") {
    const blocking = sendBlockingFailures(quote);
    if (blocking.length > 0) return { ok: false, refusedInto: newStatus, blocking };
  }
  const now = nowIso || new Date().toISOString();
  // Seed history for legacy quotes saved before statusHistory existed, so the
  // trail starts from the quote's original status rather than losing it.
  const existing =
    Array.isArray(quote.statusHistory) && quote.statusHistory.length > 0
      ? quote.statusHistory
      : [{ status: quote.status, at: quote.createdAt || now }];
  const entry: StatusHistoryEntry = {
    status: newStatus,
    at: now,
    ...(extra?.cause ? { cause: extra.cause } : {}),
  };
  return {
    ok: true,
    quote: {
      ...quote,
      status: newStatus,
      locked: quote.locked || isStatusLocked(newStatus),
      statusHistory: [...existing, entry],
      updatedAt: now,
      ...(extra?.sentAt ? { sentAt: extra.sentAt } : {}),
      ...(extra?.decidedAt ? { decidedAt: extra.decidedAt } : {}),
      ...(extra?.decisionNote ? { decisionNote: extra.decisionNote } : {}),
      ...(extra?.zeroConfirmation ? { zeroConfirmation: extra.zeroConfirmation } : {}),
    },
  };
}

// ── THE FINISH-LINE BRIDGE ────────────────────────────────────────────────────────────────────────
//
// The work is done in the field; the money should not wait on someone remembering to say so. When a
// foreman's job is marked COMPLETE, its linked quote walks itself to Ready to Invoice.
//
// ── THE LAWS THIS BRIDGE LIVES UNDER ──────────────────────────────────────────────────────────────
// FORWARD ONLY. Completing a job moves a quote toward the invoice and NEVER away from it. REOPENING
// a job does not walk the quote back: a backward move is a human decision (the lifecycle-guard
// doctrine), because the reasons to reopen — one more day of punch list, a callback, a typo in the
// actuals — almost never mean "un-bill this". There is deliberately no reverse function here to call.
//
// ONLY FROM THE ACCEPTED SIDE, AND ONLY IF IT IS STILL BEHIND. Approved, Scheduled and Work Order
// Active all advance; already Ready to Invoice, Invoiced or Paid changes NOTHING (an invoiced job
// completing late must never drag a paid quote back to un-invoiced). Draft, Sent, Declined and Lost
// are untouched — a job on an unaccepted or dead quote is a data problem, not an invoice.
//
// It is a JUMP, not a step: a Scheduled job that completes lands on Ready to Invoice directly rather
// than walking each rung. The finish line is the same wherever the record had got to, and inventing
// intermediate history the business never lived through would be a worse record, not a better one.
//
// THE MOVE IS STAMPED AS AUTOMATIC. The history entry carries cause: 'job-completion', so nobody ever
// reads this as a person's decision — see StatusChangeCause. That is the whole reason the cause field
// exists: a system move that looks human in the trail is a lie the record tells later.
//
// Returns null when nothing should change, so the caller writes only on a real move.

/** The accepted-side statuses a job completion advances. Everything else is left alone. */
export const ADVANCES_ON_JOB_COMPLETION: QuoteStatus[] = ["Approved", "Scheduled", "In Progress"];

export function quoteAdvancesOnJobCompletion(status: QuoteStatus): boolean {
  return ADVANCES_ON_JOB_COMPLETION.includes(status);
}

export function advanceQuoteOnJobCompletion(quote: SavedQuote, nowIso?: string): SavedQuote | null {
  if (!quote || !quoteAdvancesOnJobCompletion(quote.status)) return null;
  const result = applyStatusChange(quote, "Ready to Invoice", { cause: "job-completion" }, nowIso);
  // "Ready to Invoice" is not the send gate's target, so this branch is unreachable — but the union
  // must be narrowed, and a refusal can only ever mean "do not write", never "write anyway".
  return result.ok ? result.quote : null;
}

/**
 * The last status change and why — for the surface that has to say "advanced by job completion".
 * Returns null when the trail is empty or the last move was a person's (no cause), because the
 * default needs no announcement.
 */
export function lastAutomaticStatusChange(
  quote: Pick<SavedQuote, "statusHistory">
): { cause: StatusChangeCause; at: string; status: QuoteStatus } | null {
  const history = quote?.statusHistory;
  if (!Array.isArray(history) || history.length === 0) return null;
  const last = history[history.length - 1];
  return last?.cause ? { cause: last.cause, at: last.at, status: last.status } : null;
}

// Send a Draft out for acceptance: Draft -> Ready for Approval, stamping sentAt. Returns null if the
// quote isn't a sendable Draft; otherwise the ApplyStatusResult — which INHERITS the send gate's
// refusal automatically (this is why the Pricer's send path is now gated without its own check).
export function sendQuoteForAcceptance(quote: SavedQuote, nowIso?: string): ApplyStatusResult | null {
  if (quote.status !== "Draft" || !canTransition("Draft", "Ready for Approval")) return null;
  const now = nowIso || new Date().toISOString();
  return applyStatusChange(quote, "Ready for Approval", { sentAt: now }, now);
}
