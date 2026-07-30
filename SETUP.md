# PMZ Pricing Assistant — Run-It-Yourself Setup Guide (Option 3)

This guide lets you execute the entire project creation on your own machine with full control.

You already have the detailed design in [PLAN.md](./PLAN.md).

---

## Prerequisites

- Windows 10/11 (PowerShell recommended)
- Node.js 20.0+ (LTS 22 or 24 preferred)
- Git (optional but recommended)
- A modern code editor (VS Code strongly recommended)

---

## Step 1: Install Node.js (if you don't have it yet)

**Recommended method:**

1. Go to https://nodejs.org/
2. Download the **LTS** version (not Current)
3. Run the installer and accept all defaults
4. **Restart your terminal / PowerShell** after installation

Verify in a fresh terminal:
```powershell
node --version
npm --version
```

You should see versions (Node 20+ and npm 10+).

---

## Step 2: Navigate to the Project Folder

Open PowerShell and run:

```powershell
cd "$env:USERPROFILE\PMZ-Pricing-Assistant\pmz"
```

Confirm you're in the right place:
```powershell
Get-Location
dir
```

You should see `PLAN.md` and `SETUP.md`.

---

## Step 3: Initialize the Next.js 15 Project

Run this exact command inside the folder:

```powershell
npx create-next-app@latest . --yes
```

This will:
- Use the current directory
- Enable TypeScript
- Enable Tailwind CSS (v4)
- Enable ESLint
- Use App Router

After it finishes, you should see `app/`, `package.json`, etc.

---

## Step 4: Install Core Dependencies

```powershell
npm install lucide-react
npm install -D tailwindcss
```

**Recommended additions for a professional form-heavy app (install now):**

```powershell
npm install react-hook-form zod @hookform/resolvers sonner
npm install -D @types/node
```

`sonner` is a beautiful, lightweight toast system that works great with shadcn.

---

## Step 5: Initialize shadcn/ui

```powershell
npx shadcn@latest init
```

When prompted:
- Style: **default** (recommended for contractor-friendly rounded look)
- Base color: **slate** or **zinc**
- CSS variables: **Yes**
- Tailwind config: **Yes**
- Import alias: `@/`

After init, you will have a `components.json` file.

---

## Step 6: Add Required shadcn Components

Run these commands one by one (or in batches):

```powershell
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add table
npx shadcn@latest add tabs
npx shadcn@latest add select
npx shadcn@latest add slider
npx shadcn@latest add dialog
npx shadcn@latest add sheet
npx shadcn@latest add badge
npx shadcn@latest add separator
npx shadcn@latest add tooltip
npx shadcn@latest add alert
npx shadcn@latest add skeleton
npx shadcn@latest add navigation-menu
npx shadcn@latest add dropdown-menu
```

For the sidebar, also add:
```powershell
npx shadcn@latest add sidebar
```

If the sidebar component isn't available in your shadcn version yet, we'll build a clean custom one (very common).

---

## Step 7: Set Up the Professional Theme

After the above, open `app/globals.css` and replace the content with the PMZ color system (from PLAN.md).

A ready-to-paste version will be provided once you confirm the scaffold is running.

---

## Step 8: Run the Development Server

```powershell
npm run dev
```

Open http://localhost:3007

You should see the default Next.js page.

---

## Step 9: Next Steps After Scaffold

Once the dev server is running successfully, come back here and tell me:

> "Scaffold complete" or "ready for phase 1 implementation"

At that point I will:
- Generate the exact `globals.css` with the blue/gray contractor theme
- Provide the full `layout.tsx` with sidebar + topbar
- Give you the complete home page with the core message
- Deliver the first interactive tool (Labor Rate Builder) as copy-paste ready code
- Continue delivering pages and components in the order described in PLAN.md

---

## Quick Reference Commands (PowerShell)

```powershell
# Development
npm run dev

# Build for production
npm run build

# Type checking
npx tsc --noEmit

# Lint
npm run lint

# Add more shadcn components later
npx shadcn@latest add [component-name]
```

---

## Folder Structure You Should Have After Step 3

```
PMZ-Pricing-Assistant/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   └── ui/          # populated by shadcn
├── lib/
│   └── utils.ts
├── public/
├── package.json
├── components.json
├── tsconfig.json
├── tailwind.config.ts (or none in v4)
├── PLAN.md
├── SETUP.md
└── next.config.ts
```

---

## Troubleshooting

- **Port 3007 already in use**: that is PMZ's one server (Law 45, One-Address Rule) — it is already running; use it. Do **not** start a second server on another port: localStorage is origin-scoped, so a different port shows an empty app. If the port is held by a stale process, stop that process rather than switching ports.
- **shadcn init fails**: Make sure you're in the project root and have internet.
- **PowerShell execution policy**: If you get errors, run:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```

---

**You now have everything needed to create the project locally.**

Run Steps 2–8 above, then reply with **"Scaffold complete"** (or describe any issues you hit).

I will then deliver the actual application code in the exact order and quality described in the PLAN.md.

Ready when you are.