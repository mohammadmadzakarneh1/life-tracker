// Supabase connection details.
//
// These two values are safe to commit to a public repo. The anon key is a *public*
// identifier — it only says "I am an anonymous visitor of this project". What actually
// protects your data is Row Level Security, enabled on every table in supabase/schema.sql,
// which restricts every row to the user who owns it.
//
// Never put the `service_role` key here. That one bypasses RLS and must stay secret.
//
// Find both values in your Supabase dashboard: Settings -> API.
export const SUPABASE_URL = 'PASTE_YOUR_PROJECT_URL_HERE';
export const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_PUBLIC_KEY_HERE';

export const isConfigured =
  SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 40;
