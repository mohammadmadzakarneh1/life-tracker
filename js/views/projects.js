// Project list, grouped by status.
//
// A project owns no tasks of its own — its work is ordinary `tasks` rows with
// project_id set, which is why a project task due today shows up on Today for free.

import { projects } from '../db.js';
import {
  el, clear, toast, openModal, emptyState, loading,
  todayISO, prettyDate,
} from '../ui.js';

export const STATUSES = [
  { id: 'active', label: 'Active' },
  { id: 'planning', label: 'Planning' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
];

let container = null;
let list = [];
let counts = new Map();

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

async function load() {
  if (!container) return;
  clear(container).append(loading());
  try {
    [list, counts] = await Promise.all([projects.list(), projects.taskCounts()]);
    if (!container) return;
    draw();
  } catch (err) {
    if (!container) return;
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load projects' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
        el('button.btn', { text: 'Retry', style: 'margin-top:12px', onclick: load }),
      ])
    );
  }
}

/** Completed / total, computed rather than stored — a stored figure would drift. */
export function progressOf(count) {
  if (!count || !count.total) return null;
  return Math.round((count.done / count.total) * 100);
}

function draw() {
  clear(container);

  if (!list.length) {
    container.append(
      emptyState('◆', 'No projects yet. Add one and give it some tasks.', 'Add a project', () =>
        projectForm()
      )
    );
    return;
  }

  for (const status of STATUSES) {
    const group = list.filter((p) => p.status === status.id);
    if (!group.length) continue;
    container.append(
      el('div.section-title', { text: status.label }),
      el('div.card', {}, group.map(projectRow))
    );
  }

  container.append(
    el('button.btn.btn-primary.btn-block', { text: '+ Add project', onclick: () => projectForm() })
  );
}

function projectRow(p) {
  const count = counts.get(p.id);
  const pct = progressOf(count);
  const today = todayISO();
  const late = p.deadline && p.deadline < today && p.status !== 'completed';

  const meta = [count ? `${count.done}/${count.total} tasks` : 'No tasks yet'];
  if (p.deadline) meta.push(late ? `Overdue · ${prettyDate(p.deadline)}` : prettyDate(p.deadline));

  return el('a.row.row-link', { href: `#/projects/${p.id}` }, [
    el('div.row-main', {}, [
      el('div.row-title', { text: p.name, dir: 'auto' }),
      el('div.row-sub', { text: meta.join(' · '), style: late ? 'color:var(--bad)' : '' }),
      pct !== null && el('div.bar', { style: 'margin-top:8px' }, [
        el('div.bar-fill', { style: `width:${pct}%` }),
      ]),
    ]),
    pct !== null && el('span.proj-pct', { text: `${pct}%` }),
    el('span.row-chevron', { text: '›', 'aria-hidden': 'true' }),
  ]);
}

/**
 * `onSaved` lets Quick Add and the detail page reuse this without running the list
 * view's reload against a container it no longer owns.
 */
export function projectForm(existing = null, onSaved = null) {
  const done = onSaved ?? load;

  const description = el('textarea', {
    name: 'description',
    maxlength: '2000',
    dir: 'auto',
    placeholder: 'Optional',
  });
  description.value = existing?.description ?? '';

  const body = el('div', {}, [
    el('label.field', {}, [
      el('span', { text: 'Project' }),
      el('input', {
        name: 'name',
        required: true,
        maxlength: '120',
        dir: 'auto',
        placeholder: 'AI Tutor',
        value: existing?.name ?? '',
      }),
    ]),
    el('div.field-row', {}, [
      el('label.field', {}, [
        el('span', { text: 'Status' }),
        el('select', { name: 'status' }, STATUSES.map((s) =>
          el('option', {
            value: s.id,
            text: s.label,
            selected: (existing?.status ?? 'active') === s.id,
          })
        )),
      ]),
      el('label.field', {}, [
        el('span', { text: 'Deadline' }),
        el('input', { name: 'deadline', type: 'date', value: existing?.deadline ?? '' }),
      ]),
    ]),
    el('label.field', {}, [el('span', { text: 'Description' }), description]),
  ]);

  openModal({
    title: existing ? 'Edit project' : 'New project',
    body,
    submitLabel: existing ? 'Save' : 'Add project',
    extraAction:
      existing &&
      el('div', { style: 'margin-top:9px;display:flex;gap:8px' }, [
        el('button.btn', {
          type: 'button',
          text: existing.archived ? 'Unarchive' : 'Archive',
          style: 'flex:1',
          onclick: async (e) => {
            e.currentTarget.closest('.modal-backdrop').remove();
            try {
              await projects.update(existing.id, { archived: !existing.archived });
              toast(existing.archived ? 'Unarchived' : 'Archived');
              await done();
            } catch (err) {
              toast(err.message, 'bad');
            }
          },
        }),
        el('button.btn.btn-danger', {
          type: 'button',
          text: 'Delete',
          style: 'flex:1',
          onclick: (e) => {
            e.currentTarget.closest('.modal-backdrop').remove();
            // Deleting cascades to the project's tasks, so say so plainly.
            openModal({
              title: 'Delete this project?',
              body: el('p.muted', {
                style: 'margin:0',
                text: 'Its tasks are deleted with it and cannot be recovered. Archive it instead if you only want it out of the way.',
              }),
              submitLabel: 'Delete project and tasks',
              onSubmit: async () => {
                await projects.remove(existing.id);
                toast('Project deleted');
                if (location.hash.startsWith('#/projects/')) location.hash = '#/projects';
                else await done();
              },
            });
          },
        }),
      ]),
    onSubmit: async (v) => {
      const name = v.name.trim();
      if (!name) throw new Error('Give the project a name');

      const payload = {
        name,
        status: v.status,
        deadline: v.deadline || null,
        description: description.value.trim() || null,
      };

      if (existing) await projects.update(existing.id, payload);
      else await projects.create(payload);

      toast(existing ? 'Project updated' : 'Project added');
      await done();
    },
  });
}
