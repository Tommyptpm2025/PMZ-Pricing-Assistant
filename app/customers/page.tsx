"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Edit2, Trash2, ChevronDown, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/pmz-types";
import { StateProvinceSelect, CountrySelect } from "@/components/customer/GeoSelects";
import { stateNameByCode, countryNameByCode, stateCodeByName, countryCodeByName, stateValidForCountry, DEFAULT_COUNTRY_CODE, US_CA_COUNTRIES } from "@/lib/geo-data";
import { customerCompleteness } from "@/lib/customer-utils";

const STORAGE_KEY = "pmz_customers";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

// --- Format enforcement helpers (the field enforces format) ---
function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function sanitizeCompany(value: string): string {
  // Company Name: strip any colons and quotation marks
  return value.replace(/[:"]/g, "");
}

const PREFERRED_CONTACTS = ["Phone", "Mobile", "Email", "Text"] as const;
const PAYMENT_TERMS = ["Due on receipt", "Net 15", "Net 30", "Net 60", "COD"] as const;
const DRAFT_KEY = "pmz_customer_draft";

// Best Time to Reach — 24-hour HHMM in 30-minute steps, 0000–2400.
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m <= 1440; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push({ value: `${hh}${mm}`, label: `${hh}:${mm}` });
  }
  return out;
})();

// Shared "(optional)" marker — only Company Name is hard-required.
function OptionalTag() {
  return <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>;
}
// Loud "needed to complete" hint for a required-for-complete field — brand red (#EB3300), bold, so
// the instruction clearly outranks the gray placeholder/example text. Shown only while the field is
// empty; it disappears the instant the field is satisfied (live, both Add and Edit). `show` = empty.
function RequiredHint({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="ml-1 text-xs font-semibold" style={{ color: "#EB3300" }}>needed to complete</span>;
}
// Brand-red outline for an empty required-for-complete field; clears live when satisfied. `show` = empty.
function requiredRing(show: boolean): string {
  return show ? "border-[#EB3300] ring-1 ring-[#EB3300] focus-visible:ring-[#EB3300]" : "";
}

// Render an AP/billing contact value as a mailto: (email) or clickable link (URL), else plain text.
function renderContactLink(value?: string) {
  const v = (value || "").trim();
  if (!v) return null;
  if (isValidEmail(v)) return <a href={`mailto:${v}`} className="text-primary hover:underline">{v}</a>;
  if (/^https?:\/\//i.test(v) || /\.[a-z]{2,}(\/|$)/i.test(v)) {
    const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{v}</a>;
  }
  return <span>{v}</span>;
}

// Save-state indicator shown beside the Save action(s): "Saving…" while the write fires, then a
// timestamped "Saved ✓" once it persists. Idle renders nothing.
function SaveStatus({ state, at }: { state: "idle" | "saving" | "saved"; at: string }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "#166534" }}>
        <CheckCircle2 className="h-4 w-4" /> Saved ✓{at ? ` ${at}` : ""}
      </span>
    );
  }
  return null;
}

// Completeness status pill for the saved list.
function CompletenessBadge({ customer }: { customer: Customer }) {
  const { complete, count } = customerCompleteness(customer);
  return complete ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#166534" }}>
      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#B45309" }}>
      <AlertTriangle className="h-3.5 w-3.5" /> Incomplete — {count} needed
    </span>
  );
}

