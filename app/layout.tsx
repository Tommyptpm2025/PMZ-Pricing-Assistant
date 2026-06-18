import { Geist_Mono, Funnel_Display, Golos_Text } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { MainLayout } from "@/components/layout/MainLayout"
import { cn } from "@/lib/utils"

const fontHeading = Funnel_Display({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const fontSans = Golos_Text({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontHeading.variable, fontSans.variable, fontMono.variable)}
    >
      <head>
        {/* Early inline script: sets theme class on <html> *before* body/React hydration / paint.
            Moved into <head> (required for valid HTML and to avoid Next.js script-order/hydration errors).
            Guarantees correct initial (light default if no saved pref). React side uses useState('light') + useEffect (no LS in init). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var root = document.documentElement;
                  if (theme === 'dark') {
                    root.classList.add('dark');
                  } else {
                    // No saved 'dark' preference (null, 'light', or other) -> default to light and persist if needed
                    root.classList.remove('dark');
                    if (theme !== 'light') {
                      localStorage.setItem('theme', 'light');
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <MainLayout>{children}</MainLayout>
        </ThemeProvider>
      </body>
    </html>
  )
}
