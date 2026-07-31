"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Pencil } from "lucide-react"
import { usePeople, ROLES, type Role, type Person } from "@/lib/people"
import { formatPhone, PHONE_PLACEHOLDER } from "@/lib/phone"

/**
 * RosterManager — the ONE place people are created and edited (COMPANY-ROSTER-AND-ROLES.md, Law 9).
 * Replaces the two legacy registry builders (Estimators in Company Setup, Salespeople in Settings).
 *
 * List rows are READ-ONLY — roles and active are never one-click editable (no permission change by a
 * graze). Each person has an Edit button; edits stage in local state and apply only on Save. A Save
 * that changes any ROLE or the ACTIVE flag is confirmed with a plain statement. People are never
 * deleted — deactivate instead; the id stays stamped on past quotes, so a rename follows the person.
 */

const ROLE_LABELS: Record<Role, string> = {
  salesperson: "Salesperson/Estimator",
  foreman: "Foreman",
  accountant: "Accountant",
  boss: "Boss",
}

// Reject clearly malformed emails (must contain @ and a domain with a dot). Empty is allowed — email
// is optional; callers only validate non-empty values.
function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

export default function RosterManager() {
  const { people, addPerson, updatePerson } = usePeople()

  // Add-a-person form
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  // No default roles — roles are chosen, never defaulted (a foreman must not silently gain a sales role).
  const [roles, setRoles] = React.useState<Role[]>([])
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const [roleError, setRoleError] = React.useState<string | null>(null)

  // Edit mode (one row at a time)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [eName, setEName] = React.useState("")
  const [eEmail, setEEmail] = React.useState("")
  const [ePhone, setEPhone] = React.useState("")
  const [eRoles, setERoles] = React.useState<Role[]>([])
  const [eActive, setEActive] = React.useState(true)
  const [eEmailError, setEEmailError] = React.useState<string | null>(null)
  const [eRoleError, setERoleError] = React.useState<string | null>(null)

  const sorted = React.useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people]
  )

  const toggleNewRole = (r: Role) => {
    setRoleError(null)
    setRoles((prev) => toggle(prev, r))
  }

  const addNew = () => {
    if (!name.trim()) return
    const trimmedEmail = email.trim()
    let ok = true
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setEmailError("Enter a valid email (e.g. name@company.com), or leave it blank.")
      ok = false
    } else {
      setEmailError(null)
    }
    if (roles.length === 0) {
      setRoleError("Pick at least one role.")
      ok = false
    } else {
      setRoleError(null)
    }
    if (!ok) return
    addPerson({
      name,
      email: trimmedEmail || undefined,
      phone: phone.trim() || undefined,
      roles,
      active: true,
    })
    setName("")
    setEmail("")
    setPhone("")
    setRoles([])
    setEmailError(null)
    setRoleError(null)
  }

  const startEdit = (p: Person) => {
    setEditingId(p.id)
    setEName(p.name)
    setEEmail(p.email || "")
    setEPhone(p.phone || "")
    setERoles([...p.roles])
    setEActive(p.active)
    setEEmailError(null)
    setERoleError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEEmailError(null)
    setERoleError(null)
  }

  const toggleEditRole = (r: Role) => {
    setERoleError(null)
    setERoles((prev) => toggle(prev, r))
  }

  // Compose the plain-language confirmation for any ROLE or ACTIVE change. Empty ⇒ nothing to confirm.
  const permissionConfirm = (original: Person): string | null => {
    const changes: string[] = []
    ROLES.forEach((r) => {
      const had = original.roles.includes(r)
      const has = eRoles.includes(r)
      if (had && !has) changes.push(`Remove ${ROLE_LABELS[r]} from ${original.name}`)
      if (!had && has) changes.push(`Add ${ROLE_LABELS[r]} to ${original.name}`)
    })
    if (original.active !== eActive) {
      changes.push(eActive ? `Reactivate ${original.name}` : `Deactivate ${original.name}`)
    }
    if (changes.length === 0) return null
    if (changes.length === 1) return `${changes[0]}?`
    return `Apply these permission changes to ${original.name}?\n\n- ${changes.join("\n- ")}`
  }

  const saveEdit = () => {
    if (!editingId) return
    const original = people.find((p) => p.id === editingId)
    if (!original) return
    if (!eName.trim()) return
    const trimmedEmail = eEmail.trim()
    let ok = true
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setEEmailError("Enter a valid email (e.g. name@company.com), or leave it blank.")
      ok = false
    } else {
      setEEmailError(null)
    }
    if (eRoles.length === 0) {
      setERoleError("Pick at least one role.")
      ok = false
    } else {
      setERoleError(null)
    }
    if (!ok) return

    // Role / active changes are stated decisions, never a graze. Name/email/phone edits are safe.
    const confirmMsg = permissionConfirm(original)
    if (confirmMsg && !window.confirm(confirmMsg)) return

    updatePerson(editingId, {
      name: eName.trim(),
      email: trimmedEmail || undefined,
      phone: ePhone.trim() || undefined,
      roles: eRoles,
      active: eActive,
    })
    cancelEdit()
  }

  const roleCheckboxes = (selected: Role[], onToggle: (r: Role) => void, idPrefix: string) => (
    <div className="mt-1.5 flex flex-wrap gap-4">
      {ROLES.map((r) => (
        <label key={r} htmlFor={`${idPrefix}-${r}`} className="flex cursor-pointer items-center gap-2">
          <input
            id={`${idPrefix}-${r}`}
            type="checkbox"
            checked={selected.includes(r)}
            onChange={() => onToggle(r)}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm">{ROLE_LABELS[r]}</span>
        </label>
      ))}
    </div>
  )

  return (
    <Card className="card">
      <CardHeader>
        <CardTitle className="text-xl">Company Roster</CardTitle>
        <CardDescription>
          The one home for your people (Law 9). The Project Pricer&rsquo;s Salesperson/Estimator picker
          reads active people with that role. Roles and active status change only through Edit &rarr; Save,
          and a permission change is confirmed. People are never deleted — deactivate instead; their id
          stays stamped on past quotes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add a person */}
        <div className="rounded-lg border bg-surface-2 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="roster-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="roster-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Scott Sinnott"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="roster-email">
                Email <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="roster-email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(null) }}
                placeholder="e.g. scott@company.com"
                className="mt-1.5"
              />
              {emailError && <p className="mt-1 text-[11px] font-medium text-[#EB3300]">{emailError}</p>}
            </div>
            <div>
              <Label htmlFor="roster-phone">
                Phone <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="roster-phone"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder={PHONE_PLACEHOLDER}
                inputMode="numeric"
                className="mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Roles</Label>
              {roleCheckboxes(roles, toggleNewRole, "new-role")}
              {roleError && <p className="mt-1.5 text-[11px] font-medium text-[#EB3300]">{roleError}</p>}
            </div>
          </div>
          <div className="mt-4">
            <Button size="sm" onClick={addNew} disabled={!name.trim()}>
              <UserPlus className="h-4 w-4" /> Add Person
            </Button>
          </div>
        </div>

        {/* Roster list */}
        <div>
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            People ({people.length})
          </div>
          {sorted.length === 0 ? (
            <div className="rounded-md border border-dashed bg-surface-2 p-4 text-xs text-muted-foreground">
              No people yet. Add your first above.
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((p) =>
                editingId === p.id ? (
                  /* Edit mode — nothing applies until Save. */
                  <div key={p.id} className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label htmlFor="edit-name">
                          Name <span className="text-destructive">*</span>
                        </Label>
                        <Input id="edit-name" value={eName} onChange={(e) => setEName(e.target.value)} className="mt-1.5" />
                      </div>
                      <div>
                        <Label htmlFor="edit-email">
                          Email <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="edit-email"
                          value={eEmail}
                          onChange={(e) => { setEEmail(e.target.value); setEEmailError(null) }}
                          placeholder="e.g. scott@company.com"
                          className="mt-1.5"
                        />
                        {eEmailError && <p className="mt-1 text-[11px] font-medium text-[#EB3300]">{eEmailError}</p>}
                      </div>
                      <div>
                        <Label htmlFor="edit-phone">
                          Phone <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="edit-phone"
                          value={ePhone}
                          onChange={(e) => setEPhone(formatPhone(e.target.value))}
                          placeholder={PHONE_PLACEHOLDER}
                          inputMode="numeric"
                          className="mt-1.5"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Roles</Label>
                        {roleCheckboxes(eRoles, toggleEditRole, "edit-role")}
                        {eRoleError && <p className="mt-1.5 text-[11px] font-medium text-[#EB3300]">{eRoleError}</p>}
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={eActive}
                            onChange={(e) => setEActive(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm">Active</span>
                        </label>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <Button size="sm" onClick={saveEdit} disabled={!eName.trim()}>Save</Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  /* Read-only row — no clickable roles/active here. */
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.active ? (
                            <Badge className="border-primary/30 bg-primary/10 text-primary">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[p.email, p.phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Roles: <span className="text-foreground">{p.roles.map((r) => ROLE_LABELS[r]).join(" · ") || "—"}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
