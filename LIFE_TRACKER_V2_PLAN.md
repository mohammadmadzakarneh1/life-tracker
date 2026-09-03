# Life Tracker V2 — Plan

Personal app for one user. Optimised for answering **"what should I do today?"** in under five
seconds, and for reducing the two failure modes that matter: forgetting, and stalling.

Written after inspecting the repository and the live database. Nothing is implemented yet.

---

## 1. Current application analysis

**Stack** — deliberately buildless. Plain HTML/CSS/ES modules, no framework, no `npm install`,
no bundler. Supabase (Postgres + Auth) reached directly from the browser via
`@supabase/supabase-js` from a CDN. Hosted as static files on GitHub Pages. Installable PWA.

**Size** — 2,774 lines of source across 21 files. Small enough to refactor confidently.

| Area | File | Lines |
|---|---|---|
| Shell | `index.html` | 80 |
| Styling | `css/styles.css` | 494 |
| Boot / router / theme | `js/app.js` | 210 |
| Auth | `js/auth.js` | 99 |
| Data access | `js/db.js` | 217 |
| DOM + date + modal helpers | `js/ui.js` | 173 |
| Views | `js/views/*.js` | 1,270 |
| Service worker | `sw.js` | 106 |
| Schema | `supabase/schema.sql` | 110 |

**Architecture that works and should be kept**

- **One data-access layer.** Every query lives in `js/db.js`; no view touches Supabase directly.
- **A uniform view contract.** Each view exports `render(container)` and `destroy()`; the router
  swaps them without special cases. Views are lazy-loaded via dynamic `import()`.
- **`el()` DOM builder** in `js/ui.js` — `el('div.card', {onclick}, [children])`. Terse, no
  templating, filters falsy children. ~150 lines doing the job of a framework at this scale.
- **Local-date discipline.** Dates are stored as `YYYY-MM-DD` in local time; `ui.js` deliberately
  avoids `toISOString()`, which would shift the day across the UTC boundary. This is load-bearing.
- **RLS everywhere.** Every table has four policies keyed on `auth.uid() = user_id`, applied by a
  loop in `schema.sql`. Verified by test: a second account sees zero rows, and an insert forged
  with another user's id is rejected by Postgres. This is what makes the public anon key safe.
- **Deployment.** Push to `main` → GitHub Pages. A scheduled workflow pings Supabase daily so the
  free project never pauses, and commits a heartbeat monthly so GitHub never disables the schedule.

**Current pages** — Today, Tasks, Calendar, Habits, Money (5 tabs, bottom bar only).

**Current data model (live)**

| Table | Columns |
|---|---|
| `habits` | name, icon, color, `target_days`, archived |
| `habit_logs` | habit_id, date, done · unique(habit_id, date) |
| `tasks` | title, due_date, done, completed_at, notes |
| `events` | title, date, time, note |
| `expenses` | date, amount, kind(income\|expense), category, note, currency |

**What already works** (verified against the live site, not assumed)

- Signup, sign-in, session persistence, wrong-password rejection, cross-account isolation
- Tasks: create/edit/delete, deadlines, done state, grouping into overdue/today/upcoming/someday
- Calendar: month grid, dots for task deadlines and appointments, per-day panel, appointment CRUD
- Habits: daily checklist, streaks, optimistic toggle with rollback
- Money: all-time balance, monthly received/spent/net, category breakdown
- Today: habit + task tiles, today's appointments, "needs doing" list
- PWA install, offline shell, dark/light theme with `localStorage` persistence

---

## 2. What should remain unchanged

1. **Buildless, no framework.** Nothing in this spec needs React. Adding a build step would add
   the failure mode of a stale `dist/` on top of the caching problems we already fought.
2. **`js/db.js` as the only data layer.** It grows; the rule does not change.
3. **`render`/`destroy` view contract** — extended only to accept route params.
4. **`el()`, `openModal()`, `toast()`, the date helpers.** Reused throughout V2.
5. **RLS-per-table loop** in `schema.sql`. Every new table joins the same array.
6. **Local `YYYY-MM-DD` date convention.**
7. **The existing `tasks` and `events` tables** — extended, never replaced. Existing rows survive.
8. **Deploy pipeline and keepalive workflow.**
9. **Dark/light theming** — already exists; extend the token set, don't rebuild it.

---

## 3. What should be improved

**Technical debt, in priority order**

1. **`schema.sql` cannot alter existing tables.** Everything is `create table if not exists`, so
   re-running it will silently skip the new columns `tasks` needs. This blocks V2 and must be
   fixed first (section 6).
2. **`schema.sql` no longer matches the database.** It declares 5 tables; the database has 8
   (`mood_entries`, `workouts`, `workout_sets` remain by your choice). A schema file that lies is
   worse than none — it will be trusted during a future migration.
