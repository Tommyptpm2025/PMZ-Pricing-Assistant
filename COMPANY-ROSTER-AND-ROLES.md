# Company Roster & Roles — Gaveled Ruling

**Status:** Gaveled by Tom, 2026-07-31. Design ruling — build lands with the foreman change-order cause.

---

## The Person Record

A **Person** is born in exactly one place: the **Company** section (Law 9, One Birthplace). Fields:

- system-assigned **id**
- **name**
- one or more **roles**
- **active** flag

Nobody is ever deleted — departed people go **inactive**, because their id is stamped on history.

---

## Roles (four, inside a company)

- **Salesperson** — bids and estimates. The existing "estimator" concept folds into this role — one job, one name.
- **Foreman** — adds resources to jobs and change orders. Never sets or sees margin.
- **Accountant** — reads the money, changes nothing. The reconciliation seat.
- **Boss** — sees everything; makes the Law 82 judgment calls.

One person may hold **multiple roles** — a one-person company is all four on day one.

**Super User (Total Profit Management)** is a **platform** role for onboarding/support across companies. It lives in the backend spec, **not** the company screen.

---

## Foreman On-the-Spot Change Orders

On an active job, a foreman may create a **change order** by entering **resources (costs) only**. PMZ prices it automatically at the **parent bid's frozen margin** via the Golden Formula — this rides the existing gavel that change orders inherit the parent margin and never re-resolve the tier. The foreman sees the **computed customer price, never the margin**. The price is **read-only** to the foreman — no second price path (Law 56).

**Ceiling:** default **$1,500 per change order**, settable by the owner in company settings.
Rationale (Tom): one hour of truck, driver, a load of material, and a piece of equipment runs about $1,500. **At or below** the ceiling the foreman may quote on the spot. **Above it**, the change order saves as **pending** and notifies the salesperson or boss.

**Origin stamp:** every change order records **foreman id, job, timestamp**, and that it was **auto-priced at the parent margin**. These extras must stay **labeled in history** — they are typically high-margin work and must never blend invisibly into year-end derivation (Law 5).

---

## Beta vs Backend

Beta builds **attribution, not logins**: every bid carries a **salesperson id**, every change order a **foreman id**, picked from the roster, **never typed**. Accounts, passwords, and screen-level enforcement are **backend work (Kennedy)**. The permissions matrix is **designed now** and **enforced at the backend**.
