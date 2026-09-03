// Every piece of interface text lives here, never inline in a view.
//
// The app is English now. Keeping strings in one module means an Arabic interface
// later is a second object rather than an audit of nine view files. Paired with CSS
// logical properties, that makes a future RTL flip cheap.
//
// User content — course names, task titles, notes — is not translated and is rendered
// with dir="auto" so mixed Arabic/Latin/digits lay out correctly.

export const t = {
  app: 'Life Tracker',

  nav: {
    today: 'Today',
    tasks: 'Tasks',
    university: 'University',
    projects: 'Projects',
    habits: 'Habits',
    calendar: 'Calendar',
    money: 'Money',
    progress: 'Progress',
    settings: 'Settings',
    more: 'More',
    add: 'Add',
    closeMenu: 'Close menu',
    signOut: 'Sign out',
    toggleTheme: 'Toggle theme',
  },

  common: {
    cancel: 'Cancel',
    save: 'Save',
    add: 'Add',
    edit: 'Edit',
    delete: 'Delete',
    retry: 'Retry',
    today: 'Today',
    yesterday: 'Yesterday',
    loading: 'Loading',
    somethingWrong: 'Something went wrong',
    cannotUndo: 'This cannot be undone.',
  },

  soon: {
    // Shown by the placeholder views until their phase lands. Keeping the phase
    // number visible means a half-built app never looks like a broken one.
    heading: (name) => `${name} is not built yet`,
    phase: (n) => `Arriving in phase ${n}.`,
    quickAdd: 'Quick Add arrives in the next phase.',
  },
};
