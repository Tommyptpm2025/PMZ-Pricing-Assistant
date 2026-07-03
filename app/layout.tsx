import localFont from "next/font/local"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { MainLayout } from "@/components/layout/MainLayout"
import { cn } from "@/lib/utils"

// Fonts are self-hosted (bundled woff2 in ./fonts) so builds and demos never
// depend on reaching Google. Variable fonts — one file covers the weight range.
const fontHeading = localFont({
  src: "./fonts/FunnelDisplay-latin.woff2",
  variable: "--font-heading",
  weight: "400 800",
  display: "swap",
})

const fontSans = localFont({
  src: "./fonts/GolosText-latin.woff2",
  variable: "--font-sans",
  weight: "400 700",
  display: "swap",
})

const fontMono = localFont({
  src: "./fonts/GeistMono-latin.woff2",
  variable: "--font-mono",
  weight: "100 900",
  display: "swap",
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
