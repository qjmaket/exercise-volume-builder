-- Exercise Volume Builder — initial schema
-- Run against existing Supabase project qkpvjqnejkkhpzwokyny
-- All tables use RLS, consistent with FoodIQ's profiles/meal_logs pattern.

-- ============================================================
-- exercises: live, approved library (shared across all users)
-- ============================================================
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('resistance', 'plyometric')),
  primary_muscle text not null,
  secondary_muscle text,
  form_cue text,
  status text not null default 'approved' check (status in ('approved')),
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;

-- Shared read: every authenticated user sees the same approved library.
create policy "exercises_select_authenticated"
  on exercises for select
  to authenticated
  using (true);

-- Writes to the live table happen only via the approval promotion step
-- (service role / QJ), not directly by end users.
create policy "exercises_no_client_writes"
  on exercises for insert
  to authenticated
  with check (false);

-- ============================================================
-- exercise_submissions: staging pipeline (pending -> enriched -> approved)
-- ============================================================
create table if not exists exercise_submissions (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id),
  exercise_name text not null,
  notes text,
  suggested_muscle text,
  status text not null default 'pending' check (status in ('pending', 'enriched', 'approved')),
  enriched_data jsonb,
  created_at timestamptz not null default now()
);

alter table exercise_submissions enable row level security;

create policy "exercise_submissions_select_own"
  on exercise_submissions for select
  to authenticated
  using (auth.uid() = requested_by);

create policy "exercise_submissions_insert_own"
  on exercise_submissions for insert
  to authenticated
  with check (auth.uid() = requested_by);

-- ============================================================
-- training_plans: per-user goal + days/week
-- ============================================================
create table if not exists training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  goal text not null check (goal in ('hypertrophy', 'strength', 'powerlifting', 'endurance', 'athleticism')),
  days_per_week int not null check (days_per_week between 1 and 7),
  updated_at timestamptz not null default now()
);

alter table training_plans enable row level security;

create policy "training_plans_all_own"
  on training_plans for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- plan_entries: individual exercise entries within a plan
-- ============================================================
create table if not exists plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  day_index int not null check (day_index >= 0),
  exercise_id uuid not null references exercises(id),
  sets int not null check (sets >= 0),
  reps int not null check (reps >= 0),
  weight numeric,
  created_at timestamptz not null default now()
);

alter table plan_entries enable row level security;

-- Access to plan_entries is scoped through ownership of the parent plan,
-- since plan_entries has no user_id column of its own.
create policy "plan_entries_all_via_plan_ownership"
  on plan_entries for all
  to authenticated
  using (
    exists (
      select 1 from training_plans
      where training_plans.id = plan_entries.plan_id
      and training_plans.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from training_plans
      where training_plans.id = plan_entries.plan_id
      and training_plans.user_id = auth.uid()
    )
  );

create index if not exists idx_plan_entries_plan_id on plan_entries(plan_id);
create index if not exists idx_exercise_submissions_status on exercise_submissions(status);
