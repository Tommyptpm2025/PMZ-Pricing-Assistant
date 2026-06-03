import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function ReportsPage() {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><FileText className="h-6 w-6" /></div>
        <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
        <Badge variant="outline">Coming soon</Badge>
      </div>

      <Card className="card">
        <CardHeader>
          <CardTitle>Future Phase 2 feature</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Historical job vs. actual tracking, benchmark comparisons, and printable quote PDFs will live here after Supabase persistence is added.
        </CardContent>
      </Card>
    </div>
  )
}