3. **No tests, at all.** Four defects reached the live site in this project's short life: two
   stale-cache incidents, a deleted CSS block, and a stray `"false"` rendering. Three were caught
   by you, not me. V2 roughly triples the code and adds real logic (grade maths, next-action
   ranking, streaks, duration sums) — that logic must be testable without a browser.
4. **Cache invalidation** has been the single largest source of "it's broken". Now mitigated
   (network-first for code, `cache: 'reload'`, auto-reload on worker change, `?reset=1` hatch).
   Treat any future change to `sw.js` as high-risk.
5. **`habits.target_days` is dead.** Written, never read. Replace with a real schedule.
6. **Router has no params.** `currentRoute()` reads only the first segment, so `#/university/<id>`
   is impossible. Course and project detail pages need this.
7. **No sidebar.** Desktop uses the mobile bottom bar, wasting the whole viewport.
8. **`expenses.allTime()` fetches every row** to compute a balance. Fine at personal scale, and
   correctness matters more than the query here — but it should not become the pattern for time
   sessions, which will be far more numerous.

**Product gaps vs the spec** — no priority, description, category, due time, or duration on tasks;
no University, Projects, Time Tracking, Progress, Quick Add, Settings, or budget; calendar has
month only and draws from two sources instead of five; Today reports statistics rather than
recommending an action.

---

## 4. What should be removed

- **`js/ui.js: monthStart()`** — dead code, nothing calls it.
- **`habits.target_days`** — replaced by a real schedule (section 12).
- **The three orphan tables.** Not urgent and *not* proposed for this plan: you chose to keep
  them, they cost nothing, and dropping them destroys data irreversibly. The action needed is
  honesty in `schema.sql`, not deletion — it should acknowledge they exist and are unused.
- **Nothing else.** No working feature is removed by V2.

---

## 5. New pages / components

| Route | File | Purpose |
|---|---|---|
| `#/today` | `js/views/today.js` (rewrite of `dashboard.js`) | The default page. Action-first. |
| `#/tasks` | `js/views/tasks.js` (rewrite) | Today / Upcoming / Overdue / Completed views |
| `#/university` | `js/views/university.js` | Course list, term, week schedule |
| `#/university/<id>` | `js/views/course.js` | One course: work, schedule, **grades** |
| `#/projects` | `js/views/projects.js` | Project list by status |
| `#/projects/<id>` | `js/views/project.js` | One project: tasks, progress |
| `#/habits` | `js/views/habits.js` (extended) | Schedule-aware habits |
| `#/calendar` | `js/views/calendar.js` (extended) | Month + Week, five sources |
| `#/money` | `js/views/money.js` (rename of `expenses.js`) | Budget-aware |
| `#/progress` | `js/views/progress.js` | This week vs last week, academics |
| `#/settings` | `js/views/settings.js` | Name, currency, week start, term, theme, **export** |

**Shared components (not routes)**

| File | Purpose |
|---|---|
| `js/nav.js` | Sidebar (desktop) + bottom bar + More sheet (mobile) |
| `js/quickadd.js` | Global `+`: Task / University work / Event / Expense / Habit / Project |
| `js/timer.js` | Persistent "currently tracking" bar, visible on every page |
| `js/rank.js` | Next-action scoring — **pure functions, unit-tested** |
| `js/grades.js` | Grade calculation — **pure functions, unit-tested** |
| `js/duration.js` | Duration formatting and session summing — **pure, unit-tested** |

---

## 6. Database / data-model changes

### 6.1 Fix the migration mechanism first

`supabase/schema.sql` is restructured into four ordered sections, all idempotent:

1. `create table if not exists` — new tables
2. **`alter table … add column if not exists`** — new columns on existing tables (the missing piece)
3. `create index if not exists`
4. The RLS loop, with every table name in one array

Re-running the whole file stays safe, and it becomes able to evolve existing tables. Each phase
also lands a numbered file in `supabase/migrations/` so there is a record of what ran when.

### 6.2 `tasks` — the single source of truth

Extending the existing table; existing rows keep working.

```
tasks
  id, user_id, title
  description   text            (renamed use of existing `notes`)
  due_date      date            (exists)
  due_time      time            NEW, optional
  priority      smallint 1..3   NEW, default 2   -- 1 low, 2 medium, 3 high
  category      text            NEW  ('university' | 'project' | 'personal' | 'other')
  kind          text            NEW  ('task' | 'assignment' | 'quiz' | 'exam' | 'study')
  course_id     uuid  → courses NEW, null
  project_id    uuid  → projects NEW, null
  estimate_min  int             NEW, null
  done, completed_at, created_at (exist)
```

