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

// Is `to` a legal next status from `from` per the lifecycle flow?
export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return (STATUS_FLOW[from] || []).includes(to);
}

// Append to statusHistory, apply the lock rule (latches true at "Approved" and
// never un-locks — the frozen bid snapshot must never change), and stamp the
// optional sentAt / decidedAt / decisionNote. Returns the next-state quote.
export function applyStatusChange(
  quote: SavedQuote,
  newStatus: QuoteStatus,
  extra?: { sentAt?: string; decidedAt?: string; decisionNote?: string },
  nowIso?: string
): SavedQuote {
  const now = nowIso || new Date().toISOString();
  // Seed history for legacy quotes saved before statusHistory existed, so the
  // trail starts from the quote's original status rather than losing it.
  const existing =
    Array.isArray(quote.statusHistory) && quote.statusHistory.length > 0
      ? quote.statusHistory
      : [{ status: quote.status, at: quote.createdAt || now }];
  return {
    ...quote,
    status: newStatus,
    locked: quote.locked || isStatusLocked(newStatus),
    statusHistory: [...existing, { status: newStatus, at: now }],
    updatedAt: now,
    ...(extra?.sentAt ? { sentAt: extra.sentAt } : {}),
    ...(extra?.decidedAt ? { decidedAt: extra.decidedAt } : {}),
    ...(extra?.decisionNote ? { decisionNote: extra.decisionNote } : {}),
  };
}

// Send a Draft out for acceptance: Draft -> Ready for Approval, stamping sentAt.
// Returns null if the quote isn't a sendable Draft.
export function sendQuoteForAcceptance(quote: SavedQuote, nowIso?: string): SavedQuote | null {
  if (quote.status !== "Draft" || !canTransition("Draft", "Ready for Approval")) return null;
  const now = nowIso || new Date().toISOString();
  return applyStatusChange(quote, "Ready for Approval", { sentAt: now }, now);
}
