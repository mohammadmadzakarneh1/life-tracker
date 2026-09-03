// Navigation: one model, three renderings.
//
// The desktop sidebar, the mobile bottom bar and the mobile More sheet are all built
// from NAV below. Hand-writing them separately is how two menus drift apart, and both
// layouts are primary here — neither is an afterthought.

import { el, clear } from './ui.js';
import { t } from './strings.js';

/**
 * `bar: true` puts a section in the mobile bottom bar. Everything else lives behind
 * More. The bottom bar is Today · Tasks · Add · Calendar · More — the four things
 * touched daily, plus capture.
 */
export const NAV = [
  { id: 'today', icon: '◎', bar: true },
  { id: 'tasks', icon: '☑', bar: true },
  { id: 'university', icon: '✦' },
  { id: 'projects', icon: '◆' },
  { id: 'habits', icon: '✓' },
  { id: 'calendar', icon: '▦', bar: true },
  { id: 'money', icon: '◈' },
  { id: 'progress', icon: '◔' },
];

const SETTINGS = { id: 'settings', icon: '⚙' };

function link(item, className) {
  return el(`a.${className}`, {
    href: `#/${item.id}`,
    dataset: { nav: item.id },
  }, [
    el('span.ico', { text: item.icon, 'aria-hidden': 'true' }),
    el('span', { text: t.nav[item.id] }),
  ]);
}

/**
 * Quick Add. app.js supplies the handler so the sheet can refresh whichever view is
 * currently mounted after something is captured — nav.js does not know about routing.
 */
let onRequestAdd = () => {};

export function setQuickAddHandler(fn) {
  onRequestAdd = fn;
}

function addButton(className) {
  return el(`button.${className}`, {
    type: 'button',
    'aria-label': t.nav.add,
    onclick: () => onRequestAdd(),
  }, [
    el('span.ico', { text: '＋', 'aria-hidden': 'true' }),
    el('span', { text: t.nav.add }),
  ]);
}

export function renderSidebar(root) {
  clear(root).append(
    el('div.sidebar-brand', { text: t.app }),
    addButton('sidebar-add'),
    el('nav.sidebar-nav', { 'aria-label': t.app }, NAV.map((i) => link(i, 'sidebar-item'))),
    el('div.sidebar-foot', {}, [link(SETTINGS, 'sidebar-item')])
  );
}

export function renderTabbar(root) {
  const items = NAV.filter((i) => i.bar);

  clear(root).append(
    link(items[0], 'tabbar-item'),
    link(items[1], 'tabbar-item'),
    addButton('tabbar-item tabbar-add'),
    link(items[2], 'tabbar-item'),
    el('button.tabbar-item', {
      type: 'button',
      dataset: { nav: 'more' },
      onclick: openMore,
    }, [
      el('span.ico', { text: '☰', 'aria-hidden': 'true' }),
      el('span', { text: t.nav.more }),
    ])
  );
}

/* ---------------- More sheet ---------------- */

let sheet = null;

function openMore() {
  if (sheet) return;

  const items = NAV.filter((i) => !i.bar).concat(SETTINGS);

  const panel = el('div.sheet', {}, [
    el('div.sheet-handle', { 'aria-hidden': 'true' }),
    el('nav.sheet-nav', { 'aria-label': t.nav.more }, items.map((i) => {
      const a = link(i, 'sheet-item');
      a.addEventListener('click', closeMore);
      return a;
    })),
  ]);

  const backdrop = el('div.sheet-backdrop', {
    onclick: (e) => { if (e.target === backdrop) closeMore(); },
  }, panel);

  sheet = backdrop;
  document.addEventListener('keydown', onKey);
  document.getElementById('modal-root').append(backdrop);
}

function closeMore() {
  if (!sheet) return;
  sheet.remove();
  sheet = null;
  document.removeEventListener('keydown', onKey);
}

function onKey(e) {
  if (e.key === 'Escape') closeMore();
}

/* ---------------- active state ---------------- */

/**
 * Marks the current section everywhere it appears. `more` lights up when the active
 * route is one of the sections that lives behind it, so the bottom bar never looks
 * like nothing is selected.
 */
export function setActive(routeId) {
  const behindMore = NAV.some((i) => i.id === routeId && !i.bar) || routeId === 'settings';

  document.querySelectorAll('[data-nav]').forEach((node) => {
    const id = node.dataset.nav;
    node.classList.toggle('is-active', id === routeId || (id === 'more' && behindMore));
  });
}

export { closeMore };