**One source of truth, enforced by the database.** `category` could disagree with `course_id` /
`project_id`, so a CHECK constraint forbids it:

```sql
check (
  (category = 'university' and course_id is not null and project_id is null) or
  (category = 'project'    and project_id is not null and course_id  is null) or
  (category in ('personal','other') and course_id is null and project_id is null)
)
```

A university assignment *is* a task. A project task *is* a task. There is no second task system —
`courses` and `projects` own no task tables of their own.

**Backfill:** existing rows get `priority = 2`, `category = 'personal'`, `kind = 'task'`.

### 6.3 New tables

```
terms            id, user_id, name,
                 classes_start date, classes_end date,   -- 04/10/26 .. 14/01/27
                 exams_start   date, exams_end   date,   -- 16/01/27 .. 30/01/27
                 status ('active'|'completed'), created_at
term_breaks      id, user_id, term_id → terms, name,
                 start_date, end_date                    -- single day: start = end
courses          id, user_id, term_id → terms, name, code, instructor, location,
                 color, credits numeric,
                 completed boolean default false,
                 final_percent numeric null,   -- frozen when the term closes
                 archived, created_at
course_meetings  id, user_id, course_id → courses, weekday 0..6, start_time, end_time, location
assessments      id, user_id, course_id → courses, name,
                 kind ('midterm'|'quiz'|'assignment'|'final'|'other'),
                 score numeric null, max_score numeric, weight numeric null, date date null
projects         id, user_id, name, description,
                 status ('planning'|'active'|'paused'|'completed'),
                 deadline date null, archived, created_at
time_sessions    id, user_id, task_id → tasks null, category, course_id null, project_id null,
                 started_at timestamptz, ended_at timestamptz null, duration_sec int null, note
budgets          id, user_id, month text 'YYYY-MM', amount numeric, currency,
                 unique (user_id, month)
settings         user_id pk, display_name, currency default 'JOD', week_start smallint,
                 theme,
                 prior_gpa numeric      default 64.6,  -- cumulative % before Life Tracker
                 prior_credits numeric  default 27,    -- credit hours that average covers
                 target_gpa numeric null,              -- optional; drives the 'needed' figure
                 updated_at
```

Notes on deliberate choices:

- **`terms` exists because class schedules need an end.** Without a term, a Sunday 10:00 lecture
  repeats into 2035 on the calendar. It also scopes grades to a semester. The spec did not mention
  terms; the calendar cannot be correct without them.
- **A term has four dates, not two.** PSUT's calendar makes this concrete: classes run
  4 Oct – 14 Jan, then finals run 16 – 30 Jan. Weekly class blocks must stop on 14 January, while
  the *term* continues to 30 January for grades and GPA. Collapsing these into one `end_date`
  would either draw three phantom weeks of lectures through the exam period or close the term
  before its finals are graded.
- **`term_breaks` exists because the calendar has holes.** Winter break (25–31 Dec), Christmas
  Day, New Year's Day. A weekly Sunday lecture must not render on a day the university is shut,
  and a break is not a weekday exception — it is a date range that suppresses *all* class
  occurrences inside it. Single-day holidays are the degenerate case where `start_date =
  end_date`, so one table covers both.
- **`course_meetings` is a weekly pattern, not stored occurrences.** The calendar expands it for
  the visible range only. No RRULE, no recurrence engine.
- **`time_sessions` denormalises `category`/`course_id`/`project_id` at start time** so deleting a
  task later does not corrupt the history of where your hours went.
- **One active timer**, enforced by `create unique index … on time_sessions (user_id) where
  ended_at is null`. `started_at` lives in the database, so the timer survives a reload and is
  correct if you start on the laptop and check on the phone.
- **`settings.currency` defaults to JOD**, matching your example. The code currently hardcodes USD.

### 6.4 Habits

```
habits: drop target_days;  add days smallint[] default '{0,1,2,3,4,5,6}'
```

"Due today" = `today's weekday ∈ days`. Streaks count only scheduled days, so a weekdays-only
habit is not broken by Saturday.

---

## 7. Navigation architecture

**Desktop (≥ 960px)** — fixed 240px sidebar:

```
Life Tracker
  Today · Tasks · University · Projects · Habits · Calendar · Money · Progress
  ─────
  Settings
```

Content column max 900px. Quick Add is a button pinned at the top of the sidebar.

**Mobile (< 960px)** — bottom bar of five: **Today · Tasks · ⊕ · Calendar · More**. `⊕` is the
centre Quick Add. **More** opens a sheet with University, Projects, Habits, Money, Progress,
Settings. This keeps the four things you touch daily one tap away and avoids the 7-tab crush we
already hit.

