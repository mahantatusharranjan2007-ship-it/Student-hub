import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let activeSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
let activeSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export function isValidHttpUrl(value: string): boolean {
  if (!value || value.includes('your-project-ref') || value.startsWith('MY_') || value.startsWith('SET_')) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidAnonKey(value: string): boolean {
  return Boolean(
    value &&
      !value.includes('your-supabase-anon-key') &&
      !value.startsWith('MY_') &&
      !value.startsWith('SET_') &&
      value.length >= 20
  );
}

export function isRuntimeSupabaseConfigured(): boolean {
  return isValidHttpUrl(activeSupabaseUrl) && isValidAnonKey(activeSupabaseAnonKey);
}

export function configureRuntimeSupabase(url: string, anonKey: string): boolean {
  const nextUrl = url.trim();
  const nextKey = anonKey.trim();
  if (!isValidHttpUrl(nextUrl) || !isValidAnonKey(nextKey)) {
    return false;
  }
  if (activeSupabaseUrl !== nextUrl || activeSupabaseAnonKey !== nextKey) {
    activeSupabaseUrl = nextUrl;
    activeSupabaseAnonKey = nextKey;
    clientInstance = null;
  }
  return true;
}

export const isSupabaseClientConfigured = isRuntimeSupabaseConfigured();

export function getSupabaseConfigIssue(): string | null {
  if (isRuntimeSupabaseConfigured()) return null;
  if (!activeSupabaseUrl) return null;
  if (!isValidHttpUrl(activeSupabaseUrl)) {
    return 'VITE_SUPABASE_URL is set but is not a valid http(s) URL (must start with https://).';
  }
  if (!isValidAnonKey(activeSupabaseAnonKey)) {
    return 'VITE_SUPABASE_ANON_KEY is missing or appears to be a placeholder.';
  }
  return null;
}

export const supabaseClientConfigIssue = getSupabaseConfigIssue();

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isRuntimeSupabaseConfigured()) {
    throw new Error(
      getSupabaseConfigIssue() ||
        'Supabase frontend environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not configured.'
    );
  }
  if (!clientInstance) {
    clientInstance = createClient(activeSupabaseUrl, activeSupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}
