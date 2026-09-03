// Small shared helpers: DOM building, dates, formatting, toasts and modals.

/* ---------------- dates ----------------
 * Everything is stored as a plain YYYY-MM-DD string in the user's *local* calendar.
 * Using toISOString() here would be a bug: it converts to UTC first, so logging a
 * habit at 1am would land on the previous day for anyone east of Greenwich.
 */

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  return todayISO(date);
}

/** Inclusive list of ISO dates from `from` to `to`. */
export function dateRange(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function prettyDate(iso) {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/* ---------------- formatting ---------------- */

export function money(amount, currency = 'JOD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`;
  }
}

/* ---------------- DOM ---------------- */

/** el('div.card', { onclick }, 'text' | node | [children]) */
export function el(spec, props = {}, children = []) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }

  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function emptyState(icon, message, actionLabel, onAction) {
  return el('div.empty', {}, [
    el('span.empty-ico', { text: icon }),
    el('p', { text: message }),
    actionLabel && el('button.btn.btn-primary', { text: actionLabel, onclick: onAction }),
  ]);
}

export function loading() {
  return el('div.empty', {}, [el('div.spinner', { style: 'margin:0 auto' })]);
}

/* ---------------- toast ---------------- */

export function toast(message, kind = 'ok') {
  const node = el(`div.toast${kind === 'bad' ? '.is-bad' : ''}`, { text: message });
  document.getElementById('toasts').append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 250);
  }, 2400);
}

/* ---------------- modal ----------------
 * openModal({ title, body, submitLabel, onSubmit }) -> closes on submit success,
 * on backdrop click, and on Escape. onSubmit receives a plain object of field values.
 */

export function openModal({ title, body, submitLabel = 'Save', onSubmit, extraAction }) {
  const root = document.getElementById('modal-root');

  const form = el('form', {}, [
    body,
    el('div.modal-actions', {}, [
      el('button.btn', { type: 'button', text: 'Cancel', onclick: close }),
      el('button.btn.btn-primary', { type: 'submit', text: submitLabel }),
    ]),
    extraAction,
  ]);

  const modal = el('div.modal', {}, [el('h2', { text: title }), form]);
  const backdrop = el('div.modal-backdrop', {
    onclick: (e) => { if (e.target === backdrop) close(); },
  }, modal);

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      await onSubmit(values, close);
      close();
    } catch (err) {
      toast(err.message || 'Something went wrong', 'bad');
      btn.disabled = false;
    }
  });

  document.addEventListener('keydown', onKey);
  root.append(backdrop);
  setTimeout(() => form.querySelector('input, select, textarea')?.focus(), 60);
  return { close };
}

export function confirmDelete(what, onYes) {
  return openModal({
    title: `Delete ${what}?`,
    body: el('p.muted', { text: 'This cannot be undone.', style: 'margin:0' }),
    submitLabel: 'Delete',
    onSubmit: onYes,
  });
}

/**
 * Lets a detail view name itself in the top bar — the router only knows section
 * names, but "#/projects/<id>" should read as the project, not "Projects".
 */
export function setViewTitle(text) {
  const node = document.getElementById('view-title');
  if (!node) return;
  node.textContent = text;
  node.setAttribute('dir', 'auto');
}