**Router** gains params: `#/university/<courseId>` parses to
`{ route: 'university', params: ['<courseId>'] }`, and `render(container, params)`. Unknown routes
still fall back to Today.

**Timer bar** sits directly above the bottom bar on mobile, and at the bottom of the sidebar on
desktop, whenever a session is running.

---

## 8. Today dashboard structure

The default route after login. Ordered by *what you do with it*, not by data type.

```
Good morning, Mohammad
Thursday, 3 September

┌ 2 tasks need your attention ─────────────┐   ← only when overdue > 0, calm not alarming
└──────────────────────────────────────────┘

TODAY            4 remaining · 3 done · 43%     ← one thin progress bar, no charts

NEXT ACTION
  Study Calculus
  Due tomorrow · High priority · Calculus II
  [ Start ]  [ Done ]  [ Not now ]

TODAY'S TASKS
  ☐ Submit lab report      High    17:00   University   30m
  ☐ Fix login bug          Medium          Project      1h
  ☑ Read chapter 4                         University

TODAY'S SCHEDULE
  08:00–09:30   Calculus II          Hall B
  10:00         Dentist
  14:00–15:30   Data Structures      Lab 2

HABITS
  ☐ Read 20 pages     4 day streak
  ☑ Water

TIME TODAY                                     2h 40m
  University 2h 10m · Projects 30m
```

**Next Action** is one deterministic score, not a mood. Highest wins:

| Signal | Points |
|---|---|
| Overdue | 1000 + 10 × days overdue |
| Due today | 500 |
| Due tomorrow | 300 |
| Due within 7 days | 100 + 5 × (7 − days) |
| No deadline | 10 |
| Priority high / medium / low | +60 / +30 / 0 |
| Kind exam / quiz+assignment / other | +40 / +20 / 0 |

Ties break on earlier `due_date`, then `created_at`. The card always shows *why* it was chosen —
that is what makes it trustworthy rather than magic. **"Not now"** hides that task's suggestion
for the rest of the day (per-day, in `localStorage`) and promotes the next one, so the feature
cannot become a nag. `Start` begins a timer and jumps nowhere — no navigation, no friction.

No graphs on this page. One progress bar is the limit.

---

## 9. Task architecture

Four saved views, one query layer: **Today** (due ≤ today, not done — overdue included and pinned
first), **Upcoming** (due > today), **Overdue** (its own view for when it matters), **Completed**
(most recent first). Plus an "All / Someday" for undated.

Overdue is visually unmistakable: red left border, red due label, count in the header — never a
modal, never a red badge on the app icon.

Every list row supports one-tap complete without navigating. Editing opens the existing modal.

**Fast add** — the Quick Add task form is title + due date only, with priority/category/duration
behind an "More" disclosure that remembers being open. If capturing a task takes more than about
three seconds it will not happen, which is the whole point.

---

## 10. University + grades architecture

**Course list** shows this term's courses with current grade and next deadline. **Course detail**
has three sections: Work, Schedule, Grades.

*Work* creates tasks with `category='university'`, `course_id` set and a `kind` of assignment /
quiz / exam / study — which is exactly why they appear on Today, in Tasks and on the Calendar
automatically. No syncing, no duplication.

*Schedule* edits `course_meetings` (weekday + start/end + location).

*Grades* lists `assessments` and shows the current grade, computed transparently:

- **With weights** — `Σ(score/max × weight) ÷ Σ(weight of graded items)`, displayed as
  *"84.2% · based on 45% of the course graded so far"*. This is the honest answer; simply summing
  weights would make an early A look like a final A.
- **Without weights** — `Σscore ÷ Σmax`.
- **Mixed** — weighted items use weights; unweighted are excluded and the UI says so.

Always show the arithmetic in a "how is this calculated?" disclosure. A grade you cannot verify is
a grade you will not trust.

No study-topic or chapter tracking, per the spec.

### 10.1 GPA — percentage scale, credit-weighted

Your GPA is **64.6 on a 100-point scale**, so no letter grades or 4.0 conversion are involved.
That makes this simple arithmetic rather than a university-specific rules engine.

**Semester average** — credit-weighted mean of this term's course percentages:

```
Σ(course_percent × credits) ÷ Σ(credits)
```

**Cumulative GPA** — carried forward from a baseline you enter once in Settings
(`prior_gpa = 64.6`, `prior_credits = <hours that average covers>`):

```
(prior_gpa × prior_credits + Σ(course_percent × credits))
 ÷ (prior_credits + Σ(credits))
```

