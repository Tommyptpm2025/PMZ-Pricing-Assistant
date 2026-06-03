import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function MaterialsPage() {
  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Package className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Materials Library</h1>
          <p className="text-muted-foreground">Unit costs + consistent markup application.</p>
        </div>
        <Badge variant="outline" className="ml-auto">Phase 1</Badge>
      </div>

      <Card className="card">
        <CardHeader>
          <CardTitle>Quick Add + Table (placeholder)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This page will let you maintain a reusable list of materials with unit cost, unit type, and typical markup %.
          Global “apply default markup” control will feed the Project Pricer.
        </CardContent>
      </Card>
    </div>
  )
}
