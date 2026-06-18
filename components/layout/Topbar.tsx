"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, User, Star } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

interface TopbarProps {
  title?: string
}

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/labor-rates": "Labor Rate Builder",
  "/equipment-rates": "Equipment Rate Builder",
  "/materials": "Materials Library",
  "/overhead-profit": "Overhead & Profit",
  "/project-pricer": "Project Pricer",
  "/quotes": "Quotes",
  "/jobs": "Jobs / Foreman View",
  "/reports": "Reports",
  "/settings": "Settings",
}

export function Topbar({ title }: TopbarProps) {
  const pathname = usePathname()
  const currentTitle = title || pageTitles[pathname] || "PMZ Pricing Assistant"

  // Theme from global provider (useState('light') default + post-mount LS read in useEffect for reliable hard-refresh light default)
  const { theme, setTheme, resolvedTheme } = useTheme()
  const currentTheme = resolvedTheme || theme || "light"

  const handleExport = () => {
    // Demo only - Phase 1 placeholder (per PLAN)
    const data = {
      exportedAt: new Date().toISOString(),
      note: "This is a demo export. Full PDF + cloud sync in Phase 2.",
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "pmz-demo-export.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger is rendered by AppSidebar; here we show page title */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            {currentTitle}
          </h1>
          {pathname === "/project-pricer" && (
            <Badge variant="secondary" className="hidden sm:inline-flex bg-primary/10 text-primary border-primary/30">
              Primary Tool
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 topbar-actions">
        {/* Demo export button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="hidden sm:flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export Data
        </Button>

        {/* Global theme toggle - appears on EVERY page (moved from Project Pricer only) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
          aria-label={currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="h-8 w-8"
          title={currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Star className="h-4 w-4" />
        </Button>

        {/* User placeholder (future Supabase) */}
        <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm bg-card">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground/90">Owner</span>
        </div>
      </div>
    </header>
  )
}

export default Topbar