Only **completed** courses count. Courses in progress feed a separate, clearly labelled
**projected GPA** using their current grades — that is the number worth seeing mid-semester,
because it is the one you can still change. Both figures show their inputs in a "how is this
calculated?" disclosure; a GPA you cannot check is one you will not trust.

### 10.1a The actual baseline, and why it justifies the whole feature

`prior_gpa = 64.6`, `prior_credits = 27`. With 16 credits registered, the record after this
semester is 43 hours — meaning **this one semester is 37% of the entire transcript**.

| This semester averages | Cumulative becomes | Change |
|---|---|---|
| 60% | 62.89% | −1.71 |
| 65% | 64.75% | +0.15 |
| 70% | 66.61% | +2.01 |
| 75% | 68.47% | +3.87 |
| 80% | 70.33% | +5.73 |
| 85% | 72.19% | +7.59 |
| 90% | 74.05% | +9.45 |

And inverted — what a target requires:

| Target cumulative | Needs this semester |
|---|---|
| 66% | 68.4% |
| 68% | 73.7% |
| 70% | 79.1% |
| 72% | 84.5% |

**This table is the single most motivating screen the app can show, and it should be built.** Not
as decoration on Progress, but on the course/grades page: *"current projection 68.5% — 79.1%
needed this semester for a 70 cumulative."* It converts an abstract worry into a number attached
to the assessments actually in front of you, which is exactly the leverage a 37%-of-record
semester deserves.

Deliberately **not** a goal system, a streak, or a nag — one honest figure, updated as grades
arrive. `settings.target_gpa` (optional) drives the second table; with no target set, only the
projection shows.

### 10.2 Editing it every semester

The rollover is a deliberate, roughly two-minute job about three times a year — not something the
app tries to guess.

**Settings → Academic → Start new semester**

1. Name, start date, end date. The previous term is marked `completed`.
2. Each course in the closing term has its computed grade **frozen into `final_percent`**, and is
   marked `completed`. This is why history stays stable: editing an old assessment later cannot
   silently rewrite a GPA you already banked. Any course you didn't finish can be excluded.
3. Add this semester's courses: name, code, credits, instructor, colour.
4. Add each course's weekly meetings — weekday, start/end time, room.

Courses are **not** copied forward, because they change every semester. There is a *Duplicate
course* action for a retake or a continuing course, which copies the name, code, credits and
meeting pattern but no assessments.

**Nothing is destroyed by a rollover.** Past terms remain browsable read-only, with their courses,
assessments and final grades — which is what makes Progress able to compare semesters later.

**Mid-semester edits** stay available without any ceremony: add or drop a course, change a
meeting time when the timetable shifts, add assessments as they are graded. Only the once-a-term
setup is a flow; everything else is ordinary editing.

**Prompting.** When a term's `end_date` passes, Today shows a single quiet line — *"First Semester
2026/2027 has ended. Close it out?"* — dismissible, shown once. No repeated nagging.

---

## 11. Project architecture

List grouped by status (Planning / Active / Paused / Completed), with progress and deadline.
Detail page shows the project's tasks — which are ordinary `tasks` rows with `project_id` set.

Progress is **computed**, never stored: `completed tasks ÷ total tasks`. A stored percentage would
drift out of sync the first time a task changed elsewhere.

A project task due today appears on Today with no extra wiring, because it is the same row.

---

## 12. Habit architecture

Name, icon, `days` (daily or chosen weekdays), one-tap completion, streak, history. Today shows
only habits scheduled for today. Streak counts scheduled days only.

Weekly view is a compact 7-column grid of ticks — the existing sparkline pattern, no heat maps, no
badges, no XP.

---

## 13. Calendar architecture

One calendar, five sources, all read-only projections except appointments:

| Source | Shown as |
|---|---|
| `course_meetings` expanded over `classes_start … classes_end`, minus `term_breaks` | Class blocks with times |
| `tasks` where `kind` in (exam, quiz) | Exam markers |
| `tasks.due_date` (assignments, project, personal) | Deadline dots |
| `projects.deadline` | Deadline dots |
| `events` | Appointments |
| `terms` exam windows + `term_breaks` | Background bands on the month/week grid |

The expansion rule is one pure function — `occurrencesFor(meeting, term, breaks, from, to)` — and
it is unit-tested, because "why is there a lecture on Christmas Day?" is exactly the class of bug
that survives manual checking.

Exam windows and breaks render as tinted bands rather than entries: during 28 Nov – 12 Dec the
month view should *look* like midterm season without a single row being added.

**Month** (existing grid, extended to five dot colours with a legend) and **Week** (time-gridded
columns — the view that actually answers "when am I in class?").

**Day view is not planned.** It would duplicate Today's Schedule section almost exactly; Today is
the better home for it. Flagged as a deliberate deviation from the spec.

