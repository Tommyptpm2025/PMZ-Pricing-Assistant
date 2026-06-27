"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Building2, AlertTriangle, Check } from "lucide-react"
import {
  useCompanySettings,
  computeAnnualInterest,
  type CompanySettings,
} from "@/lib/company-settings"
import { useEstimators } from "@/lib/estimators"
import RegistryManager, { type RegistryItem } from "@/components/RegistryManager"
import { formatPhone, PHONE_PLACEHOLDER } from "@/lib/phone"

// Local draft type alias for readability
type Group = keyof CompanySettings

export default function CompanySetupPage() {
  const { settings, save } = useCompanySettings()

  // Draft form state — seeded from the live settings once they load, then owner-edited.
  const [form, setForm] = React.useState<CompanySettings>(settings)
  const [savedFlash, setSavedFlash] = React.useState(false)

  // Re-seed the draft whenever the persisted settings change (initial load / cross-tab edit),
  // but only while the user hasn't started editing an unsaved draft of their own.
  const dirtyRef = React.useRef(false)
  React.useEffect(() => {
    if (!dirtyRef.current) setForm(settings)
  }, [settings])

  function setField<G extends Group>(group: G, key: keyof CompanySettings[G], value: string) {
    dirtyRef.current = true
    setSavedFlash(false)
    setForm((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }))
  }

  // Years Experience auto-calculates from Year Founded (current year − founded). When founded is a
  // valid year the field is read-only and we persist the computed value so the token resolves correctly.
  const currentYear = new Date().getFullYear()
  const foundedYear = parseInt(form.company.year_founded, 10)
  const autoYears =
    Number.isFinite(foundedYear) && foundedYear >= 1900 && foundedYear <= currentYear
      ? String(currentYear - foundedYear)
      : null

  function handleSave() {
    const toSave = autoYears !== null
      ? { ...form, company: { ...form.company, years_experience: autoYears } }
      : form
    save(toSave)
    dirtyRef.current = false
    setSavedFlash(true)
  }

  // Company logo — shared with the Update Export dialog via the pmz_quote_logo key, rendered
  // top-left on the document header. Stored separately from the settings JSON to keep it lean.
  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    try { setLogoDataUrl(localStorage.getItem("pmz_quote_logo")) } catch {}
  }, [])

  function onLogoFile(file: File) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setLogoDataUrl(dataUrl)
      try { localStorage.setItem("pmz_quote_logo", dataUrl) } catch {}
    }
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    setLogoDataUrl(null)
    try { localStorage.removeItem("pmz_quote_logo") } catch {}
  }

  const annualInterest = computeAnnualInterest(form.terms.late_interest_monthly_pct)

  return (
    <div className="max-w-4xl space-y-8 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Building2 className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Company Setup</h1>
          <p className="text-muted-foreground">
            Set once. These details auto-fill your quotes, terms, and payment-terms blocks.
          </p>
        </div>
      </div>

      {/* Company Logo */}
      <Card className="card">
        <CardHeader>
          <CardTitle className="text-xl">Company Logo</CardTitle>
          <CardDescription>Shown top-left on every quote document. PNG or JPG.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoFile(f) }}
              className="text-sm"
            />
            {logoDataUrl && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoDataUrl} alt="Logo preview" className="h-10 w-auto rounded border bg-white p-1" />
                <Button variant="outline" size="sm" onClick={removeLogo}>Remove</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Company */}
      <Section title="Company" description="Your legal identity and contact details — shown on every document header and footer.">
        <Field label="Legal Name" value={form.company.legal_name} onChange={(v) => setField("company", "legal_name", v)} placeholder="e.g. Total Profit Management LLC" />
        <Field label="Short Name" value={form.company.short_name} onChange={(v) => setField("company", "short_name", v)} placeholder="e.g. TPM" />
        <Field label="Website" value={form.company.website} onChange={(v) => setField("company", "website", v)} placeholder="e.g. totalprofitmanagement.com" />
        <Field label="Phone" value={form.company.phone} onChange={(v) => setField("company", "phone", formatPhone(v))} placeholder={`e.g. ${PHONE_PLACEHOLDER}`} />
        <Field label="Email" value={form.company.email} onChange={(v) => setField("company", "email", v)} placeholder="e.g. office@company.com" />
        <Field label="Address" value={form.company.address} onChange={(v) => setField("company", "address", v)} placeholder="e.g. 123 Main St" />
        <Field label="City, State ZIP" value={form.company.city_state_zip} onChange={(v) => setField("company", "city_state_zip", v)} placeholder="ZIP auto-fills city and state (coming soon)" />
        <Field label="Year Founded" value={form.company.year_founded} onChange={(v) => setField("company", "year_founded", v)} placeholder="e.g. 2014" />
        {autoYears !== null ? (
          <div>
            <Label htmlFor="years-exp-auto">Years Experience</Label>
            <Input id="years-exp-auto" value={autoYears} readOnly disabled className="mt-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">Auto-calculated from Year Founded.</p>
          </div>
        ) : (
          <Field label="Years Experience" value={form.company.years_experience} onChange={(v) => setField("company", "years_experience", v)} placeholder="e.g. 20" />
        )}
        <Field label="Payment Methods" value={form.company.payment_methods} onChange={(v) => setField("company", "payment_methods", v)} placeholder="e.g. Check, ACH, all major cards" multiline />
      </Section>

      {/* Estimators — registry (mirrors the Salesperson Registry pattern, one pattern everywhere) */}
      <EstimatorRegistry />

      {/* Terms */}
      <Section title="Default Terms" description="Drive the auto-composed Payment Terms block. Enter numbers only (no % sign).">
        <Field label="Deposit %" value={form.terms.deposit_pct} onChange={(v) => setField("terms", "deposit_pct", v)} placeholder="e.g. 30" />
        <Field label="Balance Due (days)" value={form.terms.balance_due_days} onChange={(v) => setField("terms", "balance_due_days", v)} placeholder="e.g. 10" />
        <div>
          <Field label="Late Interest % / month" value={form.terms.late_interest_monthly_pct} onChange={(v) => setField("terms", "late_interest_monthly_pct", v)} placeholder="e.g. 1.5" />
          <p className="mt-1 text-xs text-muted-foreground">
            {annualInterest ? <>= <span className="font-medium text-foreground">{annualInterest}%</span> / year (auto-calculated)</> : "Annual rate auto-calculates from monthly × 12."}
          </p>
        </div>
        <Field label="Change Order Deposit %" value={form.terms.change_order_deposit_pct} onChange={(v) => setField("terms", "change_order_deposit_pct", v)} placeholder="e.g. 50" />
        <Field label="Cancellation Fee %" value={form.terms.cancellation_fee_pct} onChange={(v) => setField("terms", "cancellation_fee_pct", v)} placeholder="e.g. 10" />
        <Field label="Quote Validity (days)" value={form.terms.quote_validity_days} onChange={(v) => setField("terms", "quote_validity_days", v)} placeholder="e.g. 30" />
      </Section>

      {/* Lien */}
      <Section title="Lien" description="State-specific lien language. Review with counsel before relying on it.">
        <Field label="Lien State" value={form.lien.state} onChange={(v) => setField("lien", "state", v)} placeholder="e.g. IL" />
        <Field label="Withhold (days)" value={form.lien.withhold_days} onChange={(v) => setField("lien", "withhold_days", v)} placeholder="e.g. 10" />
        <div className="sm:col-span-2">
          <Field label="State Notice Text" value={form.lien.state_notice_text} onChange={(v) => setField("lien", "state_notice_text", v)} placeholder="Paste the state-required lien notice language here." multiline />
          {/* Amber attorney-review warning — NOT TPM red (red is reserved for required-field / LEM gates). */}
          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs leading-snug">
              <span className="font-semibold">Attorney review required.</span> Lien notice wording is jurisdiction-specific and legally binding. Have counsel confirm this text before it appears on a customer document.
            </p>
          </div>
        </div>
      </Section>

      {/* Legal */}
      <Section title="Legal" description="Statutory references used in document language.">
        <Field label="Utility Locator" value={form.legal.utility_locator} onChange={(v) => setField("legal", "utility_locator", v)} placeholder="e.g. JULIE 811" />
      </Section>

      {/* Process */}
      <Section title="Process" description="Operational thresholds referenced in terms.">
        <Field label="Cure / Avoid (hours)" value={form.process.cure_avoid_hours} onChange={(v) => setField("process", "cure_avoid_hours", v)} placeholder="e.g. 24" />
      </Section>

      {/* Save bar */}
      <div className="sticky bottom-0 -mx-2 flex items-center gap-3 border-t bg-background/95 px-2 py-4 backdrop-blur">
        <Button onClick={handleSave} className="font-semibold">Save Company Settings</Button>
        {savedFlash && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Stored in your browser. Auto-fills new quotes.</span>
      </div>
    </div>
  )
}

