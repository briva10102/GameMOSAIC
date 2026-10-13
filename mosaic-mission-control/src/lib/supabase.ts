import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined;
export const supabaseConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_'));
export const supabase = supabaseConfigured ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
