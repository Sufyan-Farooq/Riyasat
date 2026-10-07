'use client';
import { createClient } from '@supabase/supabase-js';
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publicKey);
// Retain this independently of the URL: Next hydration can restore the original
// URL while Supabase initializes, before PASSWORD_RECOVERY reaches the component.
let recoveryPending = typeof window !== 'undefined' && (
  new URLSearchParams(window.location.search).get('reset') === 'true' ||
  new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
);
export function isPasswordRecovery() { return recoveryPending; }
// Supabase may consume callback parameters before React mounts.
export const authRedirectFailed = typeof window !== 'undefined' && (
  new URLSearchParams(window.location.search).has('error') ||
  new URLSearchParams(window.location.hash.slice(1)).has('error')
);
// Capture recovery before the auth client consumes and removes the URL fragment.
// Keep the marker in the URL so refreshing still opens the new-password form.
export function markPasswordRecovery() {
  recoveryPending = true;
  const url = new URL(window.location.href);
  url.searchParams.set('reset', 'true');
  window.history.replaceState(null, '', url);
}
export function clearPasswordRecovery() {
  recoveryPending = false;
  const url = new URL(window.location.href);
  url.searchParams.delete('reset'); url.hash = '';
  window.history.replaceState(null, '', url);
}
if (recoveryPending) {
  markPasswordRecovery();
}
export const supabase = configured ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publicKey!) : null;