// --- Small building blocks ---

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="card">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  )
}

// Estimator Registry — thin adapter over the shared RegistryManager (the same component the
// Salesperson Registry uses, so the two stay one pattern). Maps the estimator hook to the
// generic add/update/delete + normalized item shape.
function EstimatorRegistry() {
  const { estimators, addEstimator, updateEstimator, deleteEstimator } = useEstimators()

  const items: RegistryItem[] = estimators.map((e) => ({
    id: e.id,
    name: e.name,
    active: e.active,
    values: { name: e.name, title: e.title || "", email: e.email || "", phone: e.phone || "" },
  }))

  return (
    <RegistryManager
      title="Estimators"
      itemNoun="Estimator"
      description="The registry the Project Pricer’s estimator dropdown reads from. Inactive people stay on record but are hidden from the dropdown."
      fields={[
        { key: "name", label: "Name", required: true, placeholder: "e.g. Tom Peterson" },
        { key: "title", label: "Title", placeholder: "e.g. Founder / Estimator" },
        { key: "email", label: "Email", placeholder: "e.g. tom@company.com" },
        { key: "phone", label: "Phone", placeholder: PHONE_PLACEHOLDER, format: "phone" },
      ]}
      items={items}
      onAdd={(v, active) => addEstimator({ name: v.name, title: v.title, email: v.email, phone: v.phone, active })}
      onUpdate={(id, v, active) =>
        updateEstimator(id, {
          name: v.name.trim(),
          title: v.title.trim() || undefined,
          email: v.email.trim() || undefined,
          phone: v.phone.trim() || undefined,
          active,
        })
      }
      onDelete={(id) => deleteEstimator(id)}
    />
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const id = React.useId()
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1.5 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1.5"
        />
      )}
    </div>
  )
}
