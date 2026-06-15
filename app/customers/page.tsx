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
import { Users, Edit2, Trash2, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/pmz-types";

const STORAGE_KEY = "pmz_customers";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

export default function CustomersPage() {
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Customer | null>(null);
  const [profileTarget, setProfileTarget] = React.useState<Customer | null>(null);

  // Collapsible sections state
  const [expanded, setExpanded] = React.useState({
    basic: true,
    billing: true,
    jobsite: true,
  });

  // Form state - expanded for full customer data
  const [form, setForm] = React.useState({
    // Basic
    name: "",
    contactName: "",
    title: "",
    phone: "",
    mobile: "",
    email: "",
    preferredContact: "Phone" as "Phone" | "Email" | "Text",
    website: "",
    notes: "",
    // Billing
    billingStreet: "",
    billingStreet2: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    billingCountry: "United States",
    // Job Site
    sameAsBilling: true,
    jobStreet: "",
    jobStreet2: "",
    jobCity: "",
    jobState: "",
    jobZip: "",
    jobLatitude: "",
    jobLongitude: "",
    jobAccessNotes: "",
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

  function resetForm() {
    setForm({
      name: "",
      contactName: "",
      title: "",
      phone: "",
      mobile: "",
      email: "",
      preferredContact: "Phone",
      website: "",
      notes: "",
      billingStreet: "",
      billingStreet2: "",
      billingCity: "",
      billingState: "",
      billingZip: "",
      billingCountry: "United States",
      sameAsBilling: true,
      jobStreet: "",
      jobStreet2: "",
      jobCity: "",
      jobState: "",
      jobZip: "",
      jobLatitude: "",
      jobLongitude: "",
      jobAccessNotes: "",
    });
    setEditingId(null);
    setExpanded({ basic: true, billing: true, jobsite: true });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const now = new Date();

    // Build billing address
    const billingAddress = {
      street: form.billingStreet.trim() || undefined,
      street2: form.billingStreet2.trim() || undefined,
      city: form.billingCity.trim() || undefined,
      state: form.billingState.trim() || undefined,
      zip: form.billingZip.trim() || undefined,
      country: form.billingCountry.trim() || "United States",
    };

    // Build job site address: copy from billing if same, else use provided
    let jobSiteAddress: any = undefined;
    if (form.sameAsBilling) {
      // copy billing
      jobSiteAddress = { ...billingAddress };
    } else {
      const lat = form.jobLatitude.trim() ? parseFloat(form.jobLatitude.trim()) : undefined;
      const lng = form.jobLongitude.trim() ? parseFloat(form.jobLongitude.trim()) : undefined;
      jobSiteAddress = {
        street: form.jobStreet.trim() || undefined,
        street2: form.jobStreet2.trim() || undefined,
        city: form.jobCity.trim() || undefined,
        state: form.jobState.trim() || undefined,
        zip: form.jobZip.trim() || undefined,
        latitude: !isNaN(lat as number) ? lat : undefined,
        longitude: !isNaN(lng as number) ? lng : undefined,
        accessNotes: form.jobAccessNotes.trim() || undefined,
      };
    }

    if (editingId) {
      // Update existing
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name: form.name.trim(),
                contactName: form.contactName.trim() || undefined,
                title: form.title.trim() || undefined,
                phone: form.phone.trim() || undefined,
                mobile: form.mobile.trim() || undefined,
                email: form.email.trim() || undefined,
                preferredContact: form.preferredContact,
                website: form.website.trim() || undefined,
                billingAddress: Object.values(billingAddress).some(v => v) ? billingAddress : undefined,
                jobSiteAddress: Object.values(jobSiteAddress || {}).some((v: any) => v) ? jobSiteAddress : undefined,
                notes: form.notes.trim() || undefined,
                updatedAt: now,
              }
            : c
        )
      );
    } else {
      // Create new
      const newCustomer: Customer = {
        id: createId(),
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        title: form.title.trim() || undefined,
        phone: form.phone.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
        email: form.email.trim() || undefined,
        preferredContact: form.preferredContact,
        website: form.website.trim() || undefined,
        billingAddress: Object.values(billingAddress).some(v => v) ? billingAddress : undefined,
        jobSiteAddress: Object.values(jobSiteAddress || {}).some((v: any) => v) ? jobSiteAddress : undefined,
        externalIds: undefined,
        tags: [],
        notes: form.notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      setCustomers((prev) => [...prev, newCustomer]);
    }

    resetForm();
  }

  function loadForEdit(customer: Customer) {
    setEditingId(customer.id);
    const billing = customer.billingAddress || {};
    const job = customer.jobSiteAddress || {};
    // Determine if job site is same as billing (or no job site data)
    const hasJobData = !!(job.street || job.city || job.state || job.zip || job.latitude || job.longitude || job.accessNotes);
    const addressesMatch =
      !hasJobData ||
      ( (billing.street || "") === (job.street || "") &&
        (billing.street2 || "") === (job.street2 || "") &&
        (billing.city || "") === (job.city || "") &&
        (billing.state || "") === (job.state || "") &&
        (billing.zip || "") === (job.zip || "") );
    const sameAsBilling = addressesMatch;

    setForm({
      name: customer.name,
      contactName: customer.contactName || "",
      title: customer.title || "",
      phone: customer.phone || "",
      mobile: customer.mobile || "",
      email: customer.email || "",
      preferredContact: customer.preferredContact || "Phone",
      website: customer.website || "",
      notes: customer.notes || "",
      billingStreet: billing.street || "",
      billingStreet2: billing.street2 || "",
      billingCity: billing.city || "",
      billingState: billing.state || "",
      billingZip: billing.zip || "",
      billingCountry: billing.country || "United States",
      sameAsBilling,
      jobStreet: job.street || "",
      jobStreet2: job.street2 || "",
      jobCity: job.city || "",
      jobState: job.state || "",
      jobZip: job.zip || "",
      jobLatitude: job.latitude != null ? String(job.latitude) : "",
      jobLongitude: job.longitude != null ? String(job.longitude) : "",
      jobAccessNotes: job.accessNotes || "",
    });
    setExpanded({ basic: true, billing: true, jobsite: true });
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

  function toggleSection(section: 'basic' | 'billing' | 'jobsite') {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function expandAll() {
    setExpanded({ basic: true, billing: true, jobsite: true });
  }

  function collapseAll() {
    setExpanded({ basic: false, billing: false, jobsite: false });
  }

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

      {/* Add / Edit Form */}
      <Card className="card">
        <CardHeader>
          <CardTitle>{editingId ? "Edit Customer" : "Add New Customer"}</CardTitle>
          <CardDescription>
            {editingId
              ? "Update the details for this customer."
              : "Name is required. Other fields are optional."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex gap-2 mb-2">
              <Button type="button" variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
            </div>

            {/* Basic Information */}
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('basic')}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold">BASIC INFORMATION</span>
                  {!expanded.basic && (
                    <span className="text-xs text-muted-foreground truncate">
                      {form.contactName || form.email ? `${form.contactName || ''}${form.contactName && form.email ? ' • ' : ''}${form.email || ''}` : 'No contact info'}
                    </span>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded.basic ? 'rotate-180' : ''}`} />
              </button>
              {expanded.basic && (
                <div className="p-4 border-t">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Acme Construction LLC"
                        required
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="contactName">Contact Name</Label>
                      <Input
                        id="contactName"
                        value={form.contactName}
                        onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                        placeholder="Jane Smith"
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="title">Title / Role</Label>
                      <Input
                        id="title"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Project Manager"
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="(555) 123-4567"
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="mobile">Mobile</Label>
                      <Input
                        id="mobile"
                        value={form.mobile}
                        onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                        placeholder="(555) 987-6543"
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="jane@acme.com"
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="preferredContact">Preferred Contact Method</Label>
                      <select
                        id="preferredContact"
                        value={form.preferredContact}
                        onChange={(e) => setForm({ ...form, preferredContact: e.target.value as any })}
                        className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="Phone">Phone</option>
                        <option value="Email">Email</option>
                        <option value="Text">Text</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={form.website}
                        onChange={(e) => setForm({ ...form, website: e.target.value })}
                        placeholder="https://acme.com"
                        className="mt-1.5"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label htmlFor="notes">Notes</Label>
                      <textarea
                        id="notes"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Prefers email for quotes. Net 30 terms. Prefers morning calls."
                        className="mt-1.5 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Billing Address */}
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('billing')}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold">BILLING ADDRESS (Build-To / Mailing)</span>
                  {!expanded.billing && (
                    <span className="text-xs text-muted-foreground truncate">
                      {[form.billingStreet, form.billingCity, form.billingState, form.billingZip].filter(Boolean).join(', ') || 'No address'}
                    </span>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded.billing ? 'rotate-180' : ''}`} />
              </button>
              {expanded.billing && (
                <div className="p-4 border-t">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="billingStreet">Street Address</Label>
                      <Input
                        id="billingStreet"
                        value={form.billingStreet}
                        onChange={(e) => setForm({ ...form, billingStreet: e.target.value })}
                        placeholder="123 Main St"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="billingStreet2">Street Address 2</Label>
                      <Input
                        id="billingStreet2"
                        value={form.billingStreet2}
                        onChange={(e) => setForm({ ...form, billingStreet2: e.target.value })}
                        placeholder="Suite 100"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="billingCity">City</Label>
                      <Input
                        id="billingCity"
                        value={form.billingCity}
                        onChange={(e) => setForm({ ...form, billingCity: e.target.value })}
                        placeholder="Springfield"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="billingState">State / Province</Label>
                      <Input
                        id="billingState"
                        value={form.billingState}
                        onChange={(e) => setForm({ ...form, billingState: e.target.value })}
                        placeholder="IL"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="billingZip">Postal / ZIP Code</Label>
                      <Input
                        id="billingZip"
                        value={form.billingZip}
                        onChange={(e) => setForm({ ...form, billingZip: e.target.value })}
                        placeholder="62701"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="billingCountry">Country</Label>
                      <Input
                        id="billingCountry"
                        value={form.billingCountry}
                        onChange={(e) => setForm({ ...form, billingCountry: e.target.value })}
                        placeholder="United States"
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Job Site / Project Location */}
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('jobsite')}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold">JOB SITE / PROJECT LOCATION</span>
                  {!expanded.jobsite && (
                    <span className="text-xs text-muted-foreground truncate">
                      {form.sameAsBilling
                        ? 'Same as billing address'
                        : [form.jobStreet, form.jobCity, form.jobState, form.jobZip].filter(Boolean).join(', ') || 'No address'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    id="sameAsBilling"
                    type="checkbox"
                    checked={form.sameAsBilling}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      const newForm = { ...form, sameAsBilling: checked };
                      if (checked) {
                        newForm.jobStreet = form.billingStreet;
                        newForm.jobStreet2 = form.billingStreet2;
                        newForm.jobCity = form.billingCity;
                        newForm.jobState = form.billingState;
                        newForm.jobZip = form.billingZip;
                        setExpanded((prev) => ({ ...prev, jobsite: false }));
                      } else {
                        setExpanded((prev) => ({ ...prev, jobsite: true }));
                      }
                      setForm(newForm);
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  <Label htmlFor="sameAsBilling" className="text-xs cursor-pointer">same as billing</Label>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded.jobsite ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {expanded.jobsite && !form.sameAsBilling && (
                <div className="p-4 border-t">
                  <div className="grid gap-4 sm:grid-cols-2 border border-border rounded-md p-4 bg-muted/30">
                    <div className="sm:col-span-2">
                      <Label htmlFor="jobStreet">Street Address</Label>
                      <Input
                        id="jobStreet"
                        value={form.jobStreet}
                        onChange={(e) => setForm({ ...form, jobStreet: e.target.value })}
                        placeholder="456 Oak Ave (job site)"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="jobStreet2">Street Address 2</Label>
                      <Input
                        id="jobStreet2"
                        value={form.jobStreet2}
                        onChange={(e) => setForm({ ...form, jobStreet2: e.target.value })}
                        placeholder="Rear entrance"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="jobCity">City</Label>
                      <Input
                        id="jobCity"
                        value={form.jobCity}
                        onChange={(e) => setForm({ ...form, jobCity: e.target.value })}
                        placeholder="Springfield"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="jobState">State / Province</Label>
                      <Input
                        id="jobState"
                        value={form.jobState}
                        onChange={(e) => setForm({ ...form, jobState: e.target.value })}
                        placeholder="IL"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="jobZip">Postal / ZIP Code</Label>
                      <Input
                        id="jobZip"
                        value={form.jobZip}
                        onChange={(e) => setForm({ ...form, jobZip: e.target.value })}
                        placeholder="62701"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4 col-span-2">
                      <div>
                        <Label htmlFor="jobLatitude">Latitude</Label>
                        <Input
                          id="jobLatitude"
                          value={form.jobLatitude}
                          onChange={(e) => setForm({ ...form, jobLatitude: e.target.value })}
                          placeholder="39.7817"
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="jobLongitude">Longitude</Label>
                        <Input
                          id="jobLongitude"
                          value={form.jobLongitude}
                          onChange={(e) => setForm({ ...form, jobLongitude: e.target.value })}
                          placeholder="-89.6501"
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="jobAccessNotes">Access Notes / Delivery Instructions</Label>
                      <textarea
                        id="jobAccessNotes"
                        value={form.jobAccessNotes}
                        onChange={(e) => setForm({ ...form, jobAccessNotes: e.target.value })}
                        placeholder="Gate code 1234. Deliver to back lot. Call foreman on arrival."
                        className="mt-1.5 w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                </div>
              )}
              {expanded.jobsite && form.sameAsBilling && (
                <div className="p-4 border-t text-xs text-muted-foreground">
                  Same as billing address
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg" className="px-8">
                {editingId ? "Save Changes" : "Add Customer"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" size="lg" onClick={resetForm}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Customers List */}
      <Card className="card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Saved Customers</CardTitle>
              <CardDescription>
                {isLoaded
                  ? `${customers.length} ${customers.length === 1 ? "customer" : "customers"} • Available in Project Pricer`
                  : "Loading customers..."}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetForm}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Clear Form
            </Button>
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
