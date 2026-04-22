# Dragon Keys — 30-Minute Quickstart

The README has the full details. This is the fast path.

## 0. Unzip & install (2 min)
```bash
unzip dragon-keys.zip && cd dragon-keys
npm install
cp .env.example .env.local
```

## 1. Clerk (5 min)
1. [clerk.com](https://clerk.com) → new app → enable Email + Google
2. **API Keys** → copy Publishable key → paste into `.env.local` as `VITE_CLERK_PUBLISHABLE_KEY`
3. **Sessions → Customize session token** → paste this, save:
   ```json
   { "public_metadata": "{{user.public_metadata}}" }
   ```
4. **Integrations → Supabase → Activate**

## 2. Supabase (8 min)
1. [supabase.com](https://supabase.com) → new project
2. **Settings → API** → copy Project URL and anon key into `.env.local`
3. **Authentication → Sign In / Up → Third Party Auth → Add Clerk** → paste your Clerk Frontend API URL
4. **SQL Editor → New query** → paste entire `supabase/migrations/001_initial_schema.sql` → Run

## 3. Try it locally (2 min)
```bash
npm run dev
```
Open http://localhost:5173, sign up, place a test order.

## 4. Make yourself admin (2 min)
Clerk dashboard → Users → click yourself → Metadata → Public metadata:
```json
{ "role": "admin" }
```
Sign out, sign back in. `/admin` now works.

## 5. Push to GitHub (3 min)
```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<you>/dragon-keys.git
git push -u origin main
```

## 6. Cloudflare Pages (8 min)
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git** → pick your repo
2. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
3. Environment variables — add **all** of these (Production):
   ```
   NODE_VERSION                  = 20
   VITE_CLERK_PUBLISHABLE_KEY    = pk_...
   VITE_SUPABASE_URL             = https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY        = eyJ...
   VITE_WHATSAPP_NUMBER          = 919876543210
   VITE_SUPPORT_EMAIL            = support@dragonkeys.dev
   ```
4. **Save and Deploy.** From now on, every `git push` to `main` auto-deploys.
5. Add your production URL as an allowed origin in Clerk → **Domains**.

## Done.

Edit `src/data/products.js` to change throughput, add products, or update GitHub/Cults3D links.
Edit `src/data/posts.js` to add blog posts.
Push to GitHub → Cloudflare rebuilds in ~60s.
