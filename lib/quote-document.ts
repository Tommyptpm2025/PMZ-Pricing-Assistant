// Customer document mapping — the EPP estimate → normalized quote shape rendered by
// QuotePreview (on-screen) and QuotePdfDocument (PDF).
//
// WHY THIS LIVES IN lib/: this mapping is the Law 56 price path — what the customer document
// prints must equal what the system persisted. It was previously a closure inside
// app/project-pricer/page.tsx, which meant the fence could only pin its call sites by reading
// source text; it could not EXECUTE the real function. Extracted here so
// scripts/quote-document-fence.test.mjs runs the actual mapping over fixtures.
//
// Component state the closure used to capture is now passed explicitly via QuoteDocumentDeps.
// The clock is injectable (`now` / `quoteNumber`) so the fence is deterministic; both default
// to the original inline behavior, so the component's output is unchanged.

// Relative (not "@/") so the plain-node fence scripts can load this via ts-ext-resolver.
import { buildLineLemDetail, type LemRateCatalogs } from "./lem-detail";
import { eppLineTotal, eppTotalRevenue } from "./epp-line";
import { formatMoney } from "./format";
import {
  changeOrderDocumentLines,
  changeOrderDocumentTotal,
  type ChangeOrder,
} from "./change-orders";

export interface QuoteDocumentDeps {
  /** The live estimate — fallback source for header fields and bid items. */
  estimate: any;
  /** Selected customer registry record (may be null). */
  currentCustomer: any;
  /** Estimator Registry — resolves the stored estimator NAME to title/email/phone. */
  estimators: any[];
  /** Rate catalogs for resolving the per-line LEM breakdown (names/UOM/rates via rateId). */
  lemCats: LemRateCatalogs;
  /** EPP gross profit dollars (owner-facing; not printed on the customer document). */
  grossProfit: number;
  /** Injectable clock — defaults to now. */
  now?: Date;
  /** Injectable quote number — defaults to the last 7 digits of the epoch. */
  quoteNumber?: string;
  /**
   * The change-order store (any list — this mapping filters it). Only the QUOTED ones belonging to
   * THIS quote print, and only as description + price; lib/change-orders.ts owns that rule so no
   * document surface can widen it. Omitted ⇒ nothing to add, and the document is byte-identical to
   * what it was before change orders existed.
   */
  changeOrders?: ChangeOrder[];
}

/** Format a customer address object into non-empty display lines (street, street2, "City, ST ZIP"). */
export function formatAddressLines(addr: any): string[] {
  if (!addr) return [];
  if (typeof addr === "string") return addr.trim() ? [addr.trim()] : [];
  const cityStateZip = [
    [addr.city, addr.state].filter(Boolean).join(", "),
    addr.zip,
  ].filter(Boolean).join(" ");
  return [addr.street, addr.street2, cityStateZip]
    .map((l) => (l || "").toString().trim())
    .filter(Boolean);
}

// Single normalized customer block used by BOTH the on-screen preview and the PDF, built from the
// selected customer record. "Same as billing" is derived (no persisted flag): the saved jobSite is a
// copy of billing when same. Empty fields stay empty (callers suppress empty blocks). Internal-only
// `notes` is deliberately never included.
export function buildCustomerBlock(currentCustomer: any, estimate: any) {
  const c: any = currentCustomer || {};
  const billing = c.billingAddress || {};
  const job = c.jobSiteAddress || {};
  const hasJob = !!(job.street || job.street2 || job.city || job.state || job.zip || job.accessNotes || job.latitude != null || job.longitude != null);
  const jobSiteSameAsBilling = !hasJob || (
    (billing.street || "") === (job.street || "") &&
    (billing.street2 || "") === (job.street2 || "") &&
    (billing.city || "") === (job.city || "") &&
    (billing.state || "") === (job.state || "") &&
    (billing.zip || "") === (job.zip || "")
  );
  const block = {
    name: c.name || estimate?.customerName || "",
    billToLines: formatAddressLines(billing),
    jobSiteSameAsBilling,
    jobSiteLines: jobSiteSameAsBilling ? formatAddressLines(billing) : formatAddressLines(job),
    contact: {
      name: c.contactName || "",
      title: c.title || "",
      phone: c.phone || "",
      mobile: c.mobile || "",
      email: c.email || "",
    },
    accessNotes: job.accessNotes || "",
    gps: (job.latitude != null && job.longitude != null) ? `${job.latitude}, ${job.longitude}` : "",
  };
  return block;
}