---

## 14. Money architecture

Keeps the current entries and balance; adds the budget the spec asks for.

```
September 2026
Income        500 JOD
Expenses      180 JOD
Budget        300 JOD
Remaining     120 JOD    ▓▓▓▓▓▓░░░░  60% used
```

Below: category breakdown (existing bars), then entries. Budget is per month in `budgets`, edited
inline, and carried forward as the default for the next month. Categories become the spec's set:
Food, Transport, University, Shopping, Entertainment, Other. Currency comes from `settings`,
defaulting to JOD.

The all-time balance stays — it answers "what do I have", which the monthly figure cannot.

---

## 15. Time-tracking architecture

`Start` from a task, from Next Action, or from the timer bar for an untargeted category.

- Start → insert `time_sessions` row with `started_at` and the task's category/course/project.
- Pause → **stop the segment**; Resume → start a new one on the same task. Total time is the sum
  of segments. This avoids a `paused_at` state that can be left inconsistent by a closed tab, and
  keeps every row meaning "you were working during this interval", which is what makes the
  summaries true.
- Stop → set `ended_at` and `duration_sec`.
- Exactly one open session per user, enforced by a partial unique index.
- The running timer is computed from `started_at`, so a reload, a crash, or switching devices all
  show the correct elapsed time.

Summaries: today by category, this week's total, and per-task totals on the task itself. Nothing
else — the purpose is seeing where the hours went, not scoring them.

---

## 16. Progress architecture

One page answering "am I actually getting things done?", built from comparisons rather than charts.

```
THIS WEEK                  vs last week
Tasks completed      23         +5
Tasks overdue         2         −3
Focused hours     14h 35m    +2h 10m
Habit completion     78%        +6%
University work       9         +2

ACADEMICS
Calculus II        84.2%   (45% graded)
Data Structures    91.0%   (60% graded)

RECENT ASSESSMENTS      UPCOMING EXAMS
Quiz 3    18/20        Calculus midterm   in 6 days
```

Week boundaries respect `settings.week_start`. Deltas are plain numbers with direction, coloured
only where a direction is unambiguously good or bad. At most one small bar chart on the page.

---

## 17. Mobile / responsive considerations

- Single breakpoint at **960px**: sidebar above, bottom bar below. Avoids a half-broken middle tier.
- Bottom bar of five with a centre Quick Add; everything else behind **More**.
- Existing `env(safe-area-inset-bottom)` handling stays; the timer bar must respect it too.
- Tap targets ≥ 44px. Current 27px habit checkboxes are too small and get bumped.
- Week calendar scrolls horizontally inside its own container — the page body never scrolls sideways.
- Modals stay bottom-sheets on mobile, centred dialogs above 560px (already the case).
- Quick Add opens with the keyboard focused on the title field.

---

## 18. Implementation phases

Reordered from the spec's suggestion, because two things must come first: the migration mechanism
(nothing else can ship without it) and the task model (Today, University, Projects and Time
Tracking all depend on it).

| Phase | Scope | Why here |
|---|---|---|
| **0** | Migration restructure, `settings` table, test harness, nav shell (sidebar + bottom bar + More + router params) | Everything downstream needs additive migrations and a place to live |
| **1** | Task model expansion + Tasks views + **Quick Add** | The spine of the app; Quick Add early because capture is the habit that matters |
| **2** | **Today** rewrite: Next Action, today's tasks, schedule, habits, time placeholder | Earliest point the app becomes worth opening daily |
| **3** | University: terms, courses, meetings, university work | Feeds Today and Calendar |
| **4** | Grades | Self-contained; your stated primary motivation |
| **5** | Projects | Reuses the task system; small once Phase 1 lands |
| **6** | Time tracking: sessions, timer bar, summaries | Completes Today's last section |
| **7** | Calendar: five sources, Week view | Needs courses and projects to exist first |
| **8** | Money: budgets, categories, currency | Independent; can move earlier if you want it sooner |
| **9** | Habits: schedules, weekly view | Small |
| **10** | Progress | Depends on everything above |
| **11** | Polish: responsive pass, Settings, export, accessibility, cleanup | Last |

Each phase ships deployable and tested. The app is never left broken between phases.

---

## 19. Risks and migrations

