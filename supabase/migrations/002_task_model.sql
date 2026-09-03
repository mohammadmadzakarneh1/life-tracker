-- Migration 002 — Phase 1: the task model
--
-- Run in the Supabase SQL editor. Safe to run more than once.
--
-- Makes `tasks` the single source of truth for everything you have to do: a university
-- assignment, a project task and a personal errand become the same row with different
-- optional links. No section gets its own task table.
--
-- Existing rows are preserved. They pick up priority 2 (medium), category 'personal'
-- and kind 'task' from the column defaults.

-- ------------------------------------------------------------
-- Columns
-- ------------------------------------------------------------

alter table public.tasks add column if not exists due_time     time;
alter table public.tasks add column if not exists priority     smallint not null default 2;
alter table public.tasks add column if not exists category     text not null default 'personal';
alter table public.tasks add column if not exists kind         text not null default 'task';
alter table public.tasks add column if not exists estimate_min int;

-- Plain uuid for now, deliberately without a foreign key: `courses` and `projects` do
-- not exist until phases 4 and 3. The FK constraints are added by those migrations, so
-- this one cannot fail on a missing table.
alter table public.tasks add column if not exists course_id  uuid;
alter table public.tasks add column if not exists project_id uuid;

-- ------------------------------------------------------------
-- Constraints
--
-- Postgres has no `add constraint if not exists`, so each one is guarded by a lookup
-- in pg_constraint. That keeps this file re-runnable.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_range') then
    alter table public.tasks add constraint tasks_priority_range
      check (priority between 1 and 3);  -- 1 low, 2 medium, 3 high
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_category_valid') then
    alter table public.tasks add constraint tasks_category_valid
      check (category in ('university', 'project', 'personal', 'other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_kind_valid') then
    alter table public.tasks add constraint tasks_kind_valid
      check (kind in ('task', 'assignment', 'quiz', 'exam', 'study'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_estimate_sane') then
    alter table public.tasks add constraint tasks_estimate_sane
      check (estimate_min is null or estimate_min between 0 and 10080);  -- <= one week
  end if;

  -- The important one. `category` could disagree with course_id / project_id, and then
  -- there would be two answers to "is this university work?". The database refuses the
  -- disagreement instead of trusting application code to stay consistent.
  if not exists (select 1 from pg_constraint where conname = 'tasks_category_matches_link') then
    alter table public.tasks add constraint tasks_category_matches_link
      check (
        (category = 'university' and course_id  is not null and project_id is null) or
        (category = 'project'    and project_id is not null and course_id  is null) or
        (category in ('personal', 'other') and course_id is null and project_id is null)
      );
  end if;
end $$;

-- ------------------------------------------------------------
-- Indexes for the four task views and the per-section lists
-- ------------------------------------------------------------

create index if not exists tasks_user_open      on public.tasks (user_id, done, due_date);
create index if not exists tasks_user_project   on public.tasks (user_id, project_id);
create index if not exists tasks_user_course    on public.tasks (user_id, course_id);
create index if not exists tasks_user_completed on public.tasks (user_id, completed_at desc);
