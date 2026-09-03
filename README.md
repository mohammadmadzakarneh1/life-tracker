# Life Tracker

A personal tracker for habits, tasks, appointments and money. Plain HTML/CSS/JS — no build step,
no framework, no `npm install`. Data lives in Supabase behind a login, so the same account
shows the same data on every device.

## Setup

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a project (free tier is enough).
2. **Settings → API** — copy the **Project URL** and the **anon public** key.
3. Paste both into [`js/config.js`](js/config.js).
4. **SQL Editor** — paste all of [`supabase/schema.sql`](supabase/schema.sql) and Run.
5. **Authentication → Providers → Email** — turn **Confirm email** off if you would rather not
   click a confirmation link when signing up. Leave it on if you want the extra safety.

The anon key is meant to be public — it only identifies an anonymous visitor of the project.
Every table has Row Level Security enabled, so the database itself refuses to return rows that
belong to another user. **Never** put the `service_role` key in this repo; it bypasses RLS.

### 2. Run it locally

ES modules do not work over `file://`, so use a real server:

```bash
npx --yes serve -l 5173 .
```

Then open <http://localhost:5173>.

### 3. Deploy

Push to GitHub, then **Settings → Pages → Source: `main` / root**. The site appears at
`https://<user>.github.io/<repo>/` within a minute or two. Any static host works — the app is
just files.

On your phone, open that URL and use **Add to Home Screen** to install it as an app.

## Working on it

### Tests

Pure logic — dates, ranking, grades, durations — is checked without a browser:

```bash
node tests/run.js
```

No dependencies, no framework. `package.json` exists only so Node treats the app's files as ES
modules; there is still no build step. Only modules without network imports can be tested, which
is deliberate — it keeps real logic in pure files, away from I/O. `js/db.js` imports supabase-js
from a CDN and is exercised in the browser instead.

`tests/css.test.js` asserts every class used in markup or JS has a rule in the stylesheet. A real
regression once deleted the calendar's styles as collateral damage while removing an adjacent
block, and nothing in the JavaScript failed — the app just rendered wrong.

### Changing the database

1. Write the change into `supabase/schema.sql`. **New columns go in section 2**
   (`alter table ... add column if not exists`) — never into the `create table` in section 1,
   which is skipped entirely for a table that already exists.
2. Add a numbered file under `supabase/migrations/` recording the delta.
3. Run it in the Supabase SQL editor.
4. Probe the REST API to confirm the new table or column is really there.
5. **Then** deploy the code that depends on it. Deploying first leaves the app showing
   "Could not load ..." until the migration is run.

### Deploying

Push to `main`; GitHub Pages serves it. **Bump `CACHE` in `sw.js` whenever a file changes.** Code
is fetched network-first with `cache: 'reload'` — GitHub Pages sends `max-age=600`, so without
that the browser's own HTTP cache serves stale JavaScript for ten minutes. The page also reloads
once when a new worker takes control, so an update applies on the visit it arrives rather than the
next one. If a device is ever stuck on an old build, open the app with `?reset=1` to unregister
workers and clear caches.

## Project layout

| Path | Role |
|---|---|
| `index.html` | App shell: auth screen, sidebar, bottom bar, view container |
| `css/styles.css` | All styling; light/dark via custom properties, logical properties for future RTL |
| `js/config.js` | Supabase URL and anon key |
| `js/strings.js` | All interface text, so an Arabic UI is a second object rather than a rewrite |
| `js/nav.js` | One nav model rendering the sidebar, bottom bar and More sheet |
| `js/db.js` | Every database call in the app; views never touch Supabase directly |
| `js/auth.js` | Sign in / sign up / sign out |
| `js/ui.js` | DOM builder, date helpers, toasts, modals |
| `js/app.js` | Boot, session guard, hash router, theme |
| `js/views/*.js` | One file per tab, each exporting `render(container)` and `destroy()` |
| `supabase/schema.sql` | Tables, indexes and RLS policies |
| `sw.js` | Service worker — offline shell |

## Keeping the database awake

Supabase pauses free projects after 7 days of inactivity, and a paused project means logins
fail until you press **Restore** in the dashboard. `.github/workflows/keepalive.yml` pings the
database every day at 06:17 UTC so that never happens.

GitHub disables scheduled workflows in repos with no activity for 60 days, which would silently
stop the pings — so the same job commits a heartbeat file every ~25 days, which counts as
activity and resets that timer. The workflow fails loudly (and GitHub emails you) if the
database ever answers with anything other than `200`.

You can run it by hand any time from **Actions → Supabase keepalive → Run workflow**.

## Notes for later

- **Adding a tab**: create `js/views/thing.js` exporting `render` and `destroy`, add it to
  `ROUTES` in `js/app.js`, and add a link to the tab bar in `index.html`.
- **Changing the schema**: edit `supabase/schema.sql` and re-run it. It is written to be safe to
  run repeatedly.
- **After changing any file**, bump `CACHE` in `sw.js` — otherwise devices that already installed
  the app keep serving the old version from cache.
- Dates are stored as `YYYY-MM-DD` in local time. `js/ui.js` deliberately avoids
  `toISOString()`, which would shift the date across the UTC boundary.