/** Shared adapter: turns EPP estimate data into the normalized quote shape for QuotePreview. */
export function buildQuoteDocument(source: any, deps: QuoteDocumentDeps) {
  const { estimate, currentCustomer, estimators, lemCats, grossProfit } = deps;
  const s = source || {};
  const bidItems = s.bidItems || estimate.bidItems || [];
  // THE BID LINES, and only the bid lines. Change orders live in their own section below and are
  // never mixed in here — the original contract must always read on the page exactly as it was signed.
  const lineItems = bidItems.map((item: any) => {
    const qty = Number(item.quantity || 0);
    // Law 56 — ONE PRICE PATH. The customer document prints the QUOTED price: the same
    // numbers the worksheet shows and save persists, via lib/epp-line. The Golden Formula
    // recommendation is owner-facing coaching only and never reaches this document.
    // A directly-entered line total is already encoded in unitPrice (Line Total / Qty at
    // entry, page.tsx:2588-2589), so qty x unitPrice reproduces it exactly. Printed ===
    // persisted: no presentation-only rounding anywhere on the customer document.
    const unitPrice = Number(item.unitPrice || 0);
    const lineTotal = eppLineTotal(item);
    return {
      description: item.description || "—",
      qty,
      unit: item.unit || "",
      unitPrice,
      lineTotal,
      lemDetail: buildLineLemDetail(item, lemCats),
    };
  });
  // Same helper the worksheet total and the save path use — the printed BID total is byte-identical
  // to the persisted totalRevenue by construction, not by coincidence.
  const bidTotal = eppTotalRevenue(bidItems);

  // ── CHANGE ORDERS: THEIR OWN SECTION, AFTER THE BID LINES ─────────────────────────────────────
  // Extra work the customer already agreed to. It gets a TITLED SECTION of its own rather than being
  // crammed into the bid table, because that is what it actually is: a second conversation, held
  // after the bid was struck, on a date, about a specific thing. One row per order — what it was and
  // when, in plain words — and the price that was quoted.
  //
  // The bid lines are NOT touched. A change order is never mixed in among them, so the original
  // contract can always be read on the page exactly as it was signed.
  //
  // lib/change-orders.ts decides WHICH ones may print (quoted only — never a pending one, never a
  // declined one, never one converted to new scope) and hands back title, plain-words description and
  // amount, so no cost, rate, margin or resource math can reach this document through here.
  //
  // LAW 56 STILL HOLDS, precisely stated: the BID total still equals the persisted totalRevenue
  // exactly, and it is printed under its own label. The document's CONTRACT TOTAL is that bid total
  // plus the change orders the customer was already quoted — which is what they owe. Three labeled
  // numbers instead of one bare TOTAL, because a customer who sees a total that is not the number
  // they signed deserves to see, on the same page, exactly where the difference came from.
  const changeOrders = changeOrderDocumentLines(deps.changeOrders || [], s.id || estimate?.id);
  const changeOrderTotal = changeOrderDocumentTotal(changeOrders);
  const hasChangeOrders = changeOrders.length > 0;
  // NO PRESENTATION ROUNDING ON THE PRICE PATH (Law 56). With nothing to add, the total is the bid
  // total ITSELF — the same value, not an arithmetic result that happens to match — so a quote whose
  // lines total to a sub-cent amount still prints exactly what was persisted. (An earlier draft of
  // this line rounded the sum to the cent and printed $344.43 for a persisted $344.425; the fence
  // caught it. Rounding belongs where a VALUE is created, never where one is displayed.)
  const total = changeOrderTotal === 0 ? bidTotal : bidTotal + changeOrderTotal;
  // Resolve the selected estimator's full record (Tier B token source). The quote stores the
  // estimator NAME (mirrors salesperson); title/email/phone come from the Estimator Registry.
  const estimatorName = s.estimator || estimate.estimator || "";
  const estimatorRec = estimators.find((e: any) => e.name === estimatorName);

  // Tier B token sources from the customer registry record + addresses. Project tokens use the
  // job-site address, falling back to billing when no separate job site is set.
  const cust: any = currentCustomer || {};
  const billing: any = cust.billingAddress || {};
  const job: any = cust.jobSiteAddress || {};
  const hasJob = !!(job.street || job.street2 || job.city || job.state || job.zip);
  const projAddr: any = hasJob ? job : billing;
  const streetOf = (a: any) => [a.street, a.street2].filter(Boolean).join(", ");
  const cityStateZipOf = (a: any) => {
    const left = [a.city, a.state].filter(Boolean).join(", ");
    return [left, a.zip].filter(Boolean).join(" ").trim();
  };
  const customerName = cust.name || estimate.customerName || "";
  const projectName = s.jobName || estimate.jobName || "";
  const quoteDate = (deps.now ?? new Date()).toLocaleDateString();
  const quoteNumber = deps.quoteNumber ?? Date.now().toString().slice(-7);
  // Customer-facing amounts print to the cent (Law 57) so the document ties to the quote.
  const moneyDoc = (n: number) => formatMoney(n || 0);
  const quoteTotalDisplay = moneyDoc(total);
  const sectionLabel = s.workTypeName || s.workType || estimate.workTypeName || "";

  return {
    jobName: s.jobName || estimate.jobName || "—",
    customer: buildCustomerBlock(currentCustomer, estimate),
    workType: s.workTypeName || s.workType || estimate.workTypeName || "",
    salesperson: s.salesperson || estimate.salesperson || "",
    estimator: estimatorName,
    date: quoteDate,
    quoteNumber,
    status: s.status || "EPP",
    lineItems,
    total,
    // The change-order section, and both halves of the contract total — the bid exactly as persisted,
    // and what the quoted change orders added. A renderer shows the three-row money story when there
    // are change orders and the single bare TOTAL when there are none; `hasChangeOrders` is that one
    // decision, made here, so the preview and the PDF can never disagree about which story to tell.
    changeOrders,
    hasChangeOrders,
    bidTotal,
    changeOrderTotal,
    grossProfit,
    // Tier B token context — estimator (Step 2) + customer/project/quote/acceptance (Step 3).
    // Line-item / section tokens come in Step 4; rendering into T&C / Payment Terms in Steps 5–6.
    tokenContext: {
      estimator: {
        name: estimatorName,
        title: estimatorRec?.title || "",
        email: estimatorRec?.email || "",
        phone: estimatorRec?.phone || "",
      },
      customer: {
        name: customerName,
        address: streetOf(billing),
        city_state_zip: cityStateZipOf(billing),
        email: cust.email || "",
        phone: cust.phone || cust.mobile || "",
      },
      project: {
        name: projectName,
        address: streetOf(projAddr),
        city_state_zip: cityStateZipOf(projAddr),
      },
      quote: {
        date: quoteDate,
        number: quoteNumber,
        total: quoteTotalDisplay,
      },
      // Blank signature/date lines for the customer to complete on the printed document.
      acceptance: {
        signed_by: "",
        date: "",
      },
      // Repeating tokens (line_item.* / section.*) — array data for table / templated rendering.
      // resolveTokens leaves these literal in free text by design; they iterate, not interpolate.
      // EPP has one work type per estimate, so a single section = the work type + grand total.
      lineItems: lineItems.map((li: any) => ({
        description: li.description,
        amount: moneyDoc(li.lineTotal),
      })),
      sections: [
        { label: sectionLabel, amount: quoteTotalDisplay },
      ],
    },
  };
}
