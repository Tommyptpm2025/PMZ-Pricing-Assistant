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
export function sendBlockingFailures(
  quote: Pick<SavedQuote, "quoteType" | "eppLineItems">,
  cats: LemRateCatalogs = NO_CATS,
): LemGateLineFailure[] {
  if (quote.quoteType !== "EPP") return [];
  const failures = (quote.eppLineItems || [])
    .map((it, i) => buildLineGateFailures(it, cats, it.description?.trim() || `Line ${i + 1}`))
    .filter((f): f is LemGateLineFailure => !!f);
  return classifyGateFailures(failures).blocking;
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
  extra?: { sentAt?: string; decidedAt?: string; decisionNote?: string; zeroConfirmation?: SavedQuote["zeroConfirmation"] },
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
  return {
    ok: true,
    quote: {
      ...quote,
      status: newStatus,
      locked: quote.locked || isStatusLocked(newStatus),
      statusHistory: [...existing, { status: newStatus, at: now }],
      updatedAt: now,
      ...(extra?.sentAt ? { sentAt: extra.sentAt } : {}),
      ...(extra?.decidedAt ? { decidedAt: extra.decidedAt } : {}),
      ...(extra?.decisionNote ? { decisionNote: extra.decisionNote } : {}),
      ...(extra?.zeroConfirmation ? { zeroConfirmation: extra.zeroConfirmation } : {}),
    },
  };
}

// Send a Draft out for acceptance: Draft -> Ready for Approval, stamping sentAt. Returns null if the
// quote isn't a sendable Draft; otherwise the ApplyStatusResult — which INHERITS the send gate's
// refusal automatically (this is why the Pricer's send path is now gated without its own check).
export function sendQuoteForAcceptance(quote: SavedQuote, nowIso?: string): ApplyStatusResult | null {
  if (quote.status !== "Draft" || !canTransition("Draft", "Ready for Approval")) return null;
  const now = nowIso || new Date().toISOString();
  return applyStatusChange(quote, "Ready for Approval", { sentAt: now }, now);
}
