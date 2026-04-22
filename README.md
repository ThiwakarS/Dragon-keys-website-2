# Dragon Keys

Queue-based manufacturing storefront. Auth via Clerk, data via Supabase, hosted on Cloudflare Pages, built with Vite + React.

---

## Architecture overview

```
┌─────────────────┐     ┌──────────┐     ┌──────────────┐
│ React (Vite)    │────▶│  Clerk   │     │   Supabase   │
│ Cloudflare CDN  │     │  (auth)  │     │ (Postgres +  │
│                 │─────┼──────────┼────▶│  RLS + Real- │
│                 │     └──────────┘     │  time + RPC) │
└─────────────────┘                      └──────────────┘
       │                    │                    │
       └── JWT session ─────┴── Authorization ──┘
              (auto, via Clerk ↔ Supabase native integration)
```

- **Clerk** handles signup, login, sessions, and user metadata (admin role).
- **Supabase** stores orders, enforces access rules via Row Level Security, runs an atomic `create_order` RPC that prevents race conditions, and pushes live updates via Realtime.
- **Cloudflare Pages** serves the static React bundle from a global CDN and auto-deploys on every push to `main`.
- The browser talks directly to both Clerk and Supabase. **No custom backend.** No server to maintain.

### Why this scales to 10k+ users

- **Static frontend** — Cloudflare's CDN is essentially infinite.
- **Supabase** — the free tier handles hundreds of concurrent connections; paid tier scales to thousands. Our queries are indexed and bounded.
- **No N+1 queries** — the `admin_orders_with_position` view computes positions in a single round-trip.
- **Realtime over polling** — Supabase pushes WebSocket events only when data changes.
- **Atomic inserts** — `pg_advisory_xact_lock` + partial unique index means two users can never collide on the "one active order" rule.

---

## Local setup

### Prerequisites

