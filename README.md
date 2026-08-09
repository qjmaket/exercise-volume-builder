# Exercise Volume Builder

Companion app to FoodIQ. Build a weekly training plan and see live whether
each muscle group's weekly set volume hits your MED range.

## Status: steps 1–5 of the build sequence are done here

1. ✅ Vite scaffold (`package.json`, `index.html`, `vite.config.js`, `src/main.jsx`)
2. ✅ Supabase client config (`src/supabaseClient.js`, `.env.example`)
3. ✅ Table migrations with RLS (`supabase/migrations/001_exercise_volume_builder.sql`)
4. ✅ Seed data — all 150 exercises extracted from the working artifact (`supabase/seed/001_seed_exercises.sql`)
5. ✅ UI ported to Supabase (`src/App.jsx`, `src/VolumeBuilder.jsx`, `src/AuthGate.jsx`) — replaces local React state with persisted per-user plans. Also added the **weight** field the spec calls for (present in the schema but missing from the original artifact's UI).

## Still to do (steps 6–9)

6. Auth is wired (`AuthGate.jsx` — Supabase email/password), but you should
   confirm magic-link vs. password is what you want long-term.
7. ✅ "Request an exercise" button/form is built into `VolumeBuilder.jsx` and
   writes to `exercise_submissions`.
8. ⬜ Make scenario for enrichment — not built here; clone your existing
   `food_submissions` scenario pattern, pointed at the `exercise_submissions`
   table instead.
9. ⬜ New GitHub repo (`qjmaket/exercise-volume-builder`) + Vercel deploy —
   not done from this environment (no GitHub/Vercel credentials available
   here). See "Deploying" below.

## Local setup

```bash
npm install
cp .env.example .env
# fill in .env with your Supabase anon key (URL is already the FoodIQ project)
npm run dev
```

## Running the migrations

In the Supabase SQL editor for project `qkpvjqnejkkhpzwokyny`, run in order:

1. `supabase/migrations/001_exercise_volume_builder.sql`
2. `supabase/seed/001_seed_exercises.sql`

## Deploying

1. `git init && git add . && git commit -m "feat: initial scaffold"`
2. Create `qjmaket/exercise-volume-builder` on GitHub, push
3. Import the repo into a new Vercel project (Hobby tier)
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel env vars

## Notes / assumptions made this session

- **Approval step:** left as a raw Supabase table view (filter
  `exercise_submissions` by `status = 'enriched'`, flip to `approved`, then
  manually copy the row into `exercises`). No admin UI built — per MED,
  build one only if this becomes frequent.
- **Exercise library visibility:** shared across all users (single
  `exercises` table, RLS allows all authenticated users to `select`).
  `training_plans` and `plan_entries` remain strictly per-user.
- **Seed list:** loaded as-is, no renames/removals yet — revisit after a
  couple weeks of real use.
- The `exercises` table blocks client-side inserts by policy; only a
  service-role script (run by you, during the approval step) can promote a
  submission into the live table. You'll want a small promotion script or
  a Supabase Edge Function for step 8 — not built yet.
