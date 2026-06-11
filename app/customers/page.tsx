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
import { Users, Edit2, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/pmz-types";

const STORAGE_KEY = "pmz_customers";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

export default function CustomersPage() {
  // Initialize from localStorage synchronously so data is present on first render
  // and survives tab unmount/remount without an initial empty state overwriting LS.
  const [customers, setCustomers] = React.useState<Customer[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        return parsed.map((c: any) => ({
          ...c,
          createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
          updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
        }));
      }
    } catch {}
    return [];
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Customer | null>(null);

  // Form state
  const [form, setForm] = React.useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    notes: "",
  });

  // Persist to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
    } catch {}
  }, [customers]);

  function resetForm() {
    setForm({
      name: "",
      contactName: "",
      email: "",
      phone: "",
      website: "",
      notes: "",
    });
    setEditingId(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const now = new Date();

    if (editingId) {
      // Update existing
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name: form.name.trim(),
                contactName: form.contactName.trim() || undefined,
                email: form.email.trim() || undefined,
                phone: form.phone.trim() || undefined,
                website: form.website.trim() || undefined,
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
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        billingAddress: undefined,
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
    setForm({
      name: customer.name,
      contactName: customer.contactName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      website: customer.website || "",
      notes: customer.notes || "",
    });
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
          <form onSubmit={handleSubmit} className="space-y-6">
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
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Prefers email for quotes. Net 30 terms."
                  className="mt-1.5"
                />
              </div>
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
                {customers.length} {customers.length === 1 ? "customer" : "customers"} • Available in Project Pricer
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
          {customers.length === 0 ? (
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
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>{customer.contactName || "—"}</TableCell>
                        <TableCell className="text-sm">{customer.email || "—"}</TableCell>
                        <TableCell className="text-sm">{customer.phone || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {customer.website ? (
                            <a
                              href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {customer.website.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
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
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
