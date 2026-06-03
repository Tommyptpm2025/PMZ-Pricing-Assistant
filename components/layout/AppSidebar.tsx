"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  Wrench,
  Package,
  Calculator,
  TrendingUp,
  BarChart3,
  Tags,
  FileText,
  Settings,
  Menu,
  X,
  ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  emphasized?: boolean
  disabled?: boolean
}

const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/labor-rates", label: "Labor Rates", icon: Users },
  { href: "/equipment-rates", label: "Equipment Rates", icon: Wrench },
  { href: "/material-rates", label: "Material Rates", icon: Package },
  { href: "/work-types", label: "Work Types", icon: Tags },
  { href: "/overhead-profit", label: "Overhead & Profit", icon: Calculator },
  { href: "/project-pricer", label: "Project Pricer", icon: TrendingUp, emphasized: true },
  { href: "/jobs", label: "Jobs / Foreman", icon: ClipboardList },
  { href: "/sales-tracker", label: "Sales Tracker", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: FileText, disabled: true },
  { href: "/settings", label: "Settings", icon: Settings },
]

interface SidebarContentProps {
  onNavigate?: () => void
}

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname()
  const hideBrand = pathname === '/project-pricer'

  return (
    <div className="flex h-full flex-col sidebar">
      {/* Logo / Brand - hidden on Project Pricer page per request */}
      {!hideBrand && (
        <div className="flex h-16 items-center border-b border-white/10 px-6">
          <Link href="/" className="flex items-center gap-2.5" onClick={onNavigate}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-lg tracking-tighter">
              PMZ
            </div>
            <div>
              <div className="font-semibold text-lg tracking-[-0.02em]">PMZ</div>
              <div className="text-[10px] text-white/60 -mt-1">PRICING ASSISTANT</div>
            </div>
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          const isDisabled = item.disabled

          return (
            <Link
              key={item.href}
              href={isDisabled ? "#" : item.href}
              onClick={isDisabled ? (e) => e.preventDefault() : onNavigate}
              className={cn(
                "sidebar-link group",
                isActive && "active",
                isDisabled && "opacity-40 cursor-not-allowed pointer-events-none",
                item.emphasized && !isActive && "text-primary hover:text-white"
              )}
              aria-disabled={isDisabled}
            >
              <Icon className="shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.emphasized && (
                <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/70 group-hover:bg-white/20">
                  KEY
                </span>
              )}
              {isDisabled && (
                <span className="ml-auto text-[10px] text-white/40">Soon</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer / Trust note */}
      <div className="border-t border-white/10 p-4 text-[11px] text-white/50 leading-snug">
        Built for owners who get the numbers right the first time.
      </div>
    </div>
  )
}

export function AppSidebar() {
  const [open, setOpen] = React.useState(false)

  // Desktop sidebar (fixed)
  const DesktopSidebar = (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-white/10 z-40">
      <SidebarContent />
    </aside>
  )

  // Mobile trigger + sheet
  const MobileNav = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-foreground"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-[#212322] text-[#E5E5E5] border-r-0">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )

  return (
    <>
      {DesktopSidebar}
      {MobileNav}
    </>
  )
}

export default AppSidebar
