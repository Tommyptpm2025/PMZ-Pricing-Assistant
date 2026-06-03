import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Settings className="h-6 w-6" /></div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings &amp; Defaults</h1>
      </div>

      <Card className="card">
        <CardHeader>
          <CardTitle>Global Defaults</CardTitle>
          <CardDescription>These values feed every rate calculation and the Project Pricer.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder for burden assumptions, default overhead allocation method, profit target, etc. 
          All will be persisted to localStorage in the next implementation pass.
        </CardContent>
      </Card>
    </div>
  )
}
