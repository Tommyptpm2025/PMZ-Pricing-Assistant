"use client";

import * as React from "react";
import type { LemGateLineFailure } from "@/lib/lem-detail";

/**
 * Gate panel — the ONE place the red send/accept gate message is written. Rendered by BOTH the
 * Quotes page (send AND accept blocks, WITH the "Edit in Pricer" footer) and the Project Pricer
 * "Send Quote" dialog (send only, NO footer). Presentational only: the parent owns the block state
 * and chooses the variant + footer. Every user-visible word of the gate panel lives here and nowhere
 * else — the words get a chokepoint just like the send RULE did (fence: gate-panel-copy). Do not fork
 * this copy, and do not change a word here except in a commit whose purpose is the wording.
 */
export interface GatePanelProps {
  /** The blocking failures to list (each line + its offending entries). */
  failures: LemGateLineFailure[];
  /** Which headline: "send" (a price can't reach a customer) or "accept" (can't become a Work Order). */
  variant: "send" | "accept";
  /** Show the "Use 'Edit in Pricer' below to fix these entries." footer. Quotes page passes true; the
   *  Pricer passes false (there is no "Edit in Pricer" control inside the Pricer). Explicit, never inferred. */
  showEditInPricerFooter: boolean;
}

export default function GatePanel({ failures, variant, showEditInPricerFooter }: GatePanelProps) {
  return (
    <div
      className="rounded-lg border p-3 text-left text-xs"
      style={{ borderColor: "#EB3300", color: "#9F1239", backgroundColor: "#FFF5F3" }}
    >
      <div className="font-medium mb-1.5" style={{ color: "#EB3300" }}>
        {variant === "send"
          ? "Can’t send yet — these entries have no hours or quantity behind them. Fix them before this price goes to the customer:"
          : "Can’t accept yet — fix these entries before this quote can become a Work Order:"}
      </div>
      <div className="space-y-1.5">
        {failures.map((f, i) => (
          <div key={i}>
            <div className="font-medium">
              Line “{f.description}” — {f.noEntries ? "no LEM detail entered" : "incomplete entries:"}
            </div>
            {!f.noEntries && (
              <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                {f.issues.map((is, j) => (
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
  );
}
