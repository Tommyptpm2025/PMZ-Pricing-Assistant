"use client"

import * as React from "react"

type Theme = "light" | "dark"

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  resolvedTheme: Theme
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined)

export function useTheme(): ThemeContextType {
  const context = React.useContext(ThemeContext)
  if (context === undefined) {
    // Safe fallback during SSR or if used outside provider
    return {
      theme: "light",
      setTheme: () => {},
      resolvedTheme: "light",
    }
  }
  return context
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const key = event?.key?.toLowerCase?.()
      if (key !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Requirement: fixed default 'light' in useState initializer.
  // NEVER read localStorage inside the useState initializer.
  const [theme, setThemeState] = React.useState<Theme>("light")

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem("theme", newTheme)
    } catch {}
    // Apply to document immediately for instant feedback
    const root = document.documentElement
    if (newTheme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [])

  // Requirement: localStorage read ONLY inside useEffect after mount (post-hydration).
  // On initial mount / hard refresh: if no valid saved pref, init to light and apply.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("theme")
      if (saved === "dark") {
        // Respect user's explicit saved dark choice
        setThemeState("dark")
        document.documentElement.classList.add("dark")
      } else {
        // No saved 'dark' (null, 'light', or other) -> default to light
        setThemeState("light")
        if (saved !== "light") {
          localStorage.setItem("theme", "light")
        }
        document.documentElement.classList.remove("dark")
      }
    } catch {
      // LS unavailable -> light default + apply
      setThemeState("light")
      document.documentElement.classList.remove("dark")
    }
  }, [])

  const value = React.useMemo<ThemeContextType>(
    () => ({
      theme,
      setTheme,
      resolvedTheme: theme,
    }),
    [theme, setTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}
