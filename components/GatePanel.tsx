"use client";

import * as React from "react";
import type { LemGateLineFailure } from "@/lib/lem-detail";
import { partitionGatePanel } from "@/lib/gate-panel-split";

/**
 * Gate panel — the ONE place the red send/accept gate message is written. Rendered by BOTH the
 * Quotes page (send AND accept blocks, WITH the "Edit in Pricer" footer) and the Project Pricer
 * "Send Quote" dialog (send only, NO footer).
 *
 * TWO sections (B1, poka-yoke): Section 1 is the BLOCKER — red, genuine blanks / no-entry lines only.
 * Section 2 is the ZEROS — plain grey, "nothing to fix": a typed zero is a decision the owner made,
 * not a mistake, so it is never scolded under the red headline. The split is presentational
 * (lib/gate-panel-split.ts); the gate logic decides what blocks, not this component.
 *
 * Presentational only: the parent owns the block state and passes the failures. Every user-visible
 * word of the gate panel lives here and nowhere else — the words get a chokepoint just like the send
 * RULE did (fence: gate-panel-copy). Do not fork this copy, and change a word here only in a commit
 * whose purpose is the wording.
 */
export interface GatePanelProps {
  /** The blocking failures to list (each line + its offending entries). */
  failures: LemGateLineFailure[];
  /** Which headline: "send" (a price can't reach a customer) or "accept" (can't become a Work Order). */
  variant: "send" | "accept";
  /** Show the "Use 'Edit in Pricer' below to fix these entries." footer. Quotes page passes true; the
   *  Pricer passes false (there is no "Edit in Pricer" control inside the Pricer). Explicit, never inferred. */
  showEditInPricerFooter: boolean;
  /** DECLARED flat-rate lines (Cause 3) — shown in the grey confirm section, not the red blocker box.
   *  A flat line is a zero, not a blank: the user said there is no labor/equipment/material behind it. */
  flatLines?: LemGateLineFailure[];
}

export default function GatePanel({ failures, variant, showEditInPricerFooter, flatLines }: GatePanelProps) {
  const { blockers, zeros, zeroCount } = partitionGatePanel(failures);
  const flats = flatLines || [];
  return (
    <>
      {/* SECTION 1 — the blocker. Red. Genuine blanks / no-entry lines only. Hidden when there are none
          (a flat-rate confirm can render this panel with no blockers). */}
      {blockers.length > 0 && (
      <div
        className="rounded-lg border p-3 text-left text-xs"
        style={{ borderColor: "#EB3300", color: "#9F1239", backgroundColor: "#FFF5F3" }}
      >
        <div className="font-medium mb-1.5" style={{ color: "#EB3300" }}>
          {variant === "send"
            ? "Can’t send yet — these lines have nothing priced behind them. Add the labor, equipment, or material, or mark the line a flat rate, before this price goes to the customer:"
            : "Can’t accept yet — fix these entries before this quote can become a Work Order:"}
        </div>
        <div className="space-y-1.5">
          {blockers.map(({ line, issues }, i) => (
            <div key={i}>
              <div className="font-medium">
                Line “{line.description}” — {line.noEntries ? "no LEM detail entered" : "incomplete entries:"}
              </div>
              {!line.noEntries && (
                <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                  {issues.map((is, j) => (
                    <li key={j}>{is.category}: {is.name} ({is.issue})</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        {showEditInPricerFooter && (
          <div className="mt-2 italic text-muted-foreground">Use “Edit in Pricer” below to fix these entries.</div>
        )}
      </div>
      )}

      {/* SECTION 2 — the zeros. Plain grey, below Section 1. A zero is a decision, not a defect. */}
      {zeroCount > 0 && (
        <div className="rounded-lg border p-3 text-left text-xs mt-2 text-muted-foreground">
          <div className="font-medium mb-1.5">
            Zeros in this quote — {zeroCount} {zeroCount === 1 ? "entry" : "entries"}. Nothing to fix.
          </div>
          <div className="mb-1.5">
            A zero means you chose not to use that man or machine on this job. It prints on the crew’s sheet that way. Change any of them if that’s not what you meant.
          </div>
          <div className="space-y-1.5">
            {zeros.map(({ line, issues }, i) => (
              <div key={i}>
                <div className="font-medium">
                  Line “{line.description}”:
                </div>
                <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                  {issues.map((is, j) => (
                    <li key={j}>{is.category}: {is.name} ({is.issue})</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3 — DECLARED flat-rate lines. Plain grey, in the confirm section (never the red box).
          A flat line is the user's decision that there is no labor, equipment, or material behind it. */}
      {flats.length > 0 && (
        <div className="rounded-lg border p-3 text-left text-xs mt-2 text-muted-foreground">
          <div className="font-medium mb-1.5">
            Flat-rate {flats.length === 1 ? "line" : "lines"} — {flats.length}. Nothing to fix.
          </div>
          <div className="mb-1.5">
            You marked {flats.length === 1 ? "this line" : "these lines"} as a flat rate — no labor, equipment, or material behind {flats.length === 1 ? "it" : "them"}. {flats.length === 1 ? "It prints" : "They print"} at the price shown. Change {flats.length === 1 ? "it" : "any of them"} if that’s not what you meant.
          </div>
          <div className="space-y-1.5">
            {flats.map((f, i) => (
              <div key={i} className="font-medium">Line “{f.description}”</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
