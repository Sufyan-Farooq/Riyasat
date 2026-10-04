'use client';
import { createClient } from '@supabase/supabase-js';
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publicKey);
export const supabase = configured ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publicKey!) : null;
