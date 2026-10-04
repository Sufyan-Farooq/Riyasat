import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import type { Actor, WorkspaceState } from './types';
export function admin() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error('Hosted storage is not configured.'); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
export async function identity(request: NextRequest) { const token = request.headers.get('authorization')?.replace(/^Bearer /, ''); if (!token) throw new Error('Sign in to continue.'); const db = admin(); const { data, error } = await db.auth.getUser(token); if (error || !data.user) throw new Error('Your session expired. Sign in again.'); if (!data.user.email_confirmed_at) throw new Error('Verify your email before opening a workspace.'); return { db, user: data.user }; }
export async function access(request: NextRequest, workspaceId: string) { const { db, user } = await identity(request); const { data: m, error } = await db.from('memberships').select('*').eq('workspace_id', workspaceId).eq('user_id', user.id).single(); if (error || !m) throw new Error('You do not have access to this workspace.'); const actor: Actor = { id: user.id, name: user.user_metadata?.name || user.email || 'Member', role: m.role, propertyIds: m.property_ids }; const { data: row } = await db.from('workspace_data').select('state,version').eq('workspace_id', workspaceId).single(); if (!row) throw new Error('Workspace data could not be loaded.'); return { db, user, actor, state: row.state as WorkspaceState, version: row.version as number }; }
export function apiError(error: unknown, status = 400) { const message = error instanceof Error ? error.message : 'Operation failed.'; return Response.json({ error: message }, { status }); }
export function requireOwnerMfa(request: NextRequest, actor: Actor) {
  if (actor.role !== 'owner') return;
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString());
  if (claims.aal !== 'aal2') throw new Error('Owner verification required. Open Settings → Account security and verify your authenticator before changing live records.');
}
