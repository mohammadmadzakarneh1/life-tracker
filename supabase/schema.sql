-- Life Tracker — full schema.
--
-- Paste this whole file into the Supabase SQL editor and Run. Safe to run repeatedly.
--
-- Four ordered sections, all idempotent:
--   1. tables   — create if not exists
--   2. columns  — alter ... add column if not exists   <- this is what lets the schema evolve
--   3. indexes  — create if not exists
--   4. RLS      — drop and recreate policies for every table
--
-- Section 2 exists because `create table if not exists` silently skips a table that already
-- exists, including its new columns. Adding a column to a live table has to be an ALTER.
-- Put new columns there, never in the CREATE above.
--
-- NOT MANAGED HERE: mood_entries, workouts, workout_sets. The mood and fitness features were
-- removed from the app; the tables were deliberately kept so their history stays recoverable.
-- They keep the RLS policies from an earlier run and are excluded from the loop in section 4.
-- Do not "tidy" them away without deciding to destroy their rows.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  icon        text not null default '✦',
  color       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date     date not null,
  done     boolean not null default true,
  -- One row per habit per day. The app upserts on this, so double-tapping is harmless.
  unique (habit_id, date)
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  due_date     date,
  done         boolean not null default false,
  completed_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  date       date not null,
  time       time,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  amount     numeric(12, 2) not null check (amount >= 0),
  kind       text not null check (kind in ('income', 'expense')),
  category   text not null default 'Other',
  note       text,
  currency   text not null default 'JOD',
  created_at timestamptz not null default now()
);

-- One row per user. Created by the app on first load, not seeded here, because a
-- migration run in the SQL editor has no auth.uid() to attach a row to.
create table if not exists public.settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  currency      text not null default 'JOD',
  week_start    smallint not null default 0 check (week_start between 0 and 6), -- 0 = Sunday
  theme         text,
  prior_gpa     numeric(5, 2),  -- cumulative % earned before using this app
  prior_credits numeric(6, 1),  -- credit hours that average covers
  target_gpa    numeric(5, 2),  -- optional; drives the "needed this semester" figure
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 2. Columns added to existing tables
--
-- Every future column goes here. `add column if not exists` is a no-op when the
-- column is already present, so this section is safe to re-run forever.
-- ============================================================

-- habits.target_days was written but never read; replaced by a real weekly schedule
-- in a later phase. Left in place for now so no data is lost.
alter table public.habits add column if not exists target_days int;

-- ============================================================
-- 3. Indexes
-- ============================================================

create index if not exists habits_user_idx      on public.habits (user_id);
create index if not exists habit_logs_user_date on public.habit_logs (user_id, date);
create index if not exists tasks_user_due       on public.tasks (user_id, due_date);
create index if not exists events_user_date     on public.events (user_id, date);
create index if not exists expenses_user_date   on public.expenses (user_id, date);

-- ============================================================
-- 4. Row Level Security
--
-- This is what makes it safe to ship the anon key in a public repo. Without these
-- policies anyone with the key could read every row; with them the database itself
-- refuses to return a row whose user_id is not the caller's.
--
-- `settings` is keyed on user_id as its primary key rather than a separate id, so the
-- same policy shape still applies.
-- ============================================================

alter table public.habits    enable row level security;
alter table public.habit_logs enable row level security;
alter table public.tasks     enable row level security;
alter table public.events    enable row level security;
alter table public.expenses  enable row level security;
alter table public.settings  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'habits', 'habit_logs', 'tasks', 'events', 'expenses', 'settings'
  ]
  loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);

    execute format(
      'create policy "own rows select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;
