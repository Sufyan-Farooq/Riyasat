import { NextRequest } from 'next/server';
import { access } from '@/lib/server';
import { resolveMapsLocation } from '@/lib/maps-location';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { actor } = await access(request, id);
    if (actor.role !== 'owner') return Response.json({ error: 'Only owners can add property locations.' }, { status: 403 });
    const body = await request.text();
    if (body.length > 10000) return Response.json({ error: 'The Maps link is too long.' }, { status: 413 });
    const payload = JSON.parse(body);
    if (typeof payload.url !== 'string') throw new Error('Paste a Google Maps link.');
    const result = await resolveMapsLocation(payload.url, process.env.GOOGLE_MAPS_API_KEY);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The Maps link could not be opened. Try the full browser link or enter the address below.' }, { status: 400 });
  }
}
