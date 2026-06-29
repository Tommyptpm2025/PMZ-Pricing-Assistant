"use client";

/**
 * QuotePdfDocument — Build E PDF renderer.
 *
 * A true vector PDF of the customer-facing quote/estimate, drawn with @react-pdf/renderer
 * (its own Yoga/flexbox layout engine). This is NOT browser-rendered HTML, so:
 *   - text is drawn as PDF text runs → nothing for browser/extension auto-linkifiers to
 *     hijack (the teal/blue T&C bug is structurally impossible here; charcoal stays charcoal);
 *   - pagination is deterministic (real page model + wrap control), no stray pages.
 *
 * The on-screen preview (components/QuotePreview.tsx) stays the source of visual truth — this
 * component mirrors its data extraction and layout, rebuilt in React-PDF primitives. It is a
 * SEPARATE render path; the preview is untouched.
 *
 * Rendered via pdf(<QuotePdfDocument .../>).toBlob() — OUTSIDE the React tree — so it takes no
 * hooks. Company settings (normally from useCompanySettings) are passed in as a prop by the
 * caller; the quote is the normalized object from buildQuoteData plus the export options.
 */

import * as React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { CompanySettings } from "@/lib/company-settings";
import { STATUS_COLORS } from "@/lib/pmz-types";
import { resolveTokens, buildTokenValues } from "@/lib/document-tokens";
import { TC_SECTIONS } from "@/lib/document-blocks";
import { formatPhone } from "@/lib/phone";

interface QuotePdfDocumentProps {
  /** Normalized object from buildQuoteData + options/logoDataUrl/exportType/termsText/status. */
  quote: any;
  /** Tier A company settings (passed in — this renders outside React so no hooks). */
  company: CompanySettings;
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

// Clean customer-facing lifecycle labels (mirrors QuotePreview).
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

// Charcoal is the document body color. In a real PDF there is no browser auto-linkification to
// fight, so a plain color is final — no -webkit-text-fill-color override needed.
const CHARCOAL = "#333";

const styles = StyleSheet.create({
  // 0.5in (36pt) page margin — matches the print geometry the preview targeted (@page margin: 0.5in).
  page: {
    paddingVertical: 36,
    paddingHorizontal: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: CHARCOAL,
    lineHeight: 1.3,
  },
  // --- Header ---
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#111",
  },
  headerLeft: { width: "38%" },
  logo: { maxHeight: 42, marginBottom: 4, objectFit: "contain" },
  companyName: { fontSize: 14, fontWeight: "bold", color: CHARCOAL },
  companySub: { fontSize: 8, color: "#555" },
  companyMeta: { fontSize: 8, color: "#555", marginTop: 3 },
  headerCenter: { flex: 1, alignSelf: "center", textAlign: "center" },
  docTitle: { fontSize: 28, fontWeight: "bold", letterSpacing: 2, color: CHARCOAL },
  headerRight: { width: "28%", alignItems: "flex-end" },
  docMeta: { fontSize: 9, color: CHARCOAL, textAlign: "right" },
  statusPill: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
  statusPillText: { fontSize: 8, fontWeight: "bold", letterSpacing: 0.5, textTransform: "uppercase" },
  // --- Three-column block (Customer | Job Site | Project) ---
  cols: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  col: { width: "31%" },
  colHeader: {
    fontSize: 8,
    fontWeight: "bold",
    marginBottom: 4,
    paddingBottom: 2,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  docField: { fontSize: 10, marginBottom: 1, color: CHARCOAL },
  // --- Contact strip ---
  contactStrip: { flexDirection: "row", marginBottom: 16 },
  contactCell: { width: "25%", fontSize: 10, color: CHARCOAL },
  contactLabel: { fontWeight: "bold" },
  // --- Line items table ---
  table: { width: "100%", marginBottom: 12 },
  thead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    color: CHARCOAL,
  },
  th: { padding: 6, fontSize: 9, fontWeight: "bold", borderRightWidth: 0.5, borderRightColor: "#999" },
  bidRow: { flexDirection: "row", color: CHARCOAL },
  td: { padding: 5, fontSize: 9, borderRightWidth: 0.5, borderRightColor: "#ccc" },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: "#ccc" },
  // --- LEM detail (print columns) ---
  lemWrap: { paddingTop: 3, paddingBottom: 6, paddingLeft: 14, paddingRight: 6, borderBottomWidth: 0.5, borderBottomColor: "#ccc" },
  lemSection: { marginBottom: 4 },
  lemCrewTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#7D1424",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    paddingTop: 2,
    marginTop: 2,
  },
  lemSectionTitle: { fontSize: 8, color: "#777", textTransform: "uppercase", letterSpacing: 0.5 },
  lemRow: { flexDirection: "row", fontSize: 8, color: "#555555", lineHeight: 1.4 },
  // --- Total ---
  totalRow: { flexDirection: "row", marginTop: 4, borderTopWidth: 1, borderTopColor: "#111", paddingTop: 4, color: CHARCOAL },
  totalLabel: { fontSize: 11, fontWeight: "bold", width: "70%" },
  totalValue: { fontSize: 11, fontWeight: "bold", textAlign: "right", width: "30%" },
  // --- Terms ---
  terms: { marginTop: 16, fontSize: 9, color: CHARCOAL },
  termsHeading: { fontSize: 9, fontWeight: "bold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  termsSection: { marginBottom: 8 },
  termsSectionTitle: { fontSize: 9, fontWeight: "bold", color: CHARCOAL, marginBottom: 2 },
  termsBody: { fontSize: 9, color: CHARCOAL },
  addlHeading: { fontSize: 9, fontWeight: "bold", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  // --- Footer ---
  footer: { marginTop: 24, fontSize: 8, color: "#555", textAlign: "center" },
});