- Node.js 18+ ([nodejs.org](https://nodejs.org))
- A GitHub account
- A Clerk account ([clerk.com](https://clerk.com))
- A Supabase account ([supabase.com](https://supabase.com))
- A Cloudflare account ([cloudflare.com](https://cloudflare.com))

### 1. Install

```bash
git clone <your-repo-url> dragon-keys
cd dragon-keys
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the four required values (see the next sections for how to get each). `.env.local` is gitignored — never commit it.

### 3. Run

```bash
npm run dev
```

Opens at `http://localhost:5173`.

---

## Clerk setup (auth)

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → **Create application**.
2. Name it "Dragon Keys". Enable **Email** and **Google** sign-in.
3. **API Keys** tab → copy the **Publishable key** → paste as `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local`.
4. **Sessions** → **Customize session token** → paste this into the custom claims box and save:
   ```json
   {
     "public_metadata": "{{user.public_metadata}}"
   }
   ```
   This makes the admin role visible inside Supabase via `auth.jwt() -> 'public_metadata' ->> 'role'`.
5. **Integrations** → find **Supabase** → click **Activate**. (This is the modern native integration — no more JWT templates.)
6. **Paths** → set these (recommended):
   - After sign-in URL: `/`
   - After sign-up URL: `/`

### Making yourself admin

Once you've signed up to your own site at least once:
1. Clerk Dashboard → **Users** → click your user
2. **Metadata** tab → **Public metadata** → edit to:
   ```json
   { "role": "admin" }
   ```
3. Save. Sign out and back in to refresh your session token.

---

## Supabase setup (database)

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Pick a strong DB password (save it) and a region close to you.
2. Wait ~2 minutes for provisioning.
3. **Settings → API** → copy these into `.env.local`:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

   > The anon key is safe to expose to the browser. It has no privileges until combined with a valid Clerk JWT via our RLS rules. **Never expose the service_role key** — it bypasses RLS.

4. **Authentication → Sign In / Up → Third Party Auth** → **Add provider** → **Clerk**.
   - Paste your **Clerk Frontend API URL** (found in Clerk dashboard → **API Keys** → shown as `https://<your-app>.clerk.accounts.dev`).
   - Save.

5. **SQL Editor** → **New query** → paste the entire contents of `supabase/migrations/001_initial_schema.sql` → **Run**. You should see "Success. No rows returned."

6. Verify Realtime is on: **Database → Replication** → confirm `orders` is in the `supabase_realtime` publication (the migration does this automatically, but worth checking).

---

## Cloudflare Pages setup (hosting + auto-deploy)

### Option A — Connect your GitHub repo (recommended)

1. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:<you>/dragon-keys.git
   git push -u origin main
   ```

2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.

3. Pick your repo. Configure:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (leave blank)
   - **Node version:** 18 or later (under Environment variables, add `NODE_VERSION` = `20`)

4. **Environment variables** (under "Production" — add all four):
   ```
   VITE_CLERK_PUBLISHABLE_KEY   = pk_live_...
   VITE_SUPABASE_URL            = https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY       = eyJhbGc...
   VITE_WHATSAPP_NUMBER         = 919876543210
   VITE_SUPPORT_EMAIL           = support@dragonkeys.dev
   ```

5. **Save and Deploy.** Cloudflare builds and deploys. From now on, every `git push` to `main` auto-deploys. Pull requests get preview URLs.

6. **Custom domain** — Pages project → **Custom domains** → **Set up**. If your DNS is on Cloudflare, it's one click. If on Spaceship, point your domain's nameservers to Cloudflare first (Spaceship → DNS → change nameservers to whatever Cloudflare gives you).

### Don't forget

- Add your production URL to Clerk: **Domains** tab → add your custom domain as an allowed origin.
- Same in Supabase: **Authentication → URL Configuration** → add the URL to the redirect allow-list (for OAuth callbacks).

---

## Editing content

### Add / edit a product

Open `src/data/products.js` and edit the `PRODUCTS` array. Each field is commented at the top of the file.

To update a product's throughput (e.g. mudflap from 3/day to 4/day):
```js
throughputPerDay: 4,   // was 3
```

Commit, push, Cloudflare auto-deploys. Takes about 60 seconds.

### Add / edit a blog post

Open `src/data/posts.js`. Same array pattern. Supports headings, bold, italic, lists, quotes, dividers.

### Change the WhatsApp number or support email

Update the environment variables in Cloudflare Pages → **Settings → Environment variables**, then trigger a redeploy (**Deployments** tab → retry the latest).

Or locally, edit `.env.local` and restart `npm run dev`.

---

## Security notes

### What's encrypted

- **In transit:** HTTPS everywhere (Cloudflare, Clerk, Supabase all enforce TLS 1.2+).
- **At rest:** Supabase encrypts the underlying Postgres volume with AES-256. Clerk encrypts user profile data at rest.
- **Passwords:** never touch your system — Clerk handles them (bcrypt + pepper).

**You do not need application-level encryption** for this use case. Addresses and WhatsApp numbers are stored as plain text in Postgres but only accessible via RLS — i.e. only the user who submitted them and admins can read them.

If you later want extra paranoia about addresses, you can add [Supabase Vault](https://supabase.com/docs/guides/database/vault) to encrypt specific columns with a project-level key. For a small-scale storefront, this is overkill.

### What prevents abuse

| Attack | Defense |
| --- | --- |
| Race condition on booking (two simultaneous submissions) | `pg_advisory_xact_lock(hashtext(user_id))` inside `create_order` RPC + partial unique index as final guarantee |
| Multi-tab spam | Same unique index — it's enforced at the DB level |
| Unauthorized data access | Row Level Security — users can only SELECT their own rows, admins gated on `public_metadata.role = 'admin'` |
| Admin route exposure | Clerk SignedIn/Out guard + in-component `isAdmin(user)` check + RLS at DB level (defense in depth) |
| Leaked anon key | By design: anon key has zero privileges without a valid JWT |
| CSRF / XSS | React escapes all output by default; no `dangerouslySetInnerHTML`; HttpOnly cookies from Clerk |
| Clickjacking | `X-Frame-Options: DENY` via `_headers` |

### What never gets committed

- `.env.local` — gitignored
- Any `.env.*` file — gitignored
- Real keys live in Cloudflare's environment variables panel, Clerk dashboard, Supabase dashboard

---

## File structure

```
dragon-keys/
├── public/
│   ├── assets/          ← logo-small.png, logo-large.png, product photos
│   ├── _headers         ← Cloudflare security + cache headers
│   ├── _redirects       ← SPA routing
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── Blog.jsx
│   │   ├── Footer.jsx
│   │   ├── Navbar.jsx
│   │   ├── ProductCard.jsx
│   │   ├── ProductModal.jsx
│   │   └── StatusPill.jsx
│   ├── data/
│   │   ├── posts.js     ← ✏️ blog posts
│   │   └── products.js  ← ✏️ products
│   ├── hooks/
│   │   └── useSupabase.js
│   ├── lib/
│   │   ├── markdown.jsx
│   │   ├── supabase.js
│   │   ├── toast.jsx
│   │   └── utils.js
│   ├── pages/
│   │   ├── Admin.jsx
│   │   ├── BookOrder.jsx
│   │   ├── Home.jsx
│   │   ├── MyOrders.jsx
│   │   └── NotFound.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
├── .gitignore
├── index.html
├── package.json
└── vite.config.js
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start local dev server on :5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

---

## Checklist before going live

- [ ] Swap Clerk to **production** instance (pk_live_… key)
- [ ] Supabase project: upgrade from free tier if you expect sustained traffic
- [ ] Custom domain pointing to Cloudflare Pages
- [ ] `VITE_WHATSAPP_NUMBER` and `VITE_SUPPORT_EMAIL` set in production env vars
- [ ] Promoted yourself to admin via Clerk public_metadata
- [ ] Placed a test order and moved it through every status
- [ ] Verified a second user can't see your order (RLS working)
