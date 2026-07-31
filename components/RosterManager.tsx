"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { UserPlus } from "lucide-react"
import { usePeople, ROLES, type Role } from "@/lib/people"
import { formatPhone, PHONE_PLACEHOLDER } from "@/lib/phone"

/**
 * RosterManager — the ONE place people are created and edited (COMPANY-ROSTER-AND-ROLES.md, Law 9).
 * Replaces the two legacy registry builders (Estimators in Company Setup, Salespeople in Settings).
 * People are never deleted — deactivate only; the id stays stamped on past quotes.
 */

const ROLE_LABELS: Record<Role, string> = {
  salesperson: "Salesperson/Estimator",
  foreman: "Foreman",
  accountant: "Accountant",
  boss: "Boss",
}

export default function RosterManager() {
  const { people, addPerson, updatePerson } = usePeople()

  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [roles, setRoles] = React.useState<Role[]>(["salesperson"])

  const sorted = React.useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people]
  )

  const toggleNewRole = (r: Role) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))

  const addNew = () => {
    if (!name.trim()) return
    addPerson({
      name,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      roles: roles.length ? roles : (["salesperson"] as Role[]),
      active: true,
    })
    setName("")
    setEmail("")
    setPhone("")
    setRoles(["salesperson"])
  }

  const togglePersonRole = (id: string, current: Role[], r: Role) => {
    const next = current.includes(r) ? current.filter((x) => x !== r) : [...current, r]
    updatePerson(id, { roles: next })
  }

  return (
    <Card className="card">
      <CardHeader>
        <CardTitle className="text-xl">Company Roster</CardTitle>
        <CardDescription>
          The one home for your people (Law 9). Assign roles; the Project Pricer&rsquo;s
          Salesperson/Estimator picker reads active people with that role. People are never deleted —
          deactivate instead; their id stays stamped on past quotes.
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. scott@company.com"
                className="mt-1.5"
              />
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
              <div className="mt-1.5 flex flex-wrap gap-4">
                {ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={roles.includes(r)}
                      onChange={() => toggleNewRole(r)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm">{ROLE_LABELS[r]}</span>
                  </label>
                ))}
              </div>
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
              {sorted.map((p) => (
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
                    </div>
                    <label className="flex cursor-pointer items-center gap-2" title="Deactivate keeps the person on record (no delete)">
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={(e) => updatePerson(p.id, { active: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm">Active</span>
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {ROLES.map((r) => (
                      <label key={r} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.roles.includes(r)}
                          onChange={() => togglePersonRole(p.id, p.roles, r)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm">{ROLE_LABELS[r]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
