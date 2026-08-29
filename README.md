# Life Tracker

A personal tracker for habits, mood, workouts and money. Plain HTML/CSS/JS — no build step,
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

## Project layout

| Path | Role |
|---|---|
| `index.html` | App shell: auth screen, tab bar, view container |
| `css/styles.css` | All styling; light and dark themes via CSS custom properties |
| `js/config.js` | Supabase URL and anon key |
| `js/db.js` | Every database call in the app; views never touch Supabase directly |
| `js/auth.js` | Sign in / sign up / sign out |
| `js/ui.js` | DOM builder, date helpers, toasts, modals |
| `js/app.js` | Boot, session guard, hash router, theme |
| `js/views/*.js` | One file per tab, each exporting `render(container)` and `destroy()` |
| `supabase/schema.sql` | Tables, indexes and RLS policies |
| `sw.js` | Service worker — offline shell |

## Notes for later

- **Adding a tab**: create `js/views/thing.js` exporting `render` and `destroy`, add it to
  `ROUTES` in `js/app.js`, and add a link to the tab bar in `index.html`.
- **Changing the schema**: edit `supabase/schema.sql` and re-run it. It is written to be safe to
  run repeatedly.
- **After changing any file**, bump `CACHE` in `sw.js` — otherwise devices that already installed
  the app keep serving the old version from cache.
- Dates are stored as `YYYY-MM-DD` in local time. `js/ui.js` deliberately avoids
  `toISOString()`, which would shift the date across the UTC boundary.
