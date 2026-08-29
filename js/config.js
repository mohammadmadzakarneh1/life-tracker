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
export const SUPABASE_URL = 'https://ntxdywfdhslioagtykvo.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50eGR5d2ZkaHNsaW9hZ3R5a3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDIyNDIsImV4cCI6MjEwMzU3ODI0Mn0.aqWPVKpgVEHb3TklJGgvmrsl_pvvsZMz4Dp1Bb9U4pM';

export const isConfigured =
  SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 40;
