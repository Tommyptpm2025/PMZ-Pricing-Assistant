# PMZ Pricing Assistant — Quick Resume Checklist

**Goal:** Resume setup from where we left off.

---

## 1. Open PowerShell and go to the folder

```powershell
cd "$env:USERPROFILE\PMZ-Pricing-Assistant\pmz"
```

---

## 2. Run this command (this is the next step)

```powershell
npx shadcn@latest init
```

When prompted:
- Style: `default`
- Base color: `slate`
- CSS variables: `Yes`

---

## 3. After shadcn init finishes

Continue adding components with these commands (one at a time):

```powershell
npx shadcn@latest add button card input label table tabs select slider dialog sheet badge separator tooltip alert skeleton sidebar
```

---

## 4. Apply the theme

1. Open `app/globals.css`
2. Delete everything inside it
3. Copy **all** content from `pmz-theme.css`
4. Paste and save

---

## 5. Start the app

```powershell
npm run dev
```

Open **http://localhost:3007** in your browser.

---

## 6. When the default Next.js page loads

Type this in chat:

**"Scaffold complete"**

---

**Need more details?** Open `CONTINUE-HERE.md`

That's it. You're ready to continue.