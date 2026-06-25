"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Settings, Plus, Edit2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSalespeople, type Salesperson } from "@/lib/salespeople"

export default function SettingsPage() {
  const { salespeople, addSalesperson, updateSalesperson, deleteSalesperson } = useSalespeople()

  // Editor form state (single form handles both Add New and edit-existing).
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [active, setActive] = React.useState(true)

  const isEditing = editingId !== null
  const trimmedName = name.trim()

  function resetForm() {
    setEditingId(null)
    setName("")
    setEmail("")
    setPhone("")
    setActive(true)
  }

  function startEdit(s: Salesperson) {
    setEditingId(s.id)
    setName(s.name)
    setEmail(s.email || "")
    setPhone(s.phone || "")
    setActive(s.active)
  }

  function save() {
    if (!trimmedName) return
    const payload = {
      name: trimmedName,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      active,
    }
    if (isEditing && editingId) {
      updateSalesperson(editingId, payload)
    } else {
      addSalesperson(payload)
    }
    resetForm()
  }

  function remove(id: string) {
    if (confirm("Delete this salesperson? Existing quotes keep their stored name.")) {
      deleteSalesperson(id)
      if (editingId === id) resetForm()
    }
  }

  const sorted = [...salespeople].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Settings className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Settings &amp; Defaults</h1>
          <p className="text-muted-foreground">Manage the people and defaults that feed the Project Pricer.</p>
        </div>
      </div>

      <Card className="card">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Salespeople</CardTitle>
              <CardDescription>
                The registry the Project Pricer&apos;s salesperson dropdown reads from. Inactive people stay on
                record but are hidden from the dropdown.
              </CardDescription>
            </div>
            <Button size="sm" onClick={resetForm} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" /> Add New Salesperson
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Editor — Add New (blank) or edit the selected salesperson */}
          <div className="rounded-lg border bg-surface-2 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="sp-name">Name <span className="text-destructive">*</span></Label>
                <Input
                  id="sp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Scott Sinnott"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="sp-email">Email <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  id="sp-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. scott@company.com"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="sp-phone">Phone <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  id="sp-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. (555) 123-4567"
                  className="mt-1.5"
                />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 pb-1.5">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm">Active <span className="text-muted-foreground">(shown in Pricer dropdown)</span></span>
                </label>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={!trimmedName}>
                {isEditing ? "Save Changes" : "Add Salesperson"}
              </Button>
              {isEditing && (
                <Button size="sm" variant="outline" onClick={resetForm}>Cancel Edit</Button>
              )}
            </div>
          </div>

          {/* Saved list */}
          <div>
            <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Saved Salespeople
            </div>
            {sorted.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-surface-2 p-10 text-center text-sm text-muted-foreground">
                No salespeople yet. Add your first above — it will appear in the Project Pricer dropdown.
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {sorted.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3 transition-colors",
                      !s.active && "opacity-60",
                      editingId === s.id && "bg-primary/5"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="cursor-pointer truncate text-left font-medium outline-none hover:underline focus-visible:underline"
                          title="Edit salesperson"
                        >
                          {s.name}
                        </button>
                        {s.active ? (
                          <Badge className="bg-primary/10 text-primary border-primary/30">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {editingId === s.id && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Editing</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[s.email, s.phone].filter(Boolean).join(" • ") || "No contact info"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(s)} title="Edit">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(s.id)}
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