| Risk | Mitigation |
|---|---|
| **`create table if not exists` skips new columns** — the top blocker | Restructure into explicit `alter table … add column if not exists` (§6.1) before anything else |
| **`schema.sql` disagrees with the live database** | Reconcile in Phase 0; document the three orphan tables as intentionally retained |
| **Service worker staleness** — four incidents already | Now network-first + `cache: 'reload'` + auto-reload + `?reset=1`. Bump `CACHE` every deploy; treat `sw.js` edits as high-risk |
| **A regression like the deleted calendar CSS** | Add `tests/` (plain Node, no dependencies) covering date maths, ranking, grades, streaks, budget and duration logic, plus the existing CSS-class audit as a check |
| **Category and `course_id` disagreeing** | DB CHECK constraint makes it impossible (§6.2) |
| **Timer left running for days** | Sessions over ~12h are flagged in the UI for confirmation rather than silently counted |
| **Clock/timezone mixing** | `date`/`time` stay local strings; only `time_sessions` uses `timestamptz`. Never mix in one comparison |
| **Growing module count on a buildless site** | Views stay lazy-loaded; measure first paint before considering a bundler |
| **No offline writes** | Out of scope, and it should be said plainly: offline shows the shell, not your data |
| **Data loss** — this project already lost a predecessor | JSON export in Settings (Phase 11); Supabase free tier has no backups |

**Migration order per phase:** write the numbered migration, run it in the Supabase SQL editor,
confirm with a REST probe that new columns exist, *then* deploy the code that depends on them.
Deploying code before its migration is what produced the "Could not load tasks" screen earlier.

---

## 20. Files likely to be created or modified

**Created**

```
js/views/today.js  university.js  course.js  projects.js  project.js
                   progress.js    settings.js  money.js
js/nav.js  js/quickadd.js  js/timer.js  js/rank.js  js/grades.js  js/duration.js
supabase/migrations/001_foundation.sql … 00N_*.sql
tests/run.js  tests/dates.test.js  tests/rank.test.js  tests/grades.test.js
tests/duration.test.js  tests/habits.test.js  tests/money.test.js
tests/audit-css.js
```

**Modified**

```
index.html            sidebar, bottom bar, More sheet, Quick Add, timer bar
css/styles.css        layout system, sidebar, week grid, priority styling, larger tap targets
js/app.js             router params, default route, nav wiring, timer bootstrap
js/db.js              tasks/courses/terms/meetings/assessments/projects/sessions/budgets/settings
js/ui.js              duration + weekday + relative-date helpers; drop dead monthStart()
js/views/tasks.js     priority, category, four views, fast add
js/views/calendar.js  five sources, Week view
js/views/habits.js    schedules, weekly grid
js/views/dashboard.js → replaced by today.js
js/views/expenses.js  → renamed money.js, budgets added
sw.js                 new files in SHELL, cache bump
supabase/schema.sql   restructured into four idempotent sections
README.md             architecture, migration workflow, test instructions
```

---

## 21. Open questions

1. ~~**Prior credit hours**~~ — **answered: 64.6% over 27 credit hours.** GPA is fully specified;
   see §10.1 and §10.3.
2. **Recurring tasks** — weekly labs and readings are the obvious case. Deferred deliberately;
   recurrence is where task apps get complicated. Do you want it, and can it wait past Phase 11?
3. **Notifications are excluded, but forgetting is your problem #1.** As specified, the app helps
   only when you open it. The honest options are a daily habit of opening it, or an opt-in browser
   notification later. Not building it — flagging that the spec's exclusion works against its own
   stated goal.
4. **Semester end date** — the start is confirmed: **Sunday 4 October 2026**, per PSUT's public
   academic calendar, which lists "1st Semester Classes Begin — October 4, Sunday". PSUT does not
   publish the semester end date there. The rollover form will therefore **default the end to
   ~22 January 2027** (16 teaching weeks) and leave it editable, so the calendar has a bound
   without waiting on an exact date. Correct it when your timetable confirms finals.

   Side note: PSUT's week begins on Sunday, which matches the calendar grid already built — so
   `settings.week_start` defaults to Sunday rather than Monday.
5. **Money ordering** — Phase 8 is late. Move it earlier if you're tracking spending now.
6. **Deleting versus archiving** — courses and projects accumulate. Archive is assumed; confirm.
7. ~~**When does the semester actually begin?**~~ — **answered by the official calendar:
   Sunday 4 October 2026.** Full dates in Appendix B. The phase order stays as planned; there is
   about a month before classes start.

---

## Appendix A — Registered courses, First Semester 2026/2027

From the portal registration screen (المواد المسجلة). **16 credit hours**, six courses. This is
the seed data for Phase 3, and the shape it implies is what the model must support.

