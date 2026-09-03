-- Migration 003 — Phase 3: projects
--
-- Run in the Supabase SQL editor. Safe to run more than once.
--
-- Projects own no tasks of their own: a project task is an ordinary `tasks` row with
-- project_id set. That is why a project task due today appears on Today with no syncing
-- code anywhere — it is the same row.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text,
  status      text not null default 'active'
                check (status in ('planning', 'active', 'paused', 'completed')),
  deadline    date,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists projects_user_status on public.projects (user_id, status);

-- ------------------------------------------------------------
-- Link tasks to projects
--
-- Any project_id left over from before this table existed cannot satisfy a foreign
-- key, so clear those rows first. Resetting category alongside keeps
-- tasks_category_matches_link satisfied — dropping only the link would leave a row
-- claiming to be project work with nothing to point at.
-- ------------------------------------------------------------

update public.tasks
   set project_id = null,
       category = 'personal'
 where project_id is not null
   and not exists (select 1 from public.projects p where p.id = tasks.project_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_project_fk') then
    -- Cascade: deleting a project deletes its tasks. The alternative, setting
    -- project_id to null, would violate tasks_category_matches_link and leave orphans
    -- claiming to be project work. The UI offers archive as the non-destructive route.
    alter table public.tasks
      add constraint tasks_project_fk
      foreign key (project_id) references public.projects (id) on delete cascade;
  end if;
end $$;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------

alter table public.projects enable row level security;

drop policy if exists "own rows select" on public.projects;
drop policy if exists "own rows insert" on public.projects;
drop policy if exists "own rows update" on public.projects;
drop policy if exists "own rows delete" on public.projects;

create policy "own rows select" on public.projects
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.projects
  for delete using (auth.uid() = user_id);
