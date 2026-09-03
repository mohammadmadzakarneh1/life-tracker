// Boot, session guard, hash router, navigation and theme.

import { isConfigured } from './config.js';
import { getSession, onAuthChange, initAuthScreen, signOut } from './auth.js';
import { clear, el, toast } from './ui.js';
import { t } from './strings.js';
import { NAV, renderSidebar, renderTabbar, setActive, closeMore, setQuickAddHandler } from './nav.js';
import { openQuickAdd } from './quickadd.js';

const ROUTES = {
  today: { load: () => import('./views/today.js') },
  tasks: { load: () => import('./views/tasks.js') },
  university: { load: () => import('./views/university.js') },
  // Params pick the detail view: #/projects is the list, #/projects/<id> is one project.
  projects: { load: (params) => (params.length ? import('./views/project.js') : import('./views/projects.js')) },
  habits: { load: () => import('./views/habits.js') },
  calendar: { load: () => import('./views/calendar.js') },
  money: { load: () => import('./views/money.js') },
  progress: { load: () => import('./views/progress.js') },
  settings: { load: () => import('./views/settings.js') },
};

const DEFAULT_ROUTE = 'today';

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

/**
 * `#/university/abc123` -> { name: 'university', params: ['abc123'] }
 * Unknown routes fall back to Today rather than erroring.
 */
function parseHash() {
  const segments = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = ROUTES[segments[0]] ? segments[0] : DEFAULT_ROUTE;
  return { name, params: segments.slice(1) };
}

async function renderRoute() {
  if (!signedIn) return;

  const { name, params } = parseHash();

  setActive(name);
  titleEl.textContent = t.nav[name];
  document.title = `${t.nav[name]} · ${t.app}`;

  currentView?.destroy?.();
  currentView = null;
  clear(viewEl);
  viewEl.append(el('div.empty', {}, [el('div.spinner', { style: 'margin:0 auto' })]));

  try {
    const mod = await ROUTES[name].load(params);
    clear(viewEl);
    currentView = mod;
    // Views take params only if they use them; extra arguments are harmless.
    await mod.render(viewEl, params);
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

/* ---------------- quick add ---------------- */

/**
 * Re-renders the current view after a capture, so something added from the Calendar
 * shows up there immediately rather than after a manual reload.
 */
function quickAdd() {
  closeMore();
  openQuickAdd(() => renderRoute());
}

/* ---------------- keyboard ---------------- */

/**
 * Desktop shortcuts. Digits jump to a section — cheap, and the reason a laptop user
 * prefers an app to a website. Ignored while typing.
 */
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!signedIn) return;

    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.activeElement?.isContentEditable) return;

    const n = Number(e.key);
    if (n >= 1 && n <= NAV.length) {
      closeMore();
      location.hash = `#/${NAV[n - 1].id}`;
      return;
    }

    if (e.key === 'n') {
      e.preventDefault();
      quickAdd();
    }
  });
}

/* ---------------- session ---------------- */

function showAuth() {
  signedIn = false;
  currentView?.destroy?.();
  currentView = null;
  closeMore();
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
  // Must run before anything else touches caches or the worker.
  if (await maybeHardReset()) return;

  initTheme();

  if (!isConfigured) {
    boot.hidden = true;
    showConfigHelp();
    return;
  }

  setQuickAddHandler(quickAdd);
  renderSidebar(document.getElementById('sidebar'));
  renderTabbar(document.getElementById('tabbar'));
  initAuthScreen();
  initKeyboard();

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

  initServiceWorker();
}

/**
 * Registers the service worker and makes updates self-applying.
 *
 * Without the controllerchange reload, a device that already had the app installed
 * keeps running the previously cached code for one more visit after every deploy —
 * which looked exactly like "my changes aren't appearing".
 */
function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => reg.update())
    .catch(() => { /* offline support is optional; never block the app on it */ });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return; // one reload only, or this loops forever
    reloaded = true;
    location.reload();
  });
}

/**
 * Escape hatch for a device stuck on an old cached build: open the app with
 * ?reset=1 to unregister every worker, delete every cache, and reload clean.
 * Runs before anything else so it works even if the cached app code is broken.
 */
async function maybeHardReset() {
  if (!new URLSearchParams(location.search).has('reset')) return false;

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* nothing useful to do if the storage APIs refuse */ }

  // Drop the query string so a refresh does not reset again.
  location.replace(location.pathname + location.hash);
  return true;
}

main().catch((err) => {
  boot.hidden = true;
  showAuth();
  toast(err.message || 'Failed to start', 'bad');
});