| Code | Course | Cr | Sec | Instructor | Days | Time | Room |
|---|---|---|---|---|---|---|---|
| 22241 | تصميم المنطق الرقمي (Digital Logic Design) | 3 | 4 | أ.د. احمد الحياصات | Sun Tue Thu | 10:00–11:00 | 342 |
| 20133 | رياضيات (2) لطلبة الهندسة (Maths 2 for Engineering) | 3 | 1 | د. ميساء خضر | Sun Tue Thu | 12:00–13:00 | 309 |
| 11206 | البرمجة بالكينونية (Object-Oriented Programming) | 3 | 3 | هـ.ت. (TBA) | Mon Wed | 11:00–12:30 | 206 |
| 11253 | مختبر البرمجة بالكينونية — Online (تزامن) | 1 | 7 | هـ.ت. (TBA) | Wed | 14:00–17:00 | Online |
| 20134 | رياضيات متقطعة (1) — Blended (Discrete Maths) | 3 | 6 | رجاء القديرات | Wed | 12:30–14:00 | 342 |
| 31351 | قضايا معاصرة في الوطن العربي — Blended | 3 | 2 | شهيناز عيسى | Mon | 9:30–11:00 | 343 |

Weekly shape: Sun/Tue/Thu are light with a midday gap; Monday is two back-to-back sessions;
**Wednesday runs 11:00–17:00 with no break.** Worth surfacing — the answer to "what should I do
today?" is different on a Wednesday.

### What this changes in the plan

1. **`courses.section`** — add it. It is on every registration row and is what you check against
   the portal; leaving it out means the app cannot be reconciled with the official record.
2. **A lab is a separate course, not a component.** 11253 (1 cr) and 11206 (3 cr) are separately
   registered, separately graded, and meet at different times. Modelling the lab as a child of the
   lecture would fight the registrar's own model for no gain.
3. **Instructor must be optional and free-text.** Two rows read هـ.ت. (staff/TBA), which is a
   placeholder, not a name. Already optional in the schema — confirmed correct.
4. **`location` is free text, not a room number.** One course meets "Online".
5. **Multiple weekdays sharing one time** — three rows do this. `course_meetings` already stores
   one row per weekday, so "Sun Tue Thu 10:00–11:00" becomes three rows. Confirmed correct; the
   course form should accept a day multi-select and expand it, rather than making you add three
   meetings by hand.
6. **Arabic text support is now a hard requirement, not a nicety.** Every course name is Arabic,
   often mixed with Latin ("Blended", "Online") and digits. Consequences:
   - `dir="auto"` on any element or input rendering user text — course names, task titles, notes.
     Without it, mixed-direction strings put parentheses and numbers in the wrong place.
   - Never assume a string's direction from the app's `lang="en"`; per-field `dir="auto"` only.
   - Times, dates and grades stay LTR and must not inherit RTL from a neighbouring Arabic label.
   - The system font stack already renders Arabic on Windows and iOS; no webfont needed.

   This is cheap if done in Phase 1 with the task form, and expensive to retrofit across every
   view later. Moved into Phase 1.

---

## Appendix B — First Semester 2026/2027, from PSUT's official calendar

Seed data for the term created in Phase 3. Source: PSUT Academic Calendar 2026/2027.

| Field | Value |
|---|---|
| Name | First Semester (Fall 2026) |
| `classes_start` | 2026-10-04 (Sun) |
| `classes_end` | 2027-01-14 (Thu) |
| `exams_start` | 2027-01-16 (Sat) |
| `exams_end` | 2027-01-30 (Sat, approximate — calendar says "to ~30/01") |

`term_breaks`

| Name | From | To |
|---|---|---|
| Winter break | 2026-12-25 | 2026-12-31 |
| New Year's Day | 2027-01-01 | 2027-01-01 |

Christmas Day (25/12) falls inside the winter break, so it needs no separate row.

**Dates worth knowing but deliberately not modelled as rows** — these are university-wide
administrative milestones, not things you act on daily. They belong in a small static reference
on the University page, not in the calendar's data model:

| Date | Event |
|---|---|
| 2026-09-28 | Deadline to register for the 1st semester |
| 2026-09-29 → 30 | Add/drop period |
| 2026-11-10 | First exams begin |
| 2026-11-28 → 12-12 | **Midterm exams** |
| 2026-12-15 | Second exams begin |
| 2027-01-12 | **Deadline to withdraw from courses** |
| 2027-02-02 | Deadline for submitting final results |

The withdrawal deadline (12 Jan) is the one with real consequences — it is the last day a course
going badly can be dropped. Worth a single line on the University page as it approaches, not a
notification.

### Next term, for reference

Second Semester (Spring 2027): registration deadline 07/02, classes begin **14/02/2027**, classes
end 31/05, finals 01/06 → ~15/06. Eid Al-Fitr ~09–12/03 and Eid Al-Adha ~16/05 are breaks, and
Palm Sunday (25/04) plus Easter (02/05, two days) are holidays for Christian students. Not seeded
now — entered at rollover, which is exactly the two-minute flow in §10.2.
