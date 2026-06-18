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
import { FileText, Edit2, Trash2, Star, RotateCcw, Plus, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAllTerms,
  saveTermsBlock,
  deleteTermsBlock,
  setDefaultTerms,
  type TermsBlock,
} from "@/lib/terms";

export default function TermsPage() {
  const [terms, setTerms] = React.useState<TermsBlock[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TermsBlock | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  // Form state
  const [form, setForm] = React.useState({
    name: "",
    body: "",
    isDefault: false,
  });

  // Load from storage on mount (SSR-safe via useEffect)
  React.useEffect(() => {
    try {
      const loaded = getAllTerms();
      setTerms(loaded);
    } catch {}
  }, []);

  // Persist on change (client only)
  React.useEffect(() => {
    // no-op here; lib handles persist on save/delete/setDefault
  }, [terms]);

  function resetForm() {
    setForm({ name: "", body: "", isDefault: false });
    setEditingId(null);
    setIsFormOpen(false);
  }

  function openCreate() {
    resetForm();
    setIsFormOpen(true);
  }

  function openEdit(block: TermsBlock) {
    setEditingId(block.id);
    setForm({
      name: block.name,
      body: block.body,
      isDefault: block.isDefault,
    });
    setIsFormOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;

    saveTermsBlock({
      id: editingId || undefined,
      name: form.name.trim(),
      body: form.body,
      isDefault: form.isDefault,
    });

    // refresh list
    setTerms(getAllTerms());
    resetForm();
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteTermsBlock(deleteTarget.id);
    setTerms(getAllTerms());
    setDeleteTarget(null);
  }

  function handleSetDefault(id: string) {
    setDefaultTerms(id);
    setTerms(getAllTerms());
  }

  function duplicateBlock(block: TermsBlock) {
    const now = new Date().toISOString();
    const copyName = `${block.name} (Copy)`;
    // Use saveTermsBlock to create new with unique id, copy body, not default
    saveTermsBlock({
      name: copyName,
      body: block.body,
      isDefault: false,
    });
    setTerms(getAllTerms());
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString() + " " + new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground mt-1">
            Create, edit, and manage reusable terms blocks. Mark one as default for quotes.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Terms Block
        </Button>
      </div>

      {/* List */}
      <Card className="border border-border bg-card dark:border-white/10 dark:bg-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-xl">Saved Terms Blocks</CardTitle>
          <CardDescription>
            {terms.length} block{terms.length === 1 ? "" : "s"} — only one can be default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {terms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No terms blocks yet. Create your first one above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terms.map((block) => (
                  <TableRow key={block.id} className="hover:bg-muted dark:hover:bg-white/5">
                    <TableCell className="font-medium">{block.name}</TableCell>
                    <TableCell className="max-w-[420px] truncate text-sm text-muted-foreground">
                      {block.body.replace(/\s+/g, " ").slice(0, 120)}
                      {block.body.length > 120 ? "…" : ""}
                    </TableCell>
                    <TableCell>
                      {block.isDefault ? (
                        <Badge className="bg-emerald-600 text-white border-emerald-700">Default</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(block.id)}
                          className="gap-1.5 border-border hover:bg-muted dark:border-white/20 dark:hover:bg-white/10"
                        >
                          <Star className="h-3.5 w-3.5" /> Set Default
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(block.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(block)}
                          className="h-8 w-8"
                          aria-label="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => duplicateBlock(block)}
                          className="h-8 w-8"
                          aria-label="Duplicate"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(block)}
                          className="h-8 w-8 text-red-400 hover:text-red-500"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open); }}>
        <DialogContent className="sm:max-w-[640px] bg-card border-border dark:bg-[#1a1a1a] dark:border-white/10">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Terms Block" : "New Terms Block"}</DialogTitle>
            <DialogDescription>
              Give it a clear name and paste the full terms text below.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Standard 30-day Net Terms"
                className="bg-background border-input dark:bg-black/30 dark:border-white/20"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Terms Text</Label>
              <textarea
                id="body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Enter the full terms and conditions here. Multi-line supported."
                className="min-h-[220px] w-full rounded-md bg-background border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-black/30 dark:border-white/20"
                required
              />
              <p className="text-[10px] text-muted-foreground">Supports newlines and basic formatting.</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="accent-[#EB3300]"
              />
              <Label htmlFor="isDefault" className="cursor-pointer text-sm">Make this the default terms block</Label>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                {editingId ? "Save Changes" : "Create Block"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[420px] bg-card border-border dark:bg-[#1a1a1a] dark:border-white/10">
          <DialogHeader>
            <DialogTitle>Delete Terms Block?</DialogTitle>
            <DialogDescription>
              This will permanently remove “{deleteTarget?.name}”. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help note */}
      <div className="text-[11px] text-muted-foreground px-1">
        Terms blocks are stored in your browser (localStorage) and will be available for use in future quote stages.
      </div>
    </div>
  );
}
