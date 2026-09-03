// One project: its work, its progress, its deadline.
//
// The task list here is the same `tasks` table the rest of the app uses, filtered by
// project_id. Adding a task from this page presets the link, which is the only thing
// that makes it a "project task".

import { projects, tasks } from '../db.js';
import { projectForm, STATUSES, progressOf } from './projects.js';
import { taskForm } from './tasks.js';
import { rank, bucketOf, PRIORITY } from '../rank.js';
import {
  el, clear, toast, loading, setViewTitle,
  todayISO, prettyDate,
} from '../ui.js';

const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

let container = null;
let projectId = null;
let project = null;
let list = [];
let showDone = false;

export async function render(root, params = []) {
  container = root;
  projectId = params[0] ?? null;
  await load();
}

export function destroy() {
  container = null;
  showDone = false;
}

async function load() {
  if (!container) return;
  clear(container).append(loading());

  try {
    [project, list] = await Promise.all([
      projects.get(projectId),
      tasks.byLink({ project_id: projectId }),
    ]);

    if (!container) return;

    if (!project) {
      clear(container).append(
        el('div.card', {}, [
          el('h2', { text: 'Project not found' }),
          el('p.muted', {
            text: 'It may have been deleted.',
            style: 'margin:8px 0 14px;font-size:13.5px',
          }),
          el('a.btn', { href: '#/projects', text: 'Back to projects' }),
        ])
      );
      return;
    }

    setViewTitle(project.name);
    draw();
  } catch (err) {
    if (!container) return;
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load this project' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
        el('button.btn', { text: 'Retry', style: 'margin-top:12px', onclick: load }),
      ])
    );
  }
}

function draw() {
  clear(container);

  const today = todayISO();
  const open = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);
  const pct = progressOf({ total: list.length, done: done.length });
  const late = project.deadline && project.deadline < today && project.status !== 'completed';

  container.append(
    el('div.card', {}, [
      el('div.card-head', { style: 'margin-bottom:10px' }, [
        el('div', {}, [
          el('h2', { text: project.name, dir: 'auto' }),
          el('div.row-sub', {}, [
            el('span.pill', { text: STATUS_LABEL[project.status] ?? project.status }),
            project.deadline && el('span', {
              text: ` ${late ? 'Overdue · ' : ''}${prettyDate(project.deadline)}`,
              style: late ? 'color:var(--bad);font-weight:600' : '',
            }),
          ]),
        ]),
        el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => projectForm(project, load) }),
      ]),

      project.description &&
        el('p.muted', {
          text: project.description,
          dir: 'auto',
          style: 'margin:0 0 12px;font-size:13.5px;white-space:pre-wrap',
        }),

      pct !== null && el('div', {}, [
        el('div.today-progress-head', {}, [
          el('span.stat-label', { text: `${done.length} of ${list.length} done` }),
          el('span.today-pct', { text: `${pct}%` }),
        ]),
        el('div.bar', {}, [el('div.bar-fill', { style: `width:${pct}%` })]),
      ]),
    ])
  );

  if (open.length) {
    container.append(
      el('div.section-title', { text: 'Work' }),
      el('div.card', {}, rank(open, today).map((t) => taskRow(t, today)))
    );
  } else if (list.length) {
    container.append(
      el('div.card', {}, [el('p', { text: '✓ Everything done here.', style: 'margin:0' })])
    );
  } else {
    container.append(
      el('div.card', {}, [
        el('p.muted', {
          text: 'No tasks yet. Add the first thing this project needs.',
          style: 'margin:0 0 12px;font-size:13.5px',
        }),
      ])
    );
  }

  if (done.length) {
    container.append(
      el('div.section-title', {}, [
        el('button.btn.btn-sm', {
          text: `${showDone ? 'Hide' : 'Show'} completed (${done.length})`,
          onclick: () => { showDone = !showDone; draw(); },
        }),
      ])
    );
    if (showDone) {
      container.append(el('div.card', {}, done.map((t) => taskRow(t, today))));
    }
  }

  container.append(
    el('button.btn.btn-primary.btn-block', {
      text: '+ Add task to this project',
      // The preset link is what makes the new row project work; db.categoryFor()
      // derives category from it so the two can never disagree.
      onclick: () => taskForm(null, { project_id: project.id }, load),
    }),
    el('a.btn.btn-block', { href: '#/projects', text: 'All projects', style: 'margin-top:8px' })
  );
}

function taskRow(t, today) {
  const late = !t.done && t.due_date && t.due_date < today;

  const check = el(`button.check${t.done ? '.is-done' : ''}`, {
    type: 'button',
    text: '✓',
    'aria-label': `Mark ${t.title}`,
    onclick: async () => {
      const next = !t.done;
      check.classList.toggle('is-done', next);
      try {
        await tasks.setDone(t.id, next);
        await load();
      } catch (err) {
        check.classList.toggle('is-done', !next);
        toast(err.message, 'bad');
      }
    },
  });

  const meta = [];
  if (t.priority === PRIORITY.HIGH) meta.push('High');
  if (t.due_date) {
    meta.push(late ? `Overdue · ${prettyDate(t.due_date)}` : prettyDate(t.due_date));
  } else if (!t.done) {
    meta.push('No deadline');
  }
  if (t.estimate_min) {
    meta.push(t.estimate_min < 60 ? `${t.estimate_min}m` : `${Math.round(t.estimate_min / 60)}h`);
  }

  return el(`div.row${late ? '.is-overdue' : ''}`, {}, [
    check,
    el('div.row-main', {}, [
      el('div.row-title', {
        text: t.title,
        dir: 'auto',
        style: t.done ? 'text-decoration:line-through;color:var(--text-dim)' : '',
      }),
      meta.length && el('div.row-sub', {
        text: meta.join(' · '),
        style: late ? 'color:var(--bad)' : '',
      }),
    ]),
    el('div.row-actions', {}, [
      el('button.icon-btn', {
        text: '⋯',
        title: 'Edit',
        onclick: () => taskForm(t, {}, load),
      }),
    ]),
  ]);
}
