"use client";

import * as React from "react";
import { STATUS_COLORS } from "@/lib/pmz-types";
import { useCompanySettings } from "@/lib/company-settings";
import { resolveTokens, buildTokenValues } from "@/lib/document-tokens";
import { TC_SECTIONS } from "@/lib/document-blocks";

interface QuotePreviewProps {
  quote: any; // accepts normalized object from buildQuoteData (or legacy shape)
  onClose?: () => void;
  onExportPDF?: () => void;
}

function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "0.00";
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Whole-dollar formatter (no cents) for customer-facing line/grand totals.
function formatWhole(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "0";
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function QuotePreview({ quote, onClose, onExportPDF }: QuotePreviewProps) {
  const q = quote || {};
  // Company identity (Tier A) — global, read directly so it stays out of the per-quote
  // print-window handoff. Header falls back to the PMZ/TPM wordmark when setup is empty.
  const { settings: company } = useCompanySettings();
  const co = company.company;
  const headerName = co.legal_name.trim() || "Profit Margin Zone";
  const headerSubtitle = co.short_name.trim() || (co.legal_name.trim() ? "" : "Total Profit Management");
  // Tier B token context assembled by buildQuoteData (estimator/customer/project/quote/acceptance).
  const tokenContext = q.tokenContext || null;
  // Quote/Estimate label — the export toggle drives the document title and every label reference.
  const docLabel = q.exportType === 'estimate' ? 'Estimate' : 'Quote';
  // Inject the label as a token (lowercase for mid-sentence prose, e.g. "...accept this quote").
  // It's render-time (exportType), so it's added here rather than in buildQuoteData, and used by
  // BOTH the completeness gate and resolution so {{quote.label}} always resolves.
  const docTokenContext = {
    ...(tokenContext || {}),
    quote: { ...((tokenContext && tokenContext.quote) || {}), label: docLabel.toLowerCase() },
  };
  // Token values for per-section completeness checks in the Terms & Conditions block.
  const tokenValues = buildTokenValues(company, docTokenContext);
  // A T&C section is "ready" when every token it references resolves to a non-empty value.
  // Incomplete sections show an amber owner note in preview and are omitted from print (never blanks).
  const sectionReady = (body: string) => {
    const matches = body.match(/\{\{\s*[a-z_]+\.[a-z_]+\s*\}\}/gi) || [];
    return matches.every((m) => {
      const path = m.replace(/[{}]/g, "").trim().toLowerCase();
      return (tokenValues[path] ?? "").toString().trim() !== "";
    });
  };
  const options = q.options || {};
  const showQuantities = options.showQuantities !== false;
  const showUnits = options.showUnits !== false;
  const showPerUnitPrice = options.showPerUnitPrice !== false;
  const showLineItemPrices = options.showLineItemPrices !== false;
  const showBillTo = options.showBillTo !== false;
  const showJobSite = options.showJobSite !== false;
  const showPrimaryContact = options.showPrimaryContact !== false;
  const showAccessNotes = !!options.showAccessNotes;
  const showGPS = !!options.showGPS;
  const showLemDetail = !!options.showLemDetail;

  // Support normalized shape from buildQuoteData(source) for EPP (uses customer obj, qty, lineTotal, jobName, total, etc.)
  // Falls back gracefully for legacy shapes.
  const customer = q.customer || {};
  const lineItemsRaw = q.lineItems || [];
  const lineItems = lineItemsRaw.map((item: any) => {
    const qty = item.qty !== undefined ? item.qty : (item.quantity || 0);
    const unitPrice = item.unitPrice || 0;
    const lineTotal = item.lineTotal !== undefined ? item.lineTotal : (qty * unitPrice);
    return {
      description: item.description || "—",
      quantity: qty,
      unit: item.unit || "",
      unitPrice,
      lineTotal,
      lemDetail: item.lemDetail || null,
    };
  });
  const grandTotal = q.total !== undefined
    ? q.total
    : lineItems.reduce((s: number, it: any) => s + ((it.quantity || 0) * (it.unitPrice || 0)), 0);

  const termsText = q.termsText || null;
  // Company logo (from the Update Export dialog). Shown in place of the brand wordmark when set —
  // matches the PDF header behavior so the on-screen preview is no longer logo-blind.
  const logoDataUrl = q.logoDataUrl || null;

  // Status badge for the document — clean customer-facing label, with the shared lifecycle zone
  // color (STATUS_COLORS) as the accent so the document pill matches the app's status pills.
  const STATUS_LABELS: Record<string, string> = {
    "Draft": "Draft",
    "Ready for Approval": "Awaiting acceptance",
    "Approved": "Accepted",
    "Declined": "Declined",
    "Lost": "Lost",
    "In Progress": "In progress",
    "Completed": "Completed",
    "Ready to Invoice": "Ready to invoice",
    "Invoiced": "Invoiced",
    "Paid": "Paid",
  };
  const statusLabel = STATUS_LABELS[q.status as string] || null;
  // Outlined pill: text + border use the zone background hex (saturated enough to read on white).
  const statusColor = STATUS_COLORS[q.status as string]?.bg || "#7D1424";

  // Customer block (normalized by buildCustomerBlock): full address lines, contact, access, gps.
  const billToLines: string[] = Array.isArray(customer.billToLines) ? customer.billToLines : [];
  const jobSiteLines: string[] = Array.isArray(customer.jobSiteLines) ? customer.jobSiteLines : [];
  const jobSiteSameAsBilling = !!customer.jobSiteSameAsBilling;
  const contact = customer.contact || {};
  const contactNameTitle = [contact.name, contact.title].filter(Boolean).join(', ');
  const access = customer.accessNotes || "";
  const gps = customer.gps || "";

  // Scale the full-page preview to fit narrow screens (phones) using transform scale
  const PAGE_WIDTH = 816; // US Letter width in px
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const updateScale = () => {
      const avail = window.innerWidth * 0.92; // leave a bit margin
      setScale(Math.min(1, avail / PAGE_WIDTH));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return (
    <div className="bg-white text-black w-full max-w-full box-border">
      {/* Print rules: full letter page, 0.5in margins, sheet fills the printable width
          (drop the on-screen fixed width / scale / shadow / gray backdrop when printing). */}
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          html, body { background: #fff !important; }
          .pmz-print-wrap { background: #fff !important; padding: 0 !important; overflow: visible !important; }
          .pmz-print-center { display: block !important; }
          .pmz-print-sheet {
            width: 100% !important;
            transform: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Logo never oversized in print */
          .pmz-logo { max-height: 42px !important; height: auto !important; width: auto !important; }
          /* Table header: drop the gray fill for print */
          .pmz-thead { background: #fff !important; }
          /* Keep each bid line and its LEM detail together on one page */
          .pmz-line { page-break-inside: avoid; break-inside: avoid; }
          /* Level 1 — bid line typography */
          .pmz-bid-row > div { font-size: 10pt !important; font-weight: 600 !important; color: #212322 !important; }
          /* Document blocks — TO / PROJECT / Terms at 9pt */
          .pmz-doc div, .pmz-terms div { font-size: 9pt !important; }
          /* TOTAL row */
          .pmz-total > div { font-size: 11pt !important; font-weight: 700 !important; color: #212322 !important; }
          /* LEM detail: swap the on-screen text block for the aligned columnar block */
          .pmz-lem-screen { display: none !important; }
          .pmz-lem-print { display: block !important; }
        }
      `}</style>
      {/* Top control bar - kept for buttons */}
      <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b print:hidden bg-white sticky top-0 z-10 text-sm sm:text-base">
        <div className="font-medium text-gray-700 pr-2 truncate flex-1 min-w-0">
          {docLabel} Preview — Print or Save as PDF
        </div>
        <div className="flex gap-1 sm:gap-2 flex-shrink-0">
          {onClose && (
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          )}
          <button
            onClick={() => {
              if (onExportPDF) {
                onExportPDF();
              }
            }}
            className="inline-flex items-center justify-center rounded-md bg-black px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-gray-800"
          >
            Print / Export PDF
          </button>
        </div>
      </div>

      {/* Full-page document preview, matching the PDF layout exactly.
          White sheet, letter width, centered on wide screens, scaled on narrow. */}
      <div className="pmz-print-wrap" style={{ width: '100%', overflow: 'hidden', background: '#f3f3f3', padding: '8px 0' }}>
        <div className="pmz-print-center" style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            className="pmz-print-sheet"
            style={{
              width: `${PAGE_WIDTH}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              marginBottom: scale < 1 ? `-${PAGE_WIDTH * (1 - scale)}px` : 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              backgroundColor: '#fff',
              color: '#111',
              fontFamily: 'Helvetica, Arial, system-ui, sans-serif',
              fontSize: '10px',
              lineHeight: 1.3,
              boxSizing: 'border-box',
              padding: '40px',
            }}
          >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #111' }}>
            <div style={{ maxWidth: '60%' }}>
              {logoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pmz-logo" src={logoDataUrl} alt="Company logo" style={{ height: 32, width: 'auto', display: 'block', marginBottom: 4 }} />
              )}
              <div style={{ fontSize: 14, fontWeight: 'bold' }}>{headerName}</div>
              {headerSubtitle && <div style={{ fontSize: 8, color: '#555' }}>{headerSubtitle}</div>}
              {(co.address.trim() || co.city_state_zip.trim()) && (
                <div style={{ fontSize: 8, color: '#555', marginTop: 3 }}>
                  {co.address.trim() && <div>{co.address}</div>}
                  {co.city_state_zip.trim() && <div>{co.city_state_zip}</div>}
                </div>
              )}
              {(co.phone.trim() || co.email.trim()) && (
                <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
                  {co.phone.trim()}
                  {co.phone.trim() && co.email.trim() && ' · '}
                  {co.email.trim()}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: 9 }}>
              {docLabel} #{q.quoteNumber || Date.now().toString().slice(-7)}<br />
              {q.date || new Date().toLocaleDateString()}
              {statusLabel && (
                <div style={{ marginTop: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 8,
                      fontWeight: 'bold',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: statusColor,
                      border: `1px solid ${statusColor}`,
                      borderRadius: 3,
                      padding: '1px 5px',
                    }}
                  >
                    {statusLabel}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Title - centered QUOTE */}
          <div style={{ fontSize: 28, fontWeight: 'bold', textAlign: 'center', margin: '10px 0', letterSpacing: 2 }}>
            {docLabel.toUpperCase()}
          </div>

          {/* Customer / Project columns — two equal-width columns with a fixed gutter:
              customer (bill-to + contact) on the left, project + job site on the right. */}
          <div className="pmz-doc" style={{ display: 'flex', gap: 24, marginBottom: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2, color: '#444', textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</div>
              {customer.name && <div style={{ fontSize: 10, marginBottom: 1 }}>{customer.name}</div>}
              {showBillTo && billToLines.map((ln, i) => (
                <div key={`bt${i}`} style={{ fontSize: 10, marginBottom: 1 }}>{ln}</div>
              ))}
              {showPrimaryContact && contactNameTitle && (
                <div style={{ fontSize: 10, marginBottom: 1 }}>Contact: {contactNameTitle}</div>
              )}
              {showPrimaryContact && contact.phone && <div style={{ fontSize: 10, marginBottom: 1 }}>Phone: {contact.phone}</div>}
              {showPrimaryContact && contact.mobile && <div style={{ fontSize: 10, marginBottom: 1 }}>Mobile: {contact.mobile}</div>}
              {showPrimaryContact && contact.email && <div style={{ fontSize: 10, marginBottom: 1 }}>Email: {contact.email}</div>}
              {showAccessNotes && access && (
                <div style={{ fontSize: 9, color: '#555' }}>Access: {access}</div>
              )}
              {showGPS && gps && (
                <div style={{ fontSize: 9, color: '#555' }}>GPS: {gps}</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2, color: '#444', textTransform: 'uppercase', letterSpacing: 0.5 }}>Project / Job Site</div>
              <div style={{ fontSize: 10, marginBottom: 1 }}>{q.jobName || '—'}</div>
              <div style={{ fontSize: 10, marginBottom: 1 }}>Sales Rep: {q.salesperson || '—'}</div>
              <div style={{ fontSize: 10, marginBottom: 1 }}>Estimator: {q.estimator || '—'}</div>
              {showJobSite && jobSiteLines.length > 0 && (
                <div style={{ fontSize: 10, marginTop: 4, fontWeight: 'bold' }}>Job Site{jobSiteSameAsBilling ? ' (same as billing)' : ''}:</div>
              )}
              {showJobSite && jobSiteLines.map((ln, i) => (
                <div key={`js${i}`} style={{ fontSize: 10, marginBottom: 1 }}>{ln}</div>
              ))}
            </div>
          </div>

          {/* Line Items Table - full columns, matching PDF */}
          <div style={{ width: '100%', marginBottom: 12 }}>
            <div className="pmz-thead" style={{ display: 'flex', backgroundColor: '#f5f5f5', borderBottom: '1px solid #111' }}>
              <div style={{ padding: 6, fontSize: 9, fontWeight: 'bold', borderRight: '0.5px solid #999', flexBasis: '40%' }}>Description</div>
              {showQuantities && <div style={{ padding: 6, fontSize: 9, fontWeight: 'bold', borderRight: '0.5px solid #999', flexBasis: '10%', textAlign: 'right' }}>Qty</div>}
              {showUnits && <div style={{ padding: 6, fontSize: 9, fontWeight: 'bold', borderRight: '0.5px solid #999', flexBasis: '10%', textAlign: 'center' }}>Unit</div>}
              {showPerUnitPrice && <div style={{ padding: 6, fontSize: 9, fontWeight: 'bold', borderRight: '0.5px solid #999', flexBasis: '15%', textAlign: 'right' }}>Unit Price</div>}
              {showLineItemPrices && <div style={{ padding: 6, fontSize: 9, fontWeight: 'bold', borderRight: '0.5px solid #999', flexBasis: '15%', textAlign: 'right' }}>Line Total</div>}
            </div>
            {lineItems.length > 0 ? lineItems.map((item: any, idx: number) => {
              const lt = item.lineTotal !== undefined ? item.lineTotal : (item.quantity || 0) * (item.unitPrice || 0);
              const lemOn = showLemDetail && item.lemDetail && item.lemDetail.hasAny;
              return (
                <div className="pmz-line" key={idx}>
                  <div className="pmz-bid-row" style={{ display: 'flex', borderBottom: lemOn ? 'none' : '0.5px solid #ccc' }}>
                    <div style={{ padding: 5, fontSize: 9, borderRight: '0.5px solid #ccc', flexBasis: '40%' }}>{item.description || '—'}</div>
                    {showQuantities && <div style={{ padding: 5, fontSize: 9, borderRight: '0.5px solid #ccc', flexBasis: '10%', textAlign: 'right' }}>{item.quantity || 0}</div>}
                    {showUnits && <div style={{ padding: 5, fontSize: 9, borderRight: '0.5px solid #ccc', flexBasis: '10%', textAlign: 'center' }}>{item.unit || ''}</div>}
                    {showPerUnitPrice && <div style={{ padding: 5, fontSize: 9, borderRight: '0.5px solid #ccc', flexBasis: '15%', textAlign: 'right' }}>${formatMoney(item.unitPrice || 0)}</div>}
                    {showLineItemPrices && <div style={{ padding: 5, fontSize: 9, borderRight: '0.5px solid #ccc', flexBasis: '15%', textAlign: 'right' }}>${formatWhole(lt)}</div>}
                  </div>
                  {lemOn && (
                    <>
                      {/* On-screen: the existing plain-text breakdown (unchanged) */}
                      <div className="pmz-lem-screen" style={{ padding: '4px 6px 6px 14px', borderBottom: '0.5px solid #ccc', backgroundColor: '#fafafa' }}>
                        {item.lemDetail.sections.map((sec: any, sIdx: number) => (
                          <div key={sIdx} style={{ marginBottom: 3 }}>
                            <div style={{ fontSize: 8, fontWeight: 'bold', color: '#444', textTransform: 'uppercase', letterSpacing: 0.3 }}>{sec.title}</div>
                            {sec.rows.map((row: any, rIdx: number) => (
                              <div key={rIdx} style={{ fontSize: 8, color: '#555', paddingLeft: 8 }}>{row.text}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                      {/* Print-only: aligned 4-column table (Type/Name 50% | Qty 15% | Rate 20% | Cost 15%) */}
                      <div className="pmz-lem-print" style={{ display: 'none', padding: '3px 6px 6px 14px', borderBottom: '0.5px solid #ccc' }}>
                        {item.lemDetail.sections.map((sec: any, sIdx: number) => (
                          <div key={sIdx} style={{ marginBottom: 4 }}>
                            {sec.isCrew ? (
                              // Level 2 — crew subheader: maroon, bold, small caps, separator line above
                              <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#7D1424', textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '0.5px solid #ccc', paddingTop: 2, marginTop: 2 }}>{sec.title}</div>
                            ) : (
                              // Section label: small caps, muted, no bold
                              <div style={{ fontSize: '8pt', fontWeight: 400, color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{sec.title}</div>
                            )}
                            {sec.rows.map((row: any, rIdx: number) => (
                              // Level 3 — LEM rows: lighter, smaller, aligned columns
                              <div key={rIdx} style={{ display: 'flex', fontSize: '8pt', fontWeight: 400, color: '#555555', lineHeight: 1.4 }}>
                                <div style={{ flexBasis: '50%', paddingLeft: 8 }}>{row.name}</div>
                                <div style={{ flexBasis: '15%', textAlign: 'right' }}>{row.qty}</div>
                                <div style={{ flexBasis: '20%', textAlign: 'right' }}>{row.rate}</div>
                                <div style={{ flexBasis: '15%', textAlign: 'right' }}>{row.cost}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            }) : (
              <div style={{ display: 'flex' }}>
                <div style={{ padding: 5, fontSize: 9, borderRight: '0.5px solid #ccc', width: '100%' }}>No line items</div>
              </div>
            )}
          </div>

          {/* TOTAL row */}
          <div className="pmz-total" style={{ display: 'flex', marginTop: 4, borderTop: '1px solid #111', paddingTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', flexBasis: '70%' }}>TOTAL</div>
            <div style={{ fontSize: 11, fontWeight: 'bold', textAlign: 'right', flexBasis: '30%' }}>${formatWhole(grandTotal)}</div>
          </div>

          {/* Terms & Conditions — six tokenized sections (Payment Terms is section 1, folded in
              from Step 5). Each section renders when its tokens are complete; an incomplete section
              shows an amber owner note in preview and is omitted from print (never blanks). The Lien
              Notice carries an "Attorney review required" amber badge (owner-facing, preview only). */}
          <div className="pmz-terms" style={{ marginTop: 16, fontSize: 9, color: '#555' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Terms &amp; Conditions</div>
            {TC_SECTIONS.map((sec, i) => {
              const ready = sectionReady(sec.body);
              return (
                <div key={sec.id} className={ready ? undefined : "print:hidden"} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: 2 }}>
                    {i + 1}. {sec.title}
                    {sec.attorneyReview && (
                      <span
                        className="print:hidden"
                        style={{ marginLeft: 6, fontSize: 8, fontWeight: 'bold', color: '#92400E', backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: 0.3 }}
                      >
                        Attorney review required
                      </span>
                    )}
                  </div>
                  {ready ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{resolveTokens(sec.body, { company, quote: docTokenContext })}</div>
                  ) : (
                    <div style={{ color: '#92400E', backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 4, padding: '6px 8px' }}>
                      <span style={{ fontWeight: 'bold' }}>⚠ </span>
                      Complete Company Setup to generate this section.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {termsText && (
            <div className="pmz-terms" style={{ marginTop: 16, fontSize: 9, color: '#555' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional Terms</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{termsText}</div>
            </div>
          )}

          {/* footer */}
          <div style={{ marginTop: 24, fontSize: 8, color: '#555', textAlign: 'center' }}>
            This document is a {docLabel.toLowerCase()}. Thank you for your business.
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