export default function QuotePdfDocument({ quote, company }: QuotePdfDocumentProps) {
  const q = quote || {};
  const co = company.company;
  const headerName = co.legal_name.trim();
  const headerSubtitle = co.short_name.trim();

  // Quote/Estimate label drives the title and prose. Injected as {{quote.label}} (lowercase),
  // identical to QuotePreview so token resolution and section-completeness match the preview.
  const docLabel = q.exportType === "estimate" ? "Estimate" : "Quote";
  const tokenContext = q.tokenContext || null;
  const docTokenContext = {
    ...(tokenContext || {}),
    quote: { ...((tokenContext && tokenContext.quote) || {}), label: docLabel.toLowerCase() },
  };

  // A T&C section is "ready" when every token it references resolves to a non-empty value.
  // Incomplete sections are OMITTED from the PDF (same as the print path) — never half-blank prose.
  const tokenValues = buildTokenValues(company, docTokenContext);
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
  const showLemDetail = !!options.showLemDetail;

  const customer = q.customer || {};
  const lineItemsRaw = q.lineItems || [];
  const lineItems = lineItemsRaw.map((item: any) => {
    const qty = item.qty !== undefined ? item.qty : item.quantity || 0;
    const unitPrice = item.unitPrice || 0;
    const lineTotal = item.lineTotal !== undefined ? item.lineTotal : qty * unitPrice;
    return {
      description: item.description || "—",
      quantity: qty,
      unit: item.unit || "",
      unitPrice,
      lineTotal,
      lemDetail: item.lemDetail || null,
    };
  });
  const grandTotal =
    q.total !== undefined
      ? q.total
      : lineItems.reduce((s: number, it: any) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);

  const termsText = q.termsText || null;
  const logoDataUrl = q.logoDataUrl || null;

  const statusLabel = STATUS_LABELS[q.status as string] || null;
  const statusColor = STATUS_COLORS[q.status as string]?.bg || "#7D1424";

  const billToLines: string[] = Array.isArray(customer.billToLines) ? customer.billToLines : [];
  const jobSiteLines: string[] = Array.isArray(customer.jobSiteLines) ? customer.jobSiteLines : [];
  const contact = customer.contact || {};
  const contactName = (contact.name || "").trim();
  const contactStripItems: { label: string; value: string }[] = [
    { label: "Contact", value: contactName },
    { label: "Mobile", value: contact.mobile ? formatPhone(contact.mobile) : "" },
    { label: "Phone", value: contact.phone ? formatPhone(contact.phone) : "" },
    { label: "Email", value: contact.email || "" },
  ];
  const hasAnyContact = contactStripItems.some((it) => it.value);

  const docNumber = q.quoteNumber || "";
  const docDate = q.date || "";

  return (
    <Document title={`${docLabel} ${docNumber}`.trim()}>
      <Page size="LETTER" style={styles.page}>
        {/* Header — identity (left) | TITLE (center) | doc #/date/status (right) */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {logoDataUrl ? <Image src={logoDataUrl} style={styles.logo} /> : null}
            {headerName ? <Text style={styles.companyName}>{headerName}</Text> : null}
            {headerSubtitle ? <Text style={styles.companySub}>{headerSubtitle}</Text> : null}
            {co.address.trim() || co.city_state_zip.trim() ? (
              <View style={styles.companyMeta}>
                {co.address.trim() ? <Text>{co.address}</Text> : null}
                {co.city_state_zip.trim() ? <Text>{co.city_state_zip}</Text> : null}
              </View>
            ) : null}
            {co.phone.trim() || co.email.trim() ? (
              <Text style={[styles.companyMeta, { marginTop: 2 }]}>
                {[co.phone.trim(), co.email.trim()].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.docTitle}>{docLabel.toUpperCase()}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docMeta}>
              {docLabel} #{docNumber || "—"}
            </Text>
            {docDate ? <Text style={styles.docMeta}>{docDate}</Text> : null}
            {statusLabel ? (
              <View style={[styles.statusPill, { borderColor: statusColor }]}>
                <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Three columns: Customer | Job Site | Project */}
        <View style={styles.cols}>
          <View style={styles.col}>
            <Text style={styles.colHeader}>Customer</Text>
            {customer.name ? <Text style={styles.docField}>{customer.name}</Text> : null}
            {showBillTo
              ? billToLines.map((ln, i) => (
                  <Text key={`bt${i}`} style={styles.docField}>
                    {ln}
                  </Text>
                ))
              : null}
          </View>
          <View style={styles.col}>
            <Text style={styles.colHeader}>Job Site</Text>
            {showJobSite && jobSiteLines.length > 0 ? (
              jobSiteLines.map((ln, i) => (
                <Text key={`js${i}`} style={styles.docField}>
                  {ln}
                </Text>
              ))
            ) : (
              <Text style={styles.docField}>—</Text>
            )}
          </View>
          <View style={styles.col}>
            <Text style={styles.colHeader}>Project</Text>
            <Text style={styles.docField}>{q.jobName || "—"}</Text>
            <Text style={styles.docField}>Sales Rep: {q.salesperson || "—"}</Text>
            {String(q.estimator || "").trim() !== "" ? (
              <Text style={styles.docField}>Estimator: {q.estimator}</Text>
            ) : null}
          </View>
        </View>

        {/* Contact strip — Contact | Mobile | Phone | Email (empty fields show "—") */}
        {showPrimaryContact && hasAnyContact ? (
          <View style={styles.contactStrip}>
            {contactStripItems.map((it) => (
              <Text key={it.label} style={styles.contactCell}>
                <Text style={styles.contactLabel}>{it.label}:</Text> {it.value || "—"}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, { width: "40%" }]}>Description</Text>
            {showQuantities ? <Text style={[styles.th, { width: "10%", textAlign: "right" }]}>Qty</Text> : null}
            {showUnits ? <Text style={[styles.th, { width: "10%", textAlign: "center" }]}>Unit</Text> : null}
            {showPerUnitPrice ? <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Unit Price</Text> : null}
            {showLineItemPrices ? <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Line Total</Text> : null}
          </View>
          {lineItems.length > 0 ? (
            lineItems.map((item: any, idx: number) => {
              const lt = item.lineTotal !== undefined ? item.lineTotal : (item.quantity || 0) * (item.unitPrice || 0);
              const lemOn = showLemDetail && item.lemDetail && item.lemDetail.hasAny;
              return (
                // wrap={false} keeps each bid line and its LEM detail together on one page.
                <View key={idx} wrap={false}>
                  <View style={[styles.bidRow, lemOn ? {} : styles.rowBorder]}>
                    <Text style={[styles.td, { width: "40%" }]}>{item.description || "—"}</Text>
                    {showQuantities ? (
                      <Text style={[styles.td, { width: "10%", textAlign: "right" }]}>{item.quantity || 0}</Text>
                    ) : null}
                    {showUnits ? (
                      <Text style={[styles.td, { width: "10%", textAlign: "center" }]}>{item.unit || ""}</Text>
                    ) : null}
                    {showPerUnitPrice ? (
                      <Text style={[styles.td, { width: "15%", textAlign: "right" }]}>${formatMoney(item.unitPrice || 0)}</Text>
                    ) : null}
                    {showLineItemPrices ? (
                      <Text style={[styles.td, { width: "15%", textAlign: "right" }]}>${formatWhole(lt)}</Text>
                    ) : null}
                  </View>
                  {lemOn ? (
                    <View style={styles.lemWrap}>
                      {item.lemDetail.sections.map((sec: any, sIdx: number) => (
                        <View key={sIdx} style={styles.lemSection}>
                          {sec.isCrew ? (
                            <Text style={styles.lemCrewTitle}>{sec.title}</Text>
                          ) : (
                            <Text style={styles.lemSectionTitle}>{sec.title}</Text>
                          )}
                          {sec.rows.map((row: any, rIdx: number) => (
                            <View key={rIdx} style={styles.lemRow}>
                              <Text style={{ width: "50%", paddingLeft: 8 }}>{row.name}</Text>
                              <Text style={{ width: "15%", textAlign: "right" }}>{row.qty}</Text>
                              <Text style={{ width: "20%", textAlign: "right" }}>{row.rate}</Text>
                              <Text style={{ width: "15%", textAlign: "right" }}>{row.cost}</Text>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <View style={styles.bidRow}>
              <Text style={[styles.td, { width: "100%" }]}>No line items</Text>
            </View>
          )}
        </View>

        {/* TOTAL */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>${formatWhole(grandTotal)}</Text>
        </View>

        {/* Terms & Conditions — only ready sections render (incomplete are omitted, matching print). */}
        <View style={styles.terms}>
          <Text style={styles.termsHeading}>Terms &amp; Conditions</Text>
          {TC_SECTIONS.map((sec, i) => {
            if (!sectionReady(sec.body)) return null;
            return (
              <View key={sec.id} style={styles.termsSection}>
                <Text style={styles.termsSectionTitle}>
                  {i + 1}. {sec.title}
                </Text>
                <Text style={styles.termsBody}>{resolveTokens(sec.body, { company, quote: docTokenContext })}</Text>
              </View>
            );
          })}
        </View>

        {/* Additional Terms (free text) */}
        {termsText ? (
          <View style={styles.terms}>
            <Text style={styles.addlHeading}>Additional Terms</Text>
            <Text style={styles.termsBody}>{termsText}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <Text style={styles.footer}>This document is a {docLabel.toLowerCase()}. Thank you for your business.</Text>
      </Page>
    </Document>
  );
}
