"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suggestCustomerMatches, type CustomerSuggestion } from "@/lib/customer-suggest";
import type { RegistryCustomer } from "@/lib/customer-resolve";

/**
 * CUSTOMER RESOLVE PANEL — the announcement for a quote that carries a customer NAME with no
 * customerId, and the two ways out of it.
 *
 * The two laws it is built from, together:
 *   • Law 82 — the system NEVER guesses which customer a name means. Suggestions are OPTIONS, ranked
 *     and reasoned (each shows the words it shares), and NOTHING here applies one on its own. No
 *     pre-selection, no "did you mean" that is already half-committed.
 *   • Law 50 — it never sits silent either. Before this panel, an unmatched name produced an EMPTY
 *     picker while the Quotes list happily printed the name: two screens disagreeing, neither saying
 *     why. It announces, and it offers both real paths.
 *
 * The paths:
 *   a. MATCH TO EXISTING — near-matches first (pure ranking, lib/customer-suggest.ts), then the whole
 *      list. Picking links the id. The quote's original name string is NEVER edited by this panel:
 *      it stays as provenance of what was written at the time.
 *   b. CREATE NEW CUSTOMER — seeded from the quote's name, EDITABLE before it is saved (the stored
 *      string is often the thing that needs fixing), then linked.
 *
 * Presentational: the parent owns the registry, the linking and the record creation, so each surface
 * keeps its own storage rules. Do not fork this — mount it wherever a customer fails to resolve.
 */
export interface CustomerResolvePanelProps {
  /** The unresolved name carried on the quote. The panel renders nothing if this is blank. */
  name: string;
  /** The customer registry to match against. */
  customers: RegistryCustomer[];
  /** Link this existing customer to the quote. Called ONLY from a human click. */
  onLink: (customer: { id: string; name: string }) => void;
  /** Create a customer with this (possibly edited) company name and link it. */
  onCreate: (companyName: string) => void;
  disabled?: boolean;
}

export default function CustomerResolvePanel({
  name,
  customers,
  onLink,
  onCreate,
  disabled,
}: CustomerResolvePanelProps) {
  const [mode, setMode] = React.useState<"closed" | "match" | "create">("closed");
  const [draftName, setDraftName] = React.useState(name);

  // Re-seed the create-form draft whenever the unresolved name changes (a different quote loaded).
  React.useEffect(() => {
    setDraftName(name);
    setMode("closed");
  }, [name]);

  const trimmed = (name || "").trim();
  const suggestions: CustomerSuggestion[] = React.useMemo(
    () => suggestCustomerMatches(trimmed, customers),
    [trimmed, customers]
  );
  // Everything the suggestions did not already offer, so "the whole list" never repeats a row.
  const rest = React.useMemo(() => {
    const shown = new Set(suggestions.map((s) => s.id));
    return (customers || [])
      .filter((c) => c && c.id && !shown.has(c.id))
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [customers, suggestions]);

  if (!trimmed) return null;

  const row = (id: string, label: string, sub?: React.ReactNode) => (
    <button
      key={id}
      type="button"
      disabled={disabled}
      onClick={() => onLink({ id, name: label })}
      className="flex w-full items-baseline justify-between gap-2 rounded border bg-white px-2 py-1.5 text-left text-xs hover:bg-[#FFF5F3] disabled:opacity-60"
      style={{ borderColor: "#F0C9BF" }}
    >
      <span className="font-medium text-foreground">{label}</span>
      {sub}
    </button>
  );

  return (
    <div
      className="mt-1.5 rounded-lg border p-2.5 text-left text-xs"
      style={{ borderColor: "#EB3300", color: "#9F1239", backgroundColor: "#FFF5F3" }}
    >
      <div className="font-medium" style={{ color: "#EB3300" }}>
        “{trimmed}” isn’t in your customer list.
      </div>
      <div className="mt-1">
        This quote carries the name only — no customer record is linked, so addresses and contacts
        can’t follow it. Match it to the right customer, or create one. Nothing is chosen for you.
      </div>

      {mode === "closed" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={disabled}
            onClick={() => setMode("match")}
          >
            Match to existing
          </Button>
          <Button
            size="sm"
            className="h-7 px-2 text-xs font-semibold text-white"
            style={{ backgroundColor: "#EB3300" }}
            disabled={disabled}
            onClick={() => { setDraftName(trimmed); setMode("create"); }}
          >
            Create new customer
          </Button>
        </div>
      )}

      {mode === "match" && (
        <div className="mt-2 space-y-2">
          {suggestions.length > 0 ? (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider opacity-70">
                Closest matches — suggestions only, nothing is applied until you pick one
              </div>
              {suggestions.map((s) =>
                row(
                  s.id,
                  s.name,
                  <span className="shrink-0 opacity-70">shares: {s.sharedWords.join(", ")}</span>
                )
              )}
            </div>
          ) : (
            <div className="text-[11px] opacity-80">
              No customer shares a word with this name — pick from the full list below, or create one.
            </div>
          )}
          {rest.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider opacity-70">
                {suggestions.length > 0 ? "All other customers" : "All customers"}
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {rest.map((c) => row(c.id, c.name || ""))}
              </div>
            </div>
          )}
          <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setMode("closed")}>
            Cancel
          </Button>
        </div>
      )}

      {mode === "create" && (
        <div className="mt-2 space-y-2">
          <div className="text-[11px] uppercase tracking-wider opacity-70">
            Company name — edit it before saving if the quote has it wrong
          </div>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="h-8 bg-white text-sm"
            placeholder="Company name"
            disabled={disabled}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="h-7 px-2 text-xs font-semibold text-white"
              style={{ backgroundColor: "#EB3300" }}
              disabled={disabled || draftName.trim() === ""}
              onClick={() => onCreate(draftName.trim())}
            >
              Create &amp; link
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setMode("closed")}>
              Cancel
            </Button>
            {draftName.trim() === "" && (
              <span className="text-[11px] opacity-80">A customer is filed under a company name.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
