import { createClient } from '@supabase/supabase-js';

// Access environment variables via import.meta.env for Vite
// Casting to any to handle missing Vite type definitions
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

// Debug log to help verify connection in browser console
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('EngTrack: Supabase keys missing. App is running in Demo/Mock mode.');
} else {
  console.log('EngTrack: Supabase Connection Configured.');
}

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export const isSupabaseConfigured = () => {
  return !!supabase;
};