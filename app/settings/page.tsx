"use client"

import * as React from "react"
import { Settings } from "lucide-react"
import { useSalespeople } from "@/lib/salespeople"
import RegistryManager, { type RegistryItem } from "@/components/RegistryManager"
import { PHONE_PLACEHOLDER } from "@/lib/phone"

export default function SettingsPage() {
  const { salespeople, addSalesperson, updateSalesperson, deleteSalesperson } = useSalespeople()

  const items: RegistryItem[] = salespeople.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    values: { name: s.name, email: s.email || "", phone: s.phone || "" },
  }))

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Settings className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Settings &amp; Defaults</h1>
          <p className="text-muted-foreground">Manage the people and defaults that feed the Project Pricer.</p>
        </div>
      </div>

      {/* Salesperson Registry — shared RegistryManager (same pattern as Estimators in Company Setup) */}
      <RegistryManager
        title="Salespeople"
        itemNoun="Salesperson"
        description="The registry the Project Pricer’s salesperson dropdown reads from. Inactive people stay on record but are hidden from the dropdown."
        fields={[
          { key: "name", label: "Name", required: true, placeholder: "e.g. Scott Sinnott" },
          { key: "email", label: "Email", placeholder: "e.g. scott@company.com" },
          { key: "phone", label: "Phone", placeholder: PHONE_PLACEHOLDER, format: "phone" },
        ]}
        items={items}
        onAdd={(v, active) => addSalesperson({ name: v.name, email: v.email, phone: v.phone, active })}
        onUpdate={(id, v, active) =>
          updateSalesperson(id, {
            name: v.name.trim(),
            email: v.email.trim() || undefined,
            phone: v.phone.trim() || undefined,
            active,
          })
        }
        onDelete={(id) => deleteSalesperson(id)}
      />
    </div>
  )
}
