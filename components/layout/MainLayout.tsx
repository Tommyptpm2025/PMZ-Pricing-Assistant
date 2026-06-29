import * as React from "react"
import { AppSidebar } from "./AppSidebar"
import { Topbar } from "./Topbar"
import { TooltipProvider } from "@/components/ui/tooltip"

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <AppSidebar />

        {/* Main column: topbar + content. Offset for fixed desktop sidebar */}
        <div className="lg:pl-64 flex min-h-dvh flex-col">
          <Topbar />

          <main className="main-content flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>

          {/* Subtle footer bar — dev/demo strip; never prints (would add a stray page to any PDF) */}
          <footer className="print:hidden border-t bg-white/60 py-3 text-center text-xs text-muted-foreground lg:px-8">
            PMZ Pricing Assistant — LEM costs are the truth. <span className="hidden sm:inline">v0.1 • Client-side demo</span>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default MainLayout
