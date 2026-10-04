'use client';
import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { LocationDetails, LocationLookup } from '@/lib/maps-location';

export default function PropertyLocation({ lookup, onFill, disabled }: { lookup: (url: string) => Promise<LocationLookup>; onFill: (details: LocationDetails) => void; disabled: boolean }) {
  const [url, setUrl] = useState(''), [loading, setLoading] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const fill = async () => {
    if (loading || disabled) return;
    setLoading(true); setMessage(''); setError('');
    try { const result = await lookup(url); onFill(result.details); setMessage(result.message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not look up this location. Enter the details below.'); }
    finally { setLoading(false); }
  };
  return <section className="property-location" aria-label="Fill location from Google Maps">
    <label htmlFor="property-maps-link"><MapPin size={16} aria-hidden="true" />Google Maps link</label>
    <div className="property-location-controls"><input id="property-maps-link" type="url" value={url} onChange={e => { setUrl(e.target.value); setError(''); setMessage(''); }} placeholder="Paste a place or dropped-pin link" disabled={loading || disabled} aria-describedby="property-maps-help" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void fill(); } }} /><button type="button" className="secondary" disabled={!url.trim() || loading || disabled} onClick={() => void fill()}>{loading ? 'Finding location…' : 'Fill location'}</button></div>
    <p id="property-maps-help">In Google Maps, select the property → Share → Copy link. You can also enter the address below.</p>
    {message && <p className="location-result" role="status">{message}</p>}
    {error && <p className="location-error" role="alert">{error}</p>}
  </section>;
}
