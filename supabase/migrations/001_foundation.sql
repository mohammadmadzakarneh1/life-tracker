-- Migration 001 — Phase 0 foundation
--
-- Run this in the Supabase SQL editor. Safe to run more than once.
-- Equivalent to re-running schema.sql; this file exists as the record of what
-- Phase 0 changed, so a future problem can be traced to a specific migration.
--
-- Adds: settings (one row per user, created by the app on first load)
-- Adds: RLS policies for settings
-- Changes nothing about existing tables or their rows.

create table if not exists public.settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  currency      text not null default 'JOD',
  week_start    smallint not null default 0 check (week_start between 0 and 6),
  theme         text,
  prior_gpa     numeric(5, 2),
  prior_credits numeric(6, 1),
  target_gpa    numeric(5, 2),
  updated_at    timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "own rows select" on public.settings;
drop policy if exists "own rows insert" on public.settings;
drop policy if exists "own rows update" on public.settings;
drop policy if exists "own rows delete" on public.settings;

create policy "own rows select" on public.settings
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.settings
  for delete using (auth.uid() = user_id);
