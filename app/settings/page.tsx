import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function SettingsPage() {
  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Settings className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Settings &amp; Defaults</h1>
          <p className="text-muted-foreground">Global defaults that feed every rate calculation.</p>
        </div>
        <Badge variant="outline" className="ml-auto">Coming soon</Badge>
      </div>

      <Card className="card">
        <CardHeader>
          <CardTitle>Global Defaults</CardTitle>
          <CardDescription>These values feed every rate calculation and the Project Pricer.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder for burden assumptions, default overhead allocation method, profit target, etc. All will be persisted to localStorage in the next implementation pass.
        </CardContent>
      </Card>
    </div>
  )
}
