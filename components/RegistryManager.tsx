"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPhone } from "@/lib/phone"

/**
 * RegistryManager — the single shared "saved list + editor" pattern for people registries
 * (Estimators in Company Setup, Salespeople in Settings). Lifts the Rate Builder tab/layout:
 * a 2-tab bar (‹Title› saved list | Add New), with the saved tab showing a left list of
 * underlined clickable names + Active/Inactive badge + delete, and a right editor that loads
 * the clicked record. The Add New tab is a blank form; on save it jumps to the saved tab with
 * the new record selected.
 *
 * Field-driven so both registries share ONE component (locked rule: one pattern everywhere).
 * The first field is treated as the display name. onAdd returns the new id (when the registry
 * hook provides one) so the editor can select it after adding.
 */

export interface RegistryField {
  key: string
  label: string
  required?: boolean
  placeholder?: string
  /** "phone" routes input through the shared xxx-xxx-xxxx formatter. */
  format?: "phone"
}

export interface RegistryItem {
  id: string
  name: string
  active: boolean
  values: Record<string, string>
}

export interface RegistryManagerProps {
  title: string // e.g. "Estimators" — also the saved-list tab label
  itemNoun: string // singular, e.g. "Estimator" — used in buttons / messages
  description?: string
  fields: RegistryField[] // fields[0] is the display name
  items: RegistryItem[]
  onAdd: (values: Record<string, string>, active: boolean) => string | void
  onUpdate: (id: string, values: Record<string, string>, active: boolean) => void
  onDelete: (id: string) => void
}

function blankValues(fields: RegistryField[]): Record<string, string> {
  const v: Record<string, string> = {}
  fields.forEach((f) => (v[f.key] = ""))
  return v
}

export default function RegistryManager({
  title,
  itemNoun,
  description,
  fields,
  items,
  onAdd,
  onUpdate,
  onDelete,
}: RegistryManagerProps) {
  const nameKey = fields[0]?.key || "name"
  const [activeTab, setActiveTab] = React.useState<"saved" | "add">("saved")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [values, setValues] = React.useState<Record<string, string>>(() => blankValues(fields))
  const [active, setActive] = React.useState(true)

  const sorted = React.useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  )
  const nameValue = (values[nameKey] || "").trim()
  const selectedItem = selectedId ? sorted.find((i) => i.id === selectedId) || null : null

  function setField(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  // Imperative load on click (matches Rate Builder) — no effect syncing, so in-progress edits
  // are never silently clobbered.
  function loadInto(item: RegistryItem) {
    setSelectedId(item.id)
    setValues({ ...blankValues(fields), ...item.values })
    setActive(item.active)
    setActiveTab("saved")
  }

  function goAddNew() {
    setSelectedId(null)
    setValues(blankValues(fields))
    setActive(true)
    setActiveTab("add")
  }

  function saveExisting() {
    if (!nameValue || !selectedId) return
    onUpdate(selectedId, values, active)
  }

  function saveNew() {
    if (!nameValue) return
    const id = onAdd(values, active)
    // Jump to the saved list with the just-added record loaded for review.
    setActiveTab("saved")
    if (typeof id === "string") setSelectedId(id)
  }

  function remove(id: string) {
    if (confirm(`Delete this ${itemNoun.toLowerCase()}? Existing quotes keep their stored name.`)) {
      onDelete(id)
      if (selectedId === id) {
        setSelectedId(null)
        setValues(blankValues(fields))
        setActive(true)
      }
    }
  }

  // Shared editor body (plain JSX, not a nested component — keeps input focus across renders).
  const formBody = (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.key === nameKey ? "sm:col-span-2" : undefined}>
          <Label htmlFor={`reg-${f.key}`}>
            {f.label}{" "}
            {f.required ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
            )}
          </Label>
          <Input
            id={`reg-${f.key}`}
            value={values[f.key] || ""}
            onChange={(e) => setField(f.key, f.format === "phone" ? formatPhone(e.target.value) : e.target.value)}
            placeholder={f.placeholder}
            inputMode={f.format === "phone" ? "numeric" : undefined}
            className="mt-1.5"
          />
        </div>
      ))}
      <div className="flex items-end sm:col-span-2">
        <label className="flex cursor-pointer items-center gap-2 pb-1.5">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm">
            Active <span className="text-muted-foreground">(shown in Pricer dropdown)</span>
          </span>
        </label>
      </div>
    </div>
  )

  const tabClass = (on: boolean) =>
    cn(
      "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
      on
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
    )

  return (
    <Card className="card">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Tab bar — Rate Builder styling */}
        <div className="flex items-center">
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-sm">
            <button onClick={() => setActiveTab("saved")} className={tabClass(activeTab === "saved")}>
              {title}
              {items.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0 text-[10px] font-mono text-muted-foreground">
                  {items.length}
                </span>
              )}
            </button>
            <button onClick={goAddNew} className={tabClass(activeTab === "add")}>
              <Plus className="h-4 w-4" /> Add New
            </button>
          </div>
        </div>

        {/* Saved tab — left list + right editor */}
        {activeTab === "saved" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4 xl:col-span-3">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Saved {title}
              </div>
              {sorted.length === 0 ? (
                <div className="rounded-md border border-dashed bg-surface-2 p-4 text-xs text-muted-foreground">
                  No {title.toLowerCase()} yet. Use &ldquo;Add New&rdquo; to create your first.
                </div>
              ) : (
                <div className="space-y-1">
                  {sorted.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors",
                        selectedId === item.id
                          ? "border-primary/40 bg-primary/5"
                          : "border-transparent hover:border-border hover:bg-muted"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => loadInto(item)}
                          className={cn(
                            "truncate text-left text-sm outline-none hover:underline focus-visible:underline",
                            selectedId === item.id && "font-medium"
                          )}
                          title={`Edit ${itemNoun.toLowerCase()}`}
                        >
                          {item.name}
                        </button>
                        {item.active ? (
                          <Badge className="shrink-0 border-primary/30 bg-primary/10 text-primary">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">Inactive</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-60 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        onClick={() => remove(item.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-8 xl:col-span-9">
              {selectedItem ? (
                <div className="rounded-lg border bg-surface-2 p-4">
                  {formBody}
                  <div className="mt-4 flex items-center gap-2">
                    <Button size="sm" onClick={saveExisting} disabled={!nameValue}>
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove(selectedItem.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed bg-surface-2 p-6 text-center text-sm text-muted-foreground">
                  <span>
                    Select a {itemNoun.toLowerCase()} on the left to edit, or use
                    <span className="mx-1 font-medium text-foreground">Add New</span>.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add New tab — blank form */}
        {activeTab === "add" && (
          <div className="max-w-2xl rounded-lg border bg-surface-2 p-4">
            {formBody}
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" onClick={saveNew} disabled={!nameValue}>
                Add {itemNoun}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveTab("saved")}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