// Shared section helper styling
const SELECT_CLS = "mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function CustomersPage() {
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Customer | null>(null);
  const [profileTarget, setProfileTarget] = React.useState<Customer | null>(null);

  // Email validation (on blur), Advanced (lat/long) toggle, tab + save-UX state
  const [emailError, setEmailError] = React.useState(false);
  const [dmEmailError, setDmEmailError] = React.useState(false);
  const [showAdvancedGeo, setShowAdvancedGeo] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"form" | "saved">("form");
  const [dirty, setDirty] = React.useState(false);
  // Save-state indicator: idle → "Saving…" (write fired) → "Saved ✓ <time>" (persisted), reset to idle on next edit.
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = React.useState("");
  const [triedSubmit, setTriedSubmit] = React.useState(false); // show hard-required errors after a blocked save

  // Skip dirty/draft tracking for programmatic form changes (load / reset / draft restore).
  const programmaticRef = React.useRef(true);
  const draftTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state — the 5-section guided flow. State/Country dropdowns store the 2-letter CODE;
  // the full name is resolved from geo-data at save time and stored alongside.
  const [form, setForm] = React.useState({
    // §1 WHO
    name: "",
    contactName: "",
    title: "",
    isDecisionMaker: "" as "" | "yes" | "no",
    website: "",
    // §1 decision-maker / point-of-contact block (revealed when contact is NOT the decision-maker)
    dmName: "",
    dmTitle: "",
    dmPhone: "",
    dmMobile: "",
    dmEmail: "",
    dmPreferredContact: "Phone" as "Phone" | "Mobile" | "Email" | "Text",
    // §2 HOW
    phone: "",
    mobile: "",
    email: "",
    preferredContact: "Phone" as "Phone" | "Mobile" | "Email" | "Text",
    bestTimeToReach: "",
    // §3 WHERE (Job Site)
    jobStreet: "",
    jobStreet2: "",
    jobCity: "",
    jobStateCode: "",
    jobZip: "",
    jobCountryCode: DEFAULT_COUNTRY_CODE,
    jobLatitude: "",
    jobLongitude: "",
    jobAccessNotes: "",
    // §4 NOTES
    notes: "",
    // §5 BILLING & TERMS
    billingSameAsJobSite: false,
    billingStreet: "",
    billingStreet2: "",
    billingCity: "",
    billingStateCode: "",
    billingZip: "",
    billingCountryCode: DEFAULT_COUNTRY_CODE,
    paymentTerms: "" as "" | "Due on receipt" | "Net 15" | "Net 30" | "Net 60" | "COD",
    apContact: "",
  });

  // Load from localStorage only after mount (to avoid hydration mismatch)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        const loaded = parsed.map((c: any) => ({
          ...c,
          createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
          updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
        }));
        setCustomers(loaded);
      }
    } catch {}
    setIsLoaded(true);
  }, []);

  // Persist to localStorage only after loaded (to avoid overwriting with initial empty on mount)
  React.useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
    } catch {}
  }, [customers, isLoaded]);

  // --- Save UX: dirty tracking + debounced draft autosave (safety net) ---
  function clearDraft() {
    if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  // Mark dirty + debounce-write the in-progress form to a draft key. Programmatic changes
  // (load / reset / draft restore) are skipped so they don't mark the form dirty.
  React.useEffect(() => {
    if (programmaticRef.current) { programmaticRef.current = false; return; }
    setDirty(true);
    setSaveState("idle");
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, editingId })); } catch {}
    }, 500);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore an in-progress draft after mount (safety net for refresh / accidental close).
  React.useEffect(() => {
    if (!isLoaded) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.form) {
          programmaticRef.current = true;
          setForm((prev) => ({ ...prev, ...d.form }));
          if (d.editingId) setEditingId(d.editingId);
          setDirty(true);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // Unsaved-changes guard — warn on refresh / close / navigate away while there are unsaved edits.
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function resetForm() {
    programmaticRef.current = true;
    setForm({
      name: "",
      contactName: "",
      title: "",
      isDecisionMaker: "",
      website: "",
      dmName: "",
      dmTitle: "",
      dmPhone: "",
      dmMobile: "",
      dmEmail: "",
      dmPreferredContact: "Phone",
      phone: "",
      mobile: "",
      email: "",
      preferredContact: "Phone",
      bestTimeToReach: "",
      jobStreet: "",
      jobStreet2: "",
      jobCity: "",
      jobStateCode: "",
      jobZip: "",
      jobCountryCode: DEFAULT_COUNTRY_CODE,
      jobLatitude: "",
      jobLongitude: "",
      jobAccessNotes: "",
      notes: "",
      billingSameAsJobSite: false,
      billingStreet: "",
      billingStreet2: "",
      billingCity: "",
      billingStateCode: "",
      billingZip: "",
      billingCountryCode: DEFAULT_COUNTRY_CODE,
      paymentTerms: "",
      apContact: "",
    });
    setEditingId(null);
    setEmailError(false);
    setDmEmailError(false);
    setShowAdvancedGeo(false);
    setTriedSubmit(false);
    setSaveState("idle");
    setDirty(false);
    clearDraft();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const companyName = sanitizeCompany(form.name).trim();

    // Hard-required gate (blocks save): Company Name, Contact Name, and at least one way to reach
    // them (Phone OR Mobile OR Email). Everything else is required-for-complete or optional.
    const reachOk = !!(form.phone.trim() || form.mobile.trim() || form.email.trim());
    if (!companyName || !form.contactName.trim() || !reachOk) {
      setTriedSubmit(true);
      return;
    }

    // Save-state: signal "Saving…" the moment the write fires (see the persist below).
    setSaveState("saving");

    const now = new Date();
    const parseCoord = (v: string) => {
      const n = v.trim() ? parseFloat(v.trim()) : undefined;
      return n != null && !isNaN(n) ? n : undefined;
    };

    // Job Site address — store both the full state/country names (from codes) and the codes.
    const jobStateName = stateNameByCode(form.jobStateCode);
    const jobCountryName = countryNameByCode(form.jobCountryCode);
    const jobSiteAddress: any = {
      street: form.jobStreet.trim() || undefined,
      street2: form.jobStreet2.trim() || undefined,
      city: form.jobCity.trim() || undefined,
      state: jobStateName || undefined,
      stateCode: form.jobStateCode || undefined,
      zip: form.jobZip.trim() || undefined,
      country: jobCountryName || undefined,
      countryCode: form.jobCountryCode || undefined,
      latitude: parseCoord(form.jobLatitude),
      longitude: parseCoord(form.jobLongitude),
      accessNotes: form.jobAccessNotes.trim() || undefined,
    };

    // Billing address — copies the Job Site core address when "same as job site" is on.
    const billCountryName = countryNameByCode(form.billingCountryCode);
    let billingAddress: any;
    if (form.billingSameAsJobSite) {
      billingAddress = {
        street: form.jobStreet.trim() || undefined,
        street2: form.jobStreet2.trim() || undefined,
        city: form.jobCity.trim() || undefined,
        state: jobStateName || undefined,
        stateCode: form.jobStateCode || undefined,
        zip: form.jobZip.trim() || undefined,
        country: billCountryName || undefined,
        countryCode: form.billingCountryCode || undefined,
      };
    } else {
      const billStateName = stateNameByCode(form.billingStateCode);
      billingAddress = {
        street: form.billingStreet.trim() || undefined,
        street2: form.billingStreet2.trim() || undefined,
        city: form.billingCity.trim() || undefined,
        state: billStateName || undefined,
        stateCode: form.billingStateCode || undefined,
        zip: form.billingZip.trim() || undefined,
        country: billCountryName || undefined,
        countryCode: form.billingCountryCode || undefined,
      };
    }

    const isDM = form.isDecisionMaker === "yes" ? true : form.isDecisionMaker === "no" ? false : undefined;

    // Decision-maker / point-of-contact block — captured only when the primary contact is NOT the
    // decision-maker, and only when something is filled in. Stored under its own key.
    const dmRaw = {
      name: form.dmName.trim() || undefined,
      title: form.dmTitle.trim() || undefined,
      phone: form.dmPhone.trim() || undefined,
      mobile: form.dmMobile.trim() || undefined,
      email: form.dmEmail.trim() || undefined,
      preferredContact: form.dmPreferredContact,
    };
    const decisionMakerContact = form.isDecisionMaker === "no" && (dmRaw.name || dmRaw.title || dmRaw.phone || dmRaw.mobile || dmRaw.email)
      ? dmRaw
      : undefined;

    const fields = {
      name: companyName,
      contactName: form.contactName.trim() || undefined,
      title: form.title.trim() || undefined,
      isDecisionMaker: isDM,
      decisionMakerContact,
      altContact: undefined, // clear any legacy alternate-contact value (migrated into decisionMakerContact)
      phone: form.phone.trim() || undefined,
      mobile: form.mobile.trim() || undefined,
      email: form.email.trim() || undefined,
      preferredContact: form.preferredContact,
      bestTimeToReach: form.bestTimeToReach || undefined,
      website: form.website.trim() || undefined,
      billingAddress: Object.values(billingAddress).some((v: any) => v) ? billingAddress : undefined,
      jobSiteAddress: Object.values(jobSiteAddress).some((v: any) => v) ? jobSiteAddress : undefined,
      paymentTerms: form.paymentTerms || undefined,
      apContact: form.apContact.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    if (editingId) {
      setCustomers((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...fields, updatedAt: now } : c)));
    } else {
      const newCustomer: Customer = {
        id: createId(),
        ...fields,
        externalIds: undefined,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      setCustomers((prev) => [...prev, newCustomer]);
    }

    // "Saving…" is committed now; once the write has persisted, clear the form and show a
    // timestamped "Saved ✓". The short delay lets the "Saving…" state render on this long form.
    const stamp = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setTimeout(() => {
      resetForm();              // resetForm sets saveState idle…
      setSaveState("saved");    // …then override to the persisted confirmation
      setSavedAt(stamp);
    }, 500);
  }

  function loadForEdit(customer: Customer) {
    programmaticRef.current = true;
    setEditingId(customer.id);
    const billing = customer.billingAddress || {};
    const job = customer.jobSiteAddress || {};
    // Migrate cleanly: prefer the new key, fall back to the legacy altContact for older records.
    const dm = customer.decisionMakerContact || customer.altContact || {};

    // Geo codes: prefer the stored code, else reverse-look-up the stored full name (legacy records).
    const jobStateCode = job.stateCode || stateCodeByName(job.state || "");
    const jobCountryCode = job.countryCode || countryCodeByName(job.country || "") || DEFAULT_COUNTRY_CODE;
    const billingStateCode = billing.stateCode || stateCodeByName(billing.state || "");
    const billingCountryCode = billing.countryCode || countryCodeByName(billing.country || "") || DEFAULT_COUNTRY_CODE;

    // Billing "same as job site" when the core billing address equals the job-site address.
    const hasBilling = !!(billing.street || billing.city || billing.state || billing.zip);
    const billingSameAsJobSite =
      hasBilling &&
      (billing.street || "") === (job.street || "") &&
      (billing.street2 || "") === (job.street2 || "") &&
      (billing.city || "") === (job.city || "") &&
      (billingStateCode || "") === (jobStateCode || "") &&
      (billing.zip || "") === (job.zip || "");

    setForm({
      name: customer.name,
      contactName: customer.contactName || "",
      title: customer.title || "",
      isDecisionMaker: customer.isDecisionMaker === true ? "yes" : customer.isDecisionMaker === false ? "no" : "",
      website: customer.website || "",
      dmName: dm.name || "",
      dmTitle: dm.title || "",
      dmPhone: dm.phone || "",
      dmMobile: dm.mobile || "",
      dmEmail: dm.email || "",
      dmPreferredContact: dm.preferredContact || "Phone",
      phone: customer.phone || "",
      mobile: customer.mobile || "",
      email: customer.email || "",
      preferredContact: customer.preferredContact || "Phone",
      bestTimeToReach: customer.bestTimeToReach || "",
      jobStreet: job.street || "",
      jobStreet2: job.street2 || "",
      jobCity: job.city || "",
      jobStateCode,
      jobZip: job.zip || "",
      jobCountryCode,
      jobLatitude: job.latitude != null ? String(job.latitude) : "",
      jobLongitude: job.longitude != null ? String(job.longitude) : "",
      jobAccessNotes: job.accessNotes || "",
      notes: customer.notes || "",
      billingSameAsJobSite,
      billingStreet: billing.street || "",
      billingStreet2: billing.street2 || "",
      billingCity: billing.city || "",
      billingStateCode,
      billingZip: billing.zip || "",
      billingCountryCode,
      paymentTerms: customer.paymentTerms || "",
      apContact: customer.apContact || "",
    });
    setEmailError(false);
    setDmEmailError(false);
    setShowAdvancedGeo(job.latitude != null || job.longitude != null);
    setTriedSubmit(false);
    setDirty(false);
    setActiveTab("form");
  }

  function confirmDelete(customer: Customer) {
    setDeleteTarget(customer);
  }

  function doDelete() {
    if (!deleteTarget) return;
    setCustomers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    if (editingId === deleteTarget.id) {
      resetForm();
    }
    setDeleteTarget(null);
  }

  function cancelDelete() {
    setDeleteTarget(null);
  }

  // Hard-required "at least one way to reach them" — surfaced only after a blocked save attempt.
  const reachMissing = triedSubmit && !(form.phone.trim() || form.mobile.trim() || form.email.trim());

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Users className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Customers</h1>
          <p className="mt-1 text-muted-foreground max-w-2xl">
            Manage your customer and contact list. These will be selectable in the Project Pricer when building quotes.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setActiveTab("form")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "form" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {editingId ? "Edit Customer" : "Add Customer"}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("saved")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "saved" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Saved Customers{isLoaded ? ` (${customers.length})` : ""}
        </button>
      </div>

      {/* Add / Edit Form */}
      {activeTab === "form" && (
      <Card className="card">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{editingId ? "Edit Customer" : "Add New Customer"}</CardTitle>
              <CardDescription>
                {editingId
                  ? "Update the details for this customer."
                  : "Company name, contact name, and at least one way to reach them are required."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
              <SaveStatus state={saveState} at={savedAt} />
              {editingId ? (
                <Button type="button" variant="outline" size="lg" onClick={resetForm}>
                  Cancel Edit
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={resetForm} title="Clear the form for a fresh entry">
                  Start New
                </Button>
              )}
              <Button type="submit" form="customer-form" size="lg" className="px-8">
                {editingId ? "Save Changes" : "Save Customer"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form id="customer-form" onSubmit={handleSubmit} className="space-y-8">
            {/* §1 WHO ARE WE WORKING WITH? */}
            <div className="border rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <span className="font-semibold">1. WHO ARE WE WORKING WITH?</span>
                <p className="text-xs text-muted-foreground mt-0.5">Know who you&apos;re talking to — and who actually signs. Getting this wrong costs the deal.</p>
              </div>
              <div className="p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="name">Company Name <span className="text-destructive">*</span></Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: sanitizeCompany(e.target.value) })}
                      placeholder="e.g. Acme Construction LLC"
                      className={cn("mt-1.5", triedSubmit && !form.name.trim() && "border-destructive focus-visible:ring-destructive")}
                    />
                    {triedSubmit && !form.name.trim() && <p className="mt-1 text-xs text-destructive">Company name is required.</p>}
                  </div>
                  <div>
                    <Label htmlFor="contactName">Contact Name <span className="text-destructive">*</span></Label>
                    <Input id="contactName" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="e.g. Jane Smith" className={cn("mt-1.5", triedSubmit && !form.contactName.trim() && "border-destructive focus-visible:ring-destructive")} />
                    {triedSubmit && !form.contactName.trim() && <p className="mt-1 text-xs text-destructive">Contact name is required.</p>}
                  </div>
                  <div>
                    <Label htmlFor="title">Title / Role <OptionalTag /></Label>
                    <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Project Manager" className="mt-1.5" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Is this person the decision-maker? <OptionalTag /></Label>
                    <div className="mt-1.5 flex gap-2">
                      <Button type="button" size="sm" variant={form.isDecisionMaker === "yes" ? "default" : "outline"} onClick={() => setForm({ ...form, isDecisionMaker: form.isDecisionMaker === "yes" ? "" : "yes" })}>Yes</Button>
                      <Button type="button" size="sm" variant={form.isDecisionMaker === "no" ? "default" : "outline"} onClick={() => setForm({ ...form, isDecisionMaker: form.isDecisionMaker === "no" ? "" : "no" })}>No</Button>
                    </div>
                  </div>
                  {form.isDecisionMaker === "no" && (
                    <div className="sm:col-span-2">
                      <div className="rounded-md border p-4 bg-muted/20">
                        <p className="text-sm font-medium">Decision-Maker / Point of Contact <OptionalTag /></p>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-3">Who actually signs — and how to reach them.</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <Label htmlFor="dmName">Name <OptionalTag /></Label>
                            <Input id="dmName" value={form.dmName} onChange={(e) => setForm({ ...form, dmName: e.target.value })} placeholder="e.g. Pat Owner" className="mt-1.5" />
                          </div>
                          <div>
                            <Label htmlFor="dmTitle">Title / Role <OptionalTag /></Label>
                            <Input id="dmTitle" value={form.dmTitle} onChange={(e) => setForm({ ...form, dmTitle: e.target.value })} placeholder="e.g. Owner" className="mt-1.5" />
                          </div>
                          <div>
                            <Label htmlFor="dmPhone">Phone <OptionalTag /></Label>
                            <Input id="dmPhone" value={form.dmPhone} onChange={(e) => setForm({ ...form, dmPhone: formatPhone(e.target.value) })} placeholder="(555) 123-4567" className="mt-1.5" />
                          </div>
                          <div>
                            <Label htmlFor="dmMobile">Mobile <OptionalTag /></Label>
                            <Input id="dmMobile" value={form.dmMobile} onChange={(e) => setForm({ ...form, dmMobile: formatPhone(e.target.value) })} placeholder="(555) 987-6543" className="mt-1.5" />
                          </div>
                          <div>
                            <Label htmlFor="dmEmail">Email <OptionalTag /></Label>
                            <Input
                              id="dmEmail"
                              type="email"
                              value={form.dmEmail}
                              onChange={(e) => { setForm({ ...form, dmEmail: e.target.value }); if (dmEmailError) setDmEmailError(false); }}
                              onBlur={() => setDmEmailError(!!form.dmEmail.trim() && !isValidEmail(form.dmEmail))}
                              placeholder="e.g. pat@acme.com"
                              className={cn("mt-1.5", dmEmailError && "border-destructive focus-visible:ring-destructive")}
                            />
                            {dmEmailError && <p className="mt-1 text-xs text-destructive">Enter a valid email address.</p>}
                          </div>
                          <div>
                            <Label htmlFor="dmPreferred">Preferred Contact Method <OptionalTag /></Label>
                            <select id="dmPreferred" value={form.dmPreferredContact} onChange={(e) => setForm({ ...form, dmPreferredContact: e.target.value as any })} className={SELECT_CLS}>
                              {PREFERRED_CONTACTS.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <Label htmlFor="website">Website <OptionalTag /></Label>
                    <Input id="website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="e.g. https://acme.com" className="mt-1.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* §2 HOW DO WE REACH THEM? */}
            <div className="border rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <span className="font-semibold">2. HOW DO WE REACH THEM?</span>
                <p className="text-xs text-muted-foreground mt-0.5">One place for every way to reach them, so nobody&apos;s hunting for a number.</p>
              </div>
              <div className="p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="phone">Phone <OptionalTag /></Label>
                    <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(555) 123-4567" className={cn("mt-1.5", reachMissing && "border-destructive focus-visible:ring-destructive")} />
                  </div>
                  <div>
                    <Label htmlFor="mobile">Mobile <OptionalTag /></Label>
                    <Input id="mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: formatPhone(e.target.value) })} placeholder="(555) 987-6543" className={cn("mt-1.5", reachMissing && "border-destructive focus-visible:ring-destructive")} />
                  </div>
                  <div>
                    <Label htmlFor="email">Email <OptionalTag /></Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => { setForm({ ...form, email: e.target.value }); if (emailError) setEmailError(false); }}
                      onBlur={() => setEmailError(!!form.email.trim() && !isValidEmail(form.email))}
                      placeholder="e.g. jane@acme.com"
                      className={cn("mt-1.5", reachMissing && "border-destructive focus-visible:ring-destructive")}
                    />
                    {emailError && <p className="mt-1 text-xs text-destructive">Enter a valid email address.</p>}
                  </div>
                  {reachMissing && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-destructive">Add at least one way to reach them — phone, mobile, or email.</p>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="preferredContact">Preferred Contact Method <OptionalTag /></Label>
                    <select id="preferredContact" value={form.preferredContact} onChange={(e) => setForm({ ...form, preferredContact: e.target.value as any })} className={SELECT_CLS}>
                      {PREFERRED_CONTACTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="bestTime">Best Time to Reach <OptionalTag /></Label>
                    <select id="bestTime" value={form.bestTimeToReach} onChange={(e) => setForm({ ...form, bestTimeToReach: e.target.value })} className={SELECT_CLS}>
                      <option value="">—</option>
                      {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* §3 WHERE'S THE WORK? (Job Site / Project Location) */}
            <div className="border rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <span className="font-semibold">3. WHERE&apos;S THE WORK? <span className="font-normal text-muted-foreground text-sm">(Job Site / Project Location)</span></span>
                <p className="text-xs text-muted-foreground mt-0.5">Where the crew actually goes. Access details here save a wasted trip.</p>
              </div>
              <div className="p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="jobStreet">Street Address <RequiredHint show={!form.jobStreet.trim()} /></Label>
                    <Input id="jobStreet" value={form.jobStreet} onChange={(e) => setForm({ ...form, jobStreet: e.target.value })} placeholder="e.g. 456 Oak Ave" className={cn("mt-1.5", requiredRing(!form.jobStreet.trim()))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="jobStreet2">Street Address 2 <OptionalTag /></Label>
                    <Input id="jobStreet2" value={form.jobStreet2} onChange={(e) => setForm({ ...form, jobStreet2: e.target.value })} placeholder="e.g. Rear entrance" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="jobCity">City <RequiredHint show={!form.jobCity.trim()} /></Label>
                    <Input id="jobCity" value={form.jobCity} onChange={(e) => setForm({ ...form, jobCity: e.target.value })} placeholder="e.g. Springfield" className={cn("mt-1.5", requiredRing(!form.jobCity.trim()))} />
                  </div>
                  <div>
                    <Label htmlFor="jobState">State / Province <RequiredHint show={!form.jobStateCode} /></Label>
                    <StateProvinceSelect id="jobState" value={form.jobStateCode} countryCode={form.jobCountryCode} onChange={(v) => setForm({ ...form, jobStateCode: v.code })} className={requiredRing(!form.jobStateCode)} />
                  </div>
                  <div>
                    <Label htmlFor="jobZip">Postal / ZIP <RequiredHint show={!form.jobZip.trim()} /></Label>
                    <Input id="jobZip" value={form.jobZip} onChange={(e) => setForm({ ...form, jobZip: digitsOnly(e.target.value) })} inputMode="numeric" placeholder="e.g. 62701" className={cn("mt-1.5", requiredRing(!form.jobZip.trim()))} />
                  </div>
                  <div>
                    <Label htmlFor="jobCountry">Country <OptionalTag /></Label>
                    <CountrySelect id="jobCountry" options={US_CA_COUNTRIES} value={form.jobCountryCode} onChange={(v) => setForm({ ...form, jobCountryCode: v.code, jobStateCode: stateValidForCountry(form.jobStateCode, v.code) ? form.jobStateCode : "" })} />
                  </div>
                  <div className="sm:col-span-2">
                    <button type="button" onClick={() => setShowAdvancedGeo((s) => !s)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvancedGeo ? 'rotate-180' : ''}`} /> Advanced — GPS coordinates (optional, manual)
                    </button>
                    {showAdvancedGeo && (
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <Label htmlFor="jobLatitude">Latitude <OptionalTag /></Label>
                          <Input id="jobLatitude" value={form.jobLatitude} onChange={(e) => setForm({ ...form, jobLatitude: e.target.value })} placeholder="e.g. 39.7817" className="mt-1.5" />
                        </div>
                        <div>
                          <Label htmlFor="jobLongitude">Longitude <OptionalTag /></Label>
                          <Input id="jobLongitude" value={form.jobLongitude} onChange={(e) => setForm({ ...form, jobLongitude: e.target.value })} placeholder="e.g. -89.6501" className="mt-1.5" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="jobAccessNotes">Access Notes / Delivery Instructions <OptionalTag /></Label>
                    <textarea id="jobAccessNotes" value={form.jobAccessNotes} onChange={(e) => setForm({ ...form, jobAccessNotes: e.target.value })} placeholder="e.g. Gate code 1234. Deliver to back lot. Call foreman on arrival." className="mt-1.5 w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  </div>
                </div>
              </div>
            </div>

            {/* §4 NOTES — TEAM BRIEFING */}
            <div className="border rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <span className="font-semibold">4. NOTES — TEAM BRIEFING</span>
                <p className="text-xs text-muted-foreground mt-0.5">The shared briefing everyone reads — bidder to bookkeeper. Site quirks, who to ask for, relationship history, anything from the call worth remembering.</p>
              </div>
              <div className="p-4">
                <div>
                  <Label htmlFor="notes">Notes <OptionalTag /></Label>
                  <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Prefers email for quotes. Knows the GC well. Sensitive about timeline." className="mt-1.5 w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
              </div>
            </div>

            {/* §5 BILLING & TERMS */}
            <div className="border rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <span className="font-semibold">5. BILLING &amp; TERMS <span className="font-normal text-muted-foreground text-sm">(the back-office handoff)</span></span>
                <p className="text-xs text-muted-foreground mt-0.5">Bill the right entity on the right terms, so you&apos;re not chasing money in 60 days.</p>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <input
                    id="billingSameAsJobSite"
                    type="checkbox"
                    checked={form.billingSameAsJobSite}
                    onChange={(e) => setForm({ ...form, billingSameAsJobSite: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <Label htmlFor="billingSameAsJobSite" className="text-sm cursor-pointer">Billing same as job site?</Label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="billingStreet">Street Address <RequiredHint show={!(form.billingSameAsJobSite ? form.jobStreet : form.billingStreet).trim()} /></Label>
                    <Input id="billingStreet" value={form.billingSameAsJobSite ? form.jobStreet : form.billingStreet} onChange={(e) => setForm({ ...form, billingStreet: e.target.value })} disabled={form.billingSameAsJobSite} placeholder="e.g. 123 Main St" className={cn("mt-1.5", requiredRing(!(form.billingSameAsJobSite ? form.jobStreet : form.billingStreet).trim()))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="billingStreet2">Street Address 2 <OptionalTag /></Label>
                    <Input id="billingStreet2" value={form.billingSameAsJobSite ? form.jobStreet2 : form.billingStreet2} onChange={(e) => setForm({ ...form, billingStreet2: e.target.value })} disabled={form.billingSameAsJobSite} placeholder="e.g. Suite 100" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="billingCity">City <RequiredHint show={!(form.billingSameAsJobSite ? form.jobCity : form.billingCity).trim()} /></Label>
                    <Input id="billingCity" value={form.billingSameAsJobSite ? form.jobCity : form.billingCity} onChange={(e) => setForm({ ...form, billingCity: e.target.value })} disabled={form.billingSameAsJobSite} placeholder="e.g. Springfield" className={cn("mt-1.5", requiredRing(!(form.billingSameAsJobSite ? form.jobCity : form.billingCity).trim()))} />
                  </div>
                  <div>
                    <Label htmlFor="billingState">State / Province <RequiredHint show={!(form.billingSameAsJobSite ? form.jobStateCode : form.billingStateCode)} /></Label>
                    <StateProvinceSelect id="billingState" value={form.billingSameAsJobSite ? form.jobStateCode : form.billingStateCode} countryCode={form.billingSameAsJobSite ? form.jobCountryCode : form.billingCountryCode} onChange={(v) => setForm({ ...form, billingStateCode: v.code })} disabled={form.billingSameAsJobSite} className={requiredRing(!(form.billingSameAsJobSite ? form.jobStateCode : form.billingStateCode))} />
                  </div>
                  <div>
                    <Label htmlFor="billingZip">Postal / ZIP <RequiredHint show={!(form.billingSameAsJobSite ? form.jobZip : form.billingZip).trim()} /></Label>
                    <Input id="billingZip" value={form.billingSameAsJobSite ? form.jobZip : form.billingZip} onChange={(e) => setForm({ ...form, billingZip: digitsOnly(e.target.value) })} disabled={form.billingSameAsJobSite} inputMode="numeric" placeholder="e.g. 62701" className={cn("mt-1.5", requiredRing(!(form.billingSameAsJobSite ? form.jobZip : form.billingZip).trim()))} />
                  </div>
                  <div>
                    <Label htmlFor="billingCountry">Country <RequiredHint show={!form.billingCountryCode} /></Label>
                    <CountrySelect id="billingCountry" options={US_CA_COUNTRIES} value={form.billingCountryCode} onChange={(v) => setForm({ ...form, billingCountryCode: v.code, billingStateCode: stateValidForCountry(form.billingStateCode, v.code) ? form.billingStateCode : "" })} className={requiredRing(!form.billingCountryCode)} />
                  </div>
                  <div>
                    <Label htmlFor="paymentTerms">Payment Terms <OptionalTag /></Label>
                    <select id="paymentTerms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value as any })} className={SELECT_CLS}>
                      <option value="">—</option>
                      {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="apContact">AP / Billing Contact — name, email, or phone <OptionalTag /></Label>
                    <Input id="apContact" value={form.apContact} onChange={(e) => setForm({ ...form, apContact: e.target.value })} placeholder="e.g. Jane Doe · ap@acme.com · (555) 123-4567" className="mt-1.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Item 6: second save action where the form ends — same submit handler as the header button. */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-5">
              <SaveStatus state={saveState} at={savedAt} />
              {editingId ? (
                <Button type="button" variant="outline" size="lg" onClick={resetForm}>
                  Cancel Edit
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={resetForm} title="Clear the form for a fresh entry">
                  Start New
                </Button>
              )}
              <Button type="submit" size="lg" className="px-8">
                {editingId ? "Save Changes" : "Save Customer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      )}

      {/* Customers List */}
      {activeTab === "saved" && (
      <Card className="card">
        <CardHeader className="pb-4">
          <div>
            <CardTitle>Saved Customers</CardTitle>
            <CardDescription>
              {isLoaded
                ? `${customers.length} ${customers.length === 1 ? "customer" : "customers"} • Available in Project Pricer`
                : "Loading customers..."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!isLoaded ? (
            <div className="rounded-md border border-dashed bg-surface-2 p-8 text-center text-sm text-muted-foreground">
              Loading customers...
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-md border border-dashed bg-surface-2 p-8 text-center text-sm text-muted-foreground">
              No customers yet. Use the form above to add your first customer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((customer) => {
                      const jobCity = customer.jobSiteAddress?.city;
                      const billCity = customer.billingAddress?.city;
                      const displayCity = jobCity || billCity || "—";
                      return (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">
                            <button
                              type="button"
                              onClick={() => setProfileTarget(customer)}
                              className="text-left cursor-pointer hover:underline focus-visible:underline outline-none"
                              title="View profile"
                            >
                              {customer.name}
                            </button>
                          </TableCell>
                          <TableCell><CompletenessBadge customer={customer} /></TableCell>
                          <TableCell>{customer.contactName || "—"}</TableCell>
                          <TableCell className="text-sm">{displayCity}</TableCell>
                          <TableCell className="text-sm">{customer.email || "—"}</TableCell>
                          <TableCell className="text-sm">{customer.phone || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => loadForEdit(customer)}
                                title="Edit"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmDelete(customer)}
                                className="text-destructive hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Customer Profile (read-only) */}
      <Dialog open={!!profileTarget} onOpenChange={(open) => !open && setProfileTarget(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{profileTarget?.name || "Customer"}</DialogTitle>
            <DialogDescription>Customer profile — read-only view of the saved record.</DialogDescription>
          </DialogHeader>
          {profileTarget && (() => {
            const c = profileTarget;
            const billing: any = c.billingAddress || {};
            const job: any = c.jobSiteAddress || {};
            const billingCityLine = [[billing.city, billing.state].filter(Boolean).join(", "), billing.zip].filter(Boolean).join(" ");
            const jobCityLine = [[job.city, job.state].filter(Boolean).join(", "), job.zip].filter(Boolean).join(" ");
            const hasBilling = !!(billing.street || billing.street2 || billing.city || billing.state || billing.zip || billing.country);
            const hasContact = !!(c.contactName || c.title || c.phone || c.mobile || c.email);
            const dm: any = c.decisionMakerContact || c.altContact || {};
            const hasDM = !!(dm.name || dm.title || dm.phone || dm.mobile || dm.email);
            const hasBillingMeta = !!(c.paymentTerms || c.apContact);
            const hasJobAddr = !!(job.street || job.street2 || job.city || job.state || job.zip);
            // Job-site address is "same as billing" when it has no distinct address fields, or they all match billing.
            const addrSameAsBilling = !hasJobAddr || (
              (billing.street || "") === (job.street || "") &&
              (billing.street2 || "") === (job.street2 || "") &&
              (billing.city || "") === (job.city || "") &&
              (billing.state || "") === (job.state || "") &&
              (billing.zip || "") === (job.zip || "")
            );
            const labelCls = "text-muted-foreground";
            const headCls = "text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1";
            return (
              <div className="space-y-4 text-sm py-1">
                {/* Basic */}
                <section>
                  <h3 className={headCls}>Basic</h3>
                  <div className="font-medium">{c.name}</div>
                  {c.preferredContact && <div><span className={labelCls}>Preferred contact: </span>{c.preferredContact}</div>}
                  {c.website && <div><span className={labelCls}>Website: </span>{c.website}</div>}
                </section>

                {/* Primary Contact */}
                {hasContact && (
                  <section>
                    <h3 className={headCls}>Primary Contact</h3>
                    {(c.contactName || c.title) && <div>{[c.contactName, c.title].filter(Boolean).join(", ")}</div>}
                    {c.phone && <div><span className={labelCls}>Phone: </span>{c.phone}</div>}
                    {c.mobile && <div><span className={labelCls}>Mobile: </span>{c.mobile}</div>}
                    {c.email && <div><span className={labelCls}>Email: </span>{c.email}</div>}
                  </section>
                )}

                {/* Decision-Maker / Point of Contact (captured when the primary contact isn't the decision-maker) */}
                {hasDM && (
                  <section>
                    <h3 className={headCls}>Decision-Maker / Point of Contact</h3>
                    {(dm.name || dm.title) && <div>{[dm.name, dm.title].filter(Boolean).join(", ")}</div>}
                    {dm.phone && <div><span className={labelCls}>Phone: </span>{dm.phone}</div>}
                    {dm.mobile && <div><span className={labelCls}>Mobile: </span>{dm.mobile}</div>}
                    {dm.email && <div><span className={labelCls}>Email: </span>{renderContactLink(dm.email)}</div>}
                    {dm.preferredContact && <div><span className={labelCls}>Preferred contact: </span>{dm.preferredContact}</div>}
                  </section>
                )}

                {/* Billing Address */}
                {hasBilling && (
                  <section>
                    <h3 className={headCls}>Billing Address</h3>
                    {billing.street && <div>{billing.street}</div>}
                    {billing.street2 && <div>{billing.street2}</div>}
                    {billingCityLine && <div>{billingCityLine}</div>}
                    {billing.country && <div>{billing.country}</div>}
                  </section>
                )}

                {/* Billing & Terms */}
                {hasBillingMeta && (
                  <section>
                    <h3 className={headCls}>Billing &amp; Terms</h3>
                    {c.paymentTerms && <div><span className={labelCls}>Payment terms: </span>{c.paymentTerms}</div>}
                    {c.apContact && <div><span className={labelCls}>AP / Billing contact: </span>{renderContactLink(c.apContact)}</div>}
                  </section>
                )}

                {/* Job Site / Project Location */}
                <section>
                  <h3 className={headCls}>Job Site / Project Location</h3>
                  {addrSameAsBilling ? (
                    <div>Same as billing address</div>
                  ) : (
                    <>
                      {job.street && <div>{job.street}</div>}
                      {job.street2 && <div>{job.street2}</div>}
                      {jobCityLine && <div>{jobCityLine}</div>}
                    </>
                  )}
                  {/* GPS + access notes are job-specific extras; show whenever populated (even if address is same as billing). */}
                  {job.latitude != null && <div><span className={labelCls}>Latitude: </span>{job.latitude}</div>}
                  {job.longitude != null && <div><span className={labelCls}>Longitude: </span>{job.longitude}</div>}
                  {job.accessNotes && <div><span className={labelCls}>Access Notes: </span>{job.accessNotes}</div>}
                </section>

                {/* Internal Notes — internal admin view; never shown on the customer-facing quote. */}
                {c.notes && (
                  <section>
                    <h3 className={headCls}>Internal Notes</h3>
                    <div className="whitespace-pre-wrap">{c.notes}</div>
                  </section>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileTarget(null)}>Close</Button>
            <Button
              onClick={() => {
                const c = profileTarget;
                setProfileTarget(null);
                if (c) loadForEdit(c);
              }}
            >
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer?</DialogTitle>
            <DialogDescription>
              This will permanently remove “{deleteTarget?.name}”. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete}>
              Delete Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
