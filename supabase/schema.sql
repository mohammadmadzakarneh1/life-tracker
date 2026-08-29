-- Life Tracker schema
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Safe to run more than once.

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  icon        text not null default '✦',
  color       text,
  target_days int  not null default 7 check (target_days between 1 and 7),
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

create table if not exists public.mood_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  score      int  not null check (score between 1 and 5),
  note       text,
  created_at timestamptz not null default now(),
  -- One mood entry per day.
  unique (user_id, date)
);

create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  type         text not null,
  duration_min int check (duration_min between 0 and 1440),
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise   text not null,
  sets       int,
  reps       int,
  weight_kg  numeric(6, 2)
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  -- Null means "someday": a task with no deadline. Dated tasks appear on the calendar.
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
  -- Null for all-day appointments.
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
  currency   text not null default 'USD',
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes — the dashboard queries by user + date range
-- ============================================================

create index if not exists habits_user_idx       on public.habits (user_id);
create index if not exists habit_logs_user_date  on public.habit_logs (user_id, date);
create index if not exists mood_user_date        on public.mood_entries (user_id, date);
create index if not exists workouts_user_date    on public.workouts (user_id, date);
create index if not exists workout_sets_workout  on public.workout_sets (workout_id);
create index if not exists expenses_user_date    on public.expenses (user_id, date);
create index if not exists tasks_user_due        on public.tasks (user_id, due_date);
create index if not exists events_user_date      on public.events (user_id, date);

-- ============================================================
-- Row Level Security
--
-- This is what makes it safe to ship the anon key in a public repo: without these
-- policies, anyone with the key could read every row. With them, the database itself
-- refuses to return a row whose user_id is not the caller's.
-- ============================================================

alter table public.habits       enable row level security;
alter table public.habit_logs   enable row level security;
alter table public.mood_entries enable row level security;
alter table public.workouts     enable row level security;
alter table public.workout_sets enable row level security;
alter table public.expenses     enable row level security;
alter table public.tasks        enable row level security;
alter table public.events       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'habits', 'habit_logs', 'mood_entries', 'workouts', 'workout_sets', 'expenses',
    'tasks', 'events'
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
