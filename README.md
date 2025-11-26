## FitLog Community PWA

**FitLog** is a tiny vanilla HTML/CSS/JS Progressive Web App that lets users log pull-ups, push-ups, dips, and kilometres run, and shows a real-time community leaderboard using Supabase on the free tier.

### 1. Files

- `index.html`: UI and script includes
- `style.css`: minimal mobile-first styling
- `app.js`: Supabase client, CRUD, real-time subscription, and service-worker registration
- `manifest.json`: PWA metadata
- `service-worker.js`: caches core assets for offline use
- `icons/icon-192.png`, `icons/icon-512.png`: PWA icons (provide your own PNGs)

### 2. Supabase Setup

1. **Create project**
   - Go to `https://supabase.com`, create a free project.
2. **Create table `progress`**
   - SQL (run in the SQL editor):

```sql
create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  name text,
  pullups integer default 0,
  pushups integer default 0,
  dips integer default 0,
  run_km double precision default 0
);
```

3. **Enable Row Level Security (RLS)**

```sql
alter table public.progress enable row level security;
```

4. **Policies**

```sql
-- allow anyone to read
create policy "public read" on public.progress
for select
using (true);

-- allow anyone to insert
create policy "public insert" on public.progress
for insert
with check (true);

-- allow anyone to update
create policy "public update" on public.progress
for update
using (true)
with check (true);
```

5. **Get API keys**
   - In Supabase dashboard: **Settings → API**
   - Copy **Project URL** and **anon public** key.
   - Open `app.js` and replace:
     - `https://YOUR-PROJECT.supabase.co`
     - `YOUR-ANON-PUBLIC-KEY`

> Note: The anon key is intended for client-side use, but anyone with the key can write to this public table, so do not use this exact setup for sensitive data.

### 3. Run Locally

Any static file server works; for example with `npm`:

```bash
cd /Users/xoso/Downloads/aa/cursor\ app
npx serve .
```

Then visit `http://localhost:3000` (or whatever port is shown). Install the PWA from your browser if prompted.

### 4. Deploy to a Static Host

- **GitHub Pages**
  - Commit this folder to a repo.
  - In GitHub: **Settings → Pages → Source: `main` branch, `/` (root)**.
- **Netlify / Vercel / Cloudflare Pages**
  - Create a new project.
  - Point it at this folder or repo.
  - No build command needed; output directory is the repo root.

After deploy, open the site over HTTPS for PWA + service worker to work fully.

### 5. Optional Extensions

- Add a nickname field (already included as `#nickname`).
- Add a simple chart (e.g., include Chart.js from CDN and build a bar chart from the `loadAll()` data).
- Add a delete/reset-all button for admins only (would require extra auth and stricter RLS).

### 6. Optional: Add Authentication and Lock Down Access

The main instructions above intentionally use **open policies** so the demo works without login. To restrict who can read/write, you can enable Supabase Auth and tighten policies.

#### 6.1 Only authenticated users can write (everyone can read)

This keeps the public leaderboard, but only logged-in users can change data.

1. **Enable Email auth**
   - In Supabase: **Authentication → Providers → Email** → enable.
2. **Create users with username format**
   - When creating users in Supabase dashboard (Authentication → Users → Invite user), use format: `username@fitlog.local`
   - Example: `john@fitlog.local`, `sarah@fitlog.local`
   - Users will log in with just `john` or `sarah` (no @ required in the app)
   - The app automatically converts usernames to this format for Supabase
3. **Update policies (replace the ones in step 4)**

```sql
-- anyone can read leaderboard
create policy "public read" on public.progress
for select
using (true);

-- only logged-in users can insert
create policy "auth insert" on public.progress
for insert
with check (auth.role() = 'authenticated');

-- only logged-in users can update
create policy "auth update" on public.progress
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
```

3. **Front-end: add a simple login**
   - Add a small form (email/password) and call:

```js
const { data, error } = await client.auth.signInWithPassword({
  email,
  password,
});
```

After login, the existing `upsert` and `update` calls will work under the new policies.

#### 6.2 Per-user private logs (no public leaderboard)

If instead you want **each user to see only their own data**, you can:

1. **Add `user_id` column**

```sql
alter table public.progress add column user_id uuid;
```

2. **Policies**

```sql
create policy "user read own" on public.progress
for select
using (auth.uid() = user_id);

create policy "user write own" on public.progress
for insert, update
with check (auth.uid() = user_id);
```

3. **Front-end**
   - After the user logs in, get the user id and include it when saving:

```js
const { data: { user } } = await client.auth.getUser();
payload.user_id = user.id;
```

This variant removes the global community view in favor of private, per-account logs.
