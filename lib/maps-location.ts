export type LocationDetails = { name?: string; address?: string; city?: string; state?: string; country?: string; latitude?: number; longitude?: number };
export type LocationLookup = { details: LocationDetails; complete: boolean; message: string };
type Fetch = typeof fetch;
const googleHosts = new Set(['google.com', 'www.google.com', 'maps.google.com', 'google.co.in', 'www.google.co.in']);

export function mapsUrl(value: string): URL {
  if (!value || value.length > 8192) throw new Error('Paste a valid Google Maps link.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Paste the full Google Maps link, starting with https://.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Use a secure Google Maps link.');
  const short = url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/');
  const full = googleHosts.has(url.hostname) && (url.pathname === '/maps' || url.pathname.startsWith('/maps/') || url.hostname === 'maps.google.com');
  if (!short && !full) throw new Error('This is not a supported Google Maps link. Use Google Maps → Share → Copy link.');
  return url;
}

export function parseMapsLocation(url: URL) {
  const placeId = url.searchParams.get('query_place_id') || url.searchParams.get('place_id');
  const query = url.searchParams.get('query') || url.searchParams.get('q');
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { throw new Error('The Maps link contains an invalid address.'); }
  const label = path.match(/\/maps\/place\/([^/]+)/)?.[1].replace(/\+/g, ' ');
  const coordinateText = query?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  const pin = `${path}${url.searchParams.get('data') || ''}`.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const pair = pin || coordinateText;
  const latitude = pair ? Number(pair[1]) : undefined, longitude = pair ? Number(pair[2]) : undefined;
  if (pair && (Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180)) throw new Error('This link contains invalid coordinates.');
  // /@lat,lng is the camera centre, which can differ from the selected property.
  return { placeId: placeId || (query?.startsWith('place_id:') ? query.slice(9) : undefined), address: !coordinateText && !query?.startsWith('place_id:') ? query || label : label, label, latitude, longitude };
}

export async function resolveMapsLocation(value: string, key?: string, fetcher: Fetch = fetch): Promise<LocationLookup> {
  let url = mapsUrl(value);
  for (let redirects = 0; url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl'; redirects++) {
    if (redirects >= 4) throw new Error('This Maps link redirects too many times. Copy the full link from your browser.');
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), cache: 'no-store' });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status < 300 || response.status > 399 || !location) throw new Error('Could not expand this shared link. Open it in Google Maps and copy the full browser link.');
    url = mapsUrl(new URL(location, url).toString());
  }
  const parsed = parseMapsLocation(url);
  const details: LocationDetails = {};
  if (parsed.label && !/^[-\d.,\s]+$/.test(parsed.label)) details.name = parsed.label;
  if (parsed.latitude !== undefined) { details.latitude = parsed.latitude; details.longitude = parsed.longitude; }
  const partial = () => ({ details, complete: false, message: 'Coordinates filled from the Maps pin. Enter the address, city, state and country below; automatic address lookup is not configured.' });
  if (!key) {
    if (details.latitude !== undefined) return partial();
    throw new Error('Automatic address lookup is not configured. Ask an owner to connect Google Maps, or enter the location below.');
  }
  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('key', key);
  if (parsed.placeId) endpoint.searchParams.set('place_id', parsed.placeId);
  else if (parsed.latitude !== undefined) endpoint.searchParams.set('latlng', `${parsed.latitude},${parsed.longitude}`);
  else if (parsed.address) endpoint.searchParams.set('address', parsed.address);
  else throw new Error('This link only shows a map view. Share a selected place or dropped pin instead.');
  let data;
  try {
    const response = await fetcher(endpoint, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) throw new Error();
    data = await response.json();
  } catch { throw new Error('Address lookup is temporarily unavailable. Try again or enter the details below.'); }
  if (data.status !== 'OK' || !data.results?.length) throw new Error(data.status === 'ZERO_RESULTS' ? 'No address found for this link. Check the selected pin or enter the details below.' : 'Google Maps address lookup is unavailable. Ask an owner to check its API configuration, or enter the details below.');
  const result = data.results[0];
  const component = (...types: string[]) => types.map(type => result.address_components?.find((c: { types: string[]; long_name: string }) => c.types.includes(type))?.long_name).find(Boolean);
  const location = result.geometry?.location;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) throw new Error('Google Maps returned an invalid location. Enter the details below.');
  details.address = result.formatted_address;
  details.city = component('locality', 'postal_town', 'administrative_area_level_3', 'administrative_area_level_2');
  details.state = component('administrative_area_level_1'); details.country = component('country');
  details.latitude = parsed.latitude ?? location.lat; details.longitude = parsed.longitude ?? location.lng;
  return { details, complete: Boolean(details.address && details.city && details.state && details.country), message: 'Location filled from Google Maps. Review the address and pin before saving.' };
}
