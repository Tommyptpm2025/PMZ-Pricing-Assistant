import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function ReportsPage() {
  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><FileText className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Reports</h1>
          <p className="text-muted-foreground">Historical tracking, benchmarks, and printable quotes.</p>
        </div>
        <Badge variant="outline" className="ml-auto">Coming soon</Badge>
      </div>

      <Card className="card">
        <CardHeader>
          <CardTitle>Future Phase 2 feature</CardTitle>
          <CardDescription>Available after Supabase persistence is added.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Historical job vs. actual tracking, benchmark comparisons, and printable quote PDFs will live here.
        </CardContent>
      </Card>
    </div>
  )
}
