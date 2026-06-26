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

  function handleSave() {
    save(form)
    dirtyRef.current = false
    setSavedFlash(true)
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

      {/* Company */}
      <Section title="Company" description="Your legal identity and contact details — shown on every document header and footer.">
        <Field label="Legal Name" value={form.company.legal_name} onChange={(v) => setField("company", "legal_name", v)} placeholder="e.g. Total Profit Management LLC" />
        <Field label="Short Name" value={form.company.short_name} onChange={(v) => setField("company", "short_name", v)} placeholder="e.g. TPM" />
        <Field label="Website" value={form.company.website} onChange={(v) => setField("company", "website", v)} placeholder="e.g. totalprofitmanagement.com" />
        <Field label="Phone" value={form.company.phone} onChange={(v) => setField("company", "phone", v)} placeholder="e.g. (555) 123-4567" />
        <Field label="Email" value={form.company.email} onChange={(v) => setField("company", "email", v)} placeholder="e.g. office@company.com" />
        <Field label="Address" value={form.company.address} onChange={(v) => setField("company", "address", v)} placeholder="e.g. 123 Main St" />
        <Field label="City, State ZIP" value={form.company.city_state_zip} onChange={(v) => setField("company", "city_state_zip", v)} placeholder="e.g. Springfield, IL 62701" />
        <Field label="Year Founded" value={form.company.year_founded} onChange={(v) => setField("company", "year_founded", v)} placeholder="e.g. 2014" />
        <Field label="Years Experience" value={form.company.years_experience} onChange={(v) => setField("company", "years_experience", v)} placeholder="e.g. 20" />
        <Field label="Payment Methods" value={form.company.payment_methods} onChange={(v) => setField("company", "payment_methods", v)} placeholder="e.g. Check, ACH, all major cards" multiline />
      </Section>

      {/* Estimator */}
      <Section title="Estimator" description="The default estimator credited on documents.">
        <Field label="Name" value={form.estimator.name} onChange={(v) => setField("estimator", "name", v)} placeholder="e.g. Tom Peterson" />
        <Field label="Title" value={form.estimator.title} onChange={(v) => setField("estimator", "title", v)} placeholder="e.g. Founder / Estimator" />
        <Field label="Email" value={form.estimator.email} onChange={(v) => setField("estimator", "email", v)} placeholder="e.g. tom@company.com" />
        <Field label="Phone" value={form.estimator.phone} onChange={(v) => setField("estimator", "phone", v)} placeholder="e.g. (555) 123-4567" />
      </Section>

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
