"use client"

import * as React from "react"
import Link from "next/link"
import { Settings, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Settings className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Settings &amp; Defaults</h1>
          <p className="text-muted-foreground">Manage the people and defaults that feed the Project Pricer.</p>
        </div>
      </div>

      {/* The Salespeople builder that used to live here has been retired. People now have ONE home —
          the Company Roster in Company Setup (Law 9, One Birthplace). This card redirects there. */}
      <Card className="card">
        <CardHeader>
          <CardTitle className="text-xl">People moved to the Company Roster</CardTitle>
          <CardDescription>
            Salespeople, estimators, foremen, and everyone else are now managed in one place — the
            Company Roster — with roles and an active toggle. Your existing salespeople and estimators
            were migrated there automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/company-setup">
              Open Company Roster <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
