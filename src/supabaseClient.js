import { createClient } from "@supabase/supabase-js";

// Points at the existing FoodIQ Supabase project (qkpvjqnejkkhpzwokyny).
// Set these in Vercel env vars and a local .env file (never commit the .env).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev rather than silently hitting undefined endpoints.
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env file."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
