// Boot, session guard, hash router and chrome wiring.

import { isConfigured } from './config.js';
import { getSession, onAuthChange, initAuthScreen, signOut } from './auth.js';
import { clear, el, toast } from './ui.js';

const ROUTES = {
  dashboard: { title: 'Today', load: () => import('./views/dashboard.js') },
  tasks: { title: 'Tasks', load: () => import('./views/tasks.js') },
  calendar: { title: 'Calendar', load: () => import('./views/calendar.js') },
  habits: { title: 'Habits', load: () => import('./views/habits.js') },
  mood: { title: 'Mood', load: () => import('./views/mood.js') },
  workouts: { title: 'Fitness', load: () => import('./views/workouts.js') },
  expenses: { title: 'Money', load: () => import('./views/expenses.js') },
};

const boot = document.getElementById('boot');
const authScreen = document.getElementById('auth-screen');
const app = document.getElementById('app');
const viewEl = document.getElementById('view');
const titleEl = document.getElementById('view-title');

let currentView = null;
let signedIn = false;

/* ---------------- theme ---------------- */

function initTheme() {
  const saved = safeGet('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? 'dark' : 'light');

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    safeSet('theme', next);
  });
}

// localStorage throws in some privacy modes — a theme preference is not worth a crash.
function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}

/* ---------------- router ---------------- */

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  return ROUTES[name] ? name : 'dashboard';
}

async function renderRoute() {
  if (!signedIn) return;

  const name = currentRoute();
  const route = ROUTES[name];

  document.querySelectorAll('[data-nav]').forEach((a) =>
    a.classList.toggle('is-active', a.dataset.nav === name)
  );
  titleEl.textContent = route.title;

  currentView?.destroy?.();
  currentView = null;
  clear(viewEl);
  viewEl.append(el('div.empty', {}, [el('div.spinner', { style: 'margin:0 auto' })]));

  try {
    const mod = await route.load();
    clear(viewEl);
    currentView = mod;
    await mod.render(viewEl);
  } catch (err) {
    clear(viewEl);
    viewEl.append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load this page' }),
        el('p.muted', { text: err.message || String(err), style: 'margin:8px 0 0' }),
      ])
    );
  }
}

/* ---------------- session ---------------- */

function showAuth() {
  signedIn = false;
  currentView?.destroy?.();
  currentView = null;
  clear(viewEl);
  app.hidden = true;
  authScreen.hidden = false;
}

function showApp() {
  const wasSignedOut = !signedIn;
  signedIn = true;
  authScreen.hidden = true;
  app.hidden = false;
  if (wasSignedOut) renderRoute();
}

/* ---------------- config guard ---------------- */

function showConfigHelp() {
  authScreen.hidden = false;
  document.querySelector('.auth-card').replaceChildren(
    el('div.auth-brand', {}, [
      el('span.auth-logo', { text: '◈' }),
      el('h1', { text: 'Almost there' }),
    ]),
    el('p.muted', {
      style: 'font-size:13.5px;line-height:1.6',
      html:
        'Add your Supabase keys to <code>js/config.js</code> to finish setup:<br><br>' +
        '1. Create a free project at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a><br>' +
        '2. Open <b>Settings → API</b><br>' +
        '3. Copy the <b>Project URL</b> and the <b>anon public</b> key into <code>js/config.js</code><br>' +
        '4. Run <code>supabase/schema.sql</code> in the SQL editor<br>' +
        '5. Reload this page',
    })
  );
}

/* ---------------- boot ---------------- */

async function main() {
  initTheme();

  if (!isConfigured) {
    boot.hidden = true;
    showConfigHelp();
    return;
  }

  initAuthScreen();

  document.getElementById('sign-out').addEventListener('click', async () => {
    await signOut();
    toast('Signed out');
  });

  window.addEventListener('hashchange', renderRoute);

  // React to sign-in, sign-out and token refreshes from any tab.
  onAuthChange((session) => (session ? showApp() : showAuth()));

  const session = await getSession();
  session ? showApp() : showAuth();
  boot.hidden = true;

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

main().catch((err) => {
  boot.hidden = true;
  showAuth();
  toast(err.message || 'Failed to start', 'bad');
});
