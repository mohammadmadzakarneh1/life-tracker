// Sign in / sign up / sign out, plus the auth screen wiring.

import { supabase } from './db.js';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(handler) {
  supabase.auth.onAuthStateChange((_event, session) => handler(session));
}

export function signOut() {
  return supabase.auth.signOut();
}

/** Turns Supabase's terser messages into something a human can act on. */
function friendlyError(message) {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'That email already has an account — sign in instead.';
  if (m.includes('email not confirmed'))
    return 'Check your inbox and confirm your email first (or turn off email confirmation in Supabase).';
  if (m.includes('password')) return 'Password must be at least 6 characters.';
  if (m.includes('failed to fetch'))
    return 'Cannot reach the database. Check your Supabase URL in js/config.js.';
  return message;
}

/** Wires the sign in / create account card. Called once at boot. */
export function initAuthScreen() {
  const form = document.getElementById('auth-form');
  const errorBox = document.getElementById('auth-error');
  const submit = document.getElementById('auth-submit');
  const hint = document.getElementById('auth-hint');
  const tabs = [...document.querySelectorAll('[data-authtab]')];

  let mode = 'signin';

  function setMode(next) {
    mode = next;
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.authtab === next));
    submit.textContent = next === 'signin' ? 'Sign in' : 'Create account';
    form.password.setAttribute(
      'autocomplete',
      next === 'signin' ? 'current-password' : 'new-password'
    );
    hint.textContent =
      next === 'signin'
        ? 'New here? Create an account — it takes one tap and your data follows you everywhere.'
        : 'Use a real email you can access, in case you ever need to reset your password.';
    errorBox.hidden = true;
  }

  tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.authtab)));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || password.length < 6) {
      errorBox.textContent = 'Enter an email and a password of at least 6 characters.';
      errorBox.hidden = false;
      return;
    }

    submit.disabled = true;
    submit.textContent = mode === 'signin' ? 'Signing in…' : 'Creating…';
    errorBox.hidden = true;

    try {
      const { data, error } =
        mode === 'signin'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (error) throw error;

      // With email confirmation ON, sign-up returns a user but no session.
      if (mode === 'signup' && !data.session) {
        errorBox.textContent =
          'Account created. Check your email to confirm it, then sign in.';
        errorBox.hidden = false;
        setMode('signin');
      }
      // On success app.js picks it up through onAuthChange.
    } catch (err) {
      errorBox.textContent = friendlyError(err.message || String(err));
      errorBox.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
    }
  });

  setMode('signin');
}
