// Workout log: one workout per session, with optional exercise sets nested under it.

import { workouts } from '../db.js';
import {
  el, clear, toast, openModal, confirmDelete, emptyState, loading,
  todayISO, prettyDate, addDays,
} from '../ui.js';

const TYPES = ['Gym', 'Run', 'Walk', 'Cycling', 'Swim', 'Football', 'Yoga', 'Home', 'Other'];

let container = null;
let list = [];

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

async function load() {
  clear(container).append(loading());
  try {
    list = await workouts.recent(40);
    draw();
  } catch (err) {
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load workouts' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
      ])
    );
  }
}

function draw() {
  clear(container);

  const from = addDays(todayISO(), -6);
  const thisWeek = list.filter((w) => w.date >= from);
  const minutes = thisWeek.reduce((t, w) => t + (w.duration_min ?? 0), 0);

  container.append(
    el('div.stat-grid', {}, [
      el('div.stat', {}, [
        el('div.stat-label', { text: 'This week' }),
        el('div.stat-value', { text: String(thisWeek.length) }),
        el('div.stat-sub', { text: thisWeek.length === 1 ? 'session' : 'sessions' }),
      ]),
      el('div.stat', {}, [
        el('div.stat-label', { text: 'Minutes' }),
        el('div.stat-value', { text: String(minutes) }),
        el('div.stat-sub', { text: 'last 7 days' }),
      ]),
    ])
  );

  if (!list.length) {
    container.append(
      emptyState('⚡', 'No workouts logged yet.', 'Log a workout', () => workoutForm())
    );
  } else {
    container.append(
      el('div.section-title', { text: 'Recent' }),
      ...list.map(workoutCard)
    );
  }

  container.append(
    el('button.btn.btn-primary.btn-block', {
      text: '+ Log workout',
      onclick: () => workoutForm(),
    })
  );
}

function workoutCard(w) {
  const sets = w.workout_sets ?? [];

  return el('div.card', {}, [
    el('div.card-head', { style: sets.length ? '' : 'margin-bottom:0' }, [
      el('div', {}, [
        el('h2', { text: w.type }),
        el('div.row-sub', {
          text: [prettyDate(w.date), w.duration_min ? `${w.duration_min} min` : null]
            .filter(Boolean)
            .join(' · '),
        }),
      ]),
      el('div.row-actions', {}, [
        el('button.icon-btn', { text: '+', title: 'Add exercise', onclick: () => setForm(w) }),
        el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => workoutForm(w) }),
      ]),
    ]),

    sets.length &&
      el('div', {}, sets.map((s) =>
        el('div.row', {}, [
          el('div.row-main', {}, [
            el('div.row-title', { text: s.exercise }),
            el('div.row-sub', { text: setSummary(s) }),
          ]),
          el('button.icon-btn', {
            text: '×',
            title: 'Remove exercise',
            onclick: async () => {
              try {
                await workouts.removeSet(s.id);
                await load();
              } catch (err) {
                toast(err.message, 'bad');
              }
            },
          }),
        ])
      )),

    w.notes && el('p.muted', { text: w.notes, style: 'margin:10px 0 0;font-size:13px' }),
  ]);
}

function setSummary(s) {
  const parts = [];
  if (s.sets && s.reps) parts.push(`${s.sets} × ${s.reps}`);
  else if (s.reps) parts.push(`${s.reps} reps`);
  if (s.weight_kg) parts.push(`${s.weight_kg} kg`);
  return parts.join(' · ') || '—';
}

function workoutForm(existing = null) {
  const typeSel = el(
    'select',
    { name: 'type' },
    TYPES.map((t) =>
      el('option', { value: t, text: t, selected: (existing?.type ?? 'Gym') === t })
    )
  );

  const notes = el('textarea', { name: 'notes', maxlength: '1000', placeholder: 'Optional' });
  notes.value = existing?.notes ?? '';

  const body = el('div', {}, [
    el('label.field', {}, [el('span', { text: 'Type' }), typeSel]),
    el('div.field-row', {}, [
      el('label.field', {}, [
        el('span', { text: 'Date' }),
        el('input', { name: 'date', type: 'date', required: true, value: existing?.date ?? todayISO() }),
      ]),
      el('label.field', {}, [
        el('span', { text: 'Minutes' }),
        el('input', {
          name: 'duration_min',
          type: 'number',
          min: '0',
          max: '1440',
          inputmode: 'numeric',
          placeholder: '45',
          value: existing?.duration_min ?? '',
        }),
      ]),
    ]),
    el('label.field', {}, [el('span', { text: 'Notes' }), notes]),
  ]);

  openModal({
    title: existing ? 'Edit workout' : 'Log workout',
    body,
    extraAction:
      existing &&
      el('button.btn.btn-danger.btn-block', {
        type: 'button',
        text: 'Delete workout',
        style: 'margin-top:9px',
        onclick: (e) => {
          e.currentTarget.closest('.modal-backdrop').remove();
          confirmDelete('this workout', async () => {
            await workouts.remove(existing.id);
            toast('Workout deleted');
            await load();
          });
        },
      }),
    onSubmit: async (v) => {
      const payload = {
        date: v.date,
        type: v.type,
        duration_min: v.duration_min ? Number(v.duration_min) : null,
        notes: v.notes.trim() || null,
      };
      if (existing) await workouts.update(existing.id, payload);
      else await workouts.create(payload);
      toast(existing ? 'Workout updated' : 'Workout logged');
      await load();
    },
  });
}

function setForm(workout) {
  const body = el('div', {}, [
    el('label.field', {}, [
      el('span', { text: 'Exercise' }),
      el('input', { name: 'exercise', required: true, maxlength: '80', placeholder: 'Bench press' }),
    ]),
    el('div.field-row', {}, [
      el('label.field', {}, [
        el('span', { text: 'Sets' }),
        el('input', { name: 'sets', type: 'number', min: '0', inputmode: 'numeric', placeholder: '3' }),
      ]),
      el('label.field', {}, [
        el('span', { text: 'Reps' }),
        el('input', { name: 'reps', type: 'number', min: '0', inputmode: 'numeric', placeholder: '10' }),
      ]),
      el('label.field', {}, [
        el('span', { text: 'kg' }),
        el('input', { name: 'weight_kg', type: 'number', min: '0', step: '0.5', inputmode: 'decimal', placeholder: '60' }),
      ]),
    ]),
  ]);

  openModal({
    title: `Add exercise · ${workout.type}`,
    body,
    submitLabel: 'Add',
    onSubmit: async (v) => {
      const exercise = v.exercise.trim();
      if (!exercise) throw new Error('Name the exercise');
      await workouts.addSet(workout.id, {
        exercise,
        sets: v.sets ? Number(v.sets) : null,
        reps: v.reps ? Number(v.reps) : null,
        weight_kg: v.weight_kg ? Number(v.weight_kg) : null,
      });
      toast('Exercise added');
      await load();
    },
  });
}
