// Placeholder until phase 4. Exists so the navigation has no dead ends:
// a section that is not built yet should say so, not look broken.

import { el, clear } from '../ui.js';
import { t } from '../strings.js';

export function render(root) {
  clear(root).append(
    el('div.card', {}, [
      el('h2', { text: t.soon.heading('University') }),
      el('p.muted', { text: t.soon.phase(4), style: 'margin:8px 0 0;font-size:13.5px' }),
    ])
  );
}

export function destroy() {}
