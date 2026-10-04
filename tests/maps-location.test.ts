import test from 'node:test';
import assert from 'node:assert/strict';
import { mapsUrl, parseMapsLocation, resolveMapsLocation } from '../lib/maps-location';

test('selected pin takes precedence over camera centre and decodes the place label', () => {
  const result = parseMapsLocation(mapsUrl('https://www.google.com/maps/place/Family+House/@19.0,72.0,16z/data=!4m2!3d19.123!4d72.456'));
  assert.equal(result.label, 'Family House'); assert.equal(result.latitude, 19.123); assert.equal(result.longitude, 72.456);
});
test('coordinate links retain valid zero coordinates and reject out-of-range pins', () => {
  assert.equal(parseMapsLocation(mapsUrl('https://maps.google.com/?q=0,0')).latitude, 0);
  assert.throws(() => parseMapsLocation(mapsUrl('https://www.google.com/maps?q=91,72')), /invalid coordinates/);
});
test('map camera centre is never interpreted as a selected pin', () => {
  assert.equal(parseMapsLocation(mapsUrl('https://www.google.com/maps/@19,72,16z')).latitude, undefined);
});
test('no API key fills only real pin details, without a network request or invented address', async () => {
  const noNetwork: typeof fetch = async () => { throw new Error('Unexpected network request'); };
  const result = await resolveMapsLocation('https://www.google.com/maps?q=19,72', undefined, noNetwork);
  assert.deepEqual(result.details, { latitude: 19, longitude: 72 }); assert.equal(result.complete, false);
  await assert.rejects(resolveMapsLocation('https://www.google.com/maps/place/House', undefined, noNetwork), /not configured/);
});
test('host validation blocks credentials, non-HTTPS and lookalike hosts', () => {
  for (const url of ['https://www.google.com.evil.test/maps?q=19,72', 'https://localhost/maps', 'https://user:password@google.com/maps', 'http://google.com/maps', 'https://google.com:444/maps', 'https://goo.gl/notmaps']) assert.throws(() => mapsUrl(url));
});
test('shortened links validate redirect destinations before making another request', async () => {
  let calls = 0;
  const unsafe: typeof fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }); };
  await assert.rejects(resolveMapsLocation('https://maps.app.goo.gl/property', undefined, unsafe), /secure Google Maps/);
  assert.equal(calls, 1);
  const safe: typeof fetch = async () => new Response(null, { status: 302, headers: { location: 'https://www.google.com/maps?q=19,72' } });
  assert.equal((await resolveMapsLocation('https://maps.app.goo.gl/property', undefined, safe)).details.latitude, 19);
});
test('geocoding maps structured international address components and keeps dropped-pin coordinates', async () => {
  const geocode: typeof fetch = async input => {
    const url = new URL(String(input)); assert.equal(url.hostname, 'maps.googleapis.com'); assert.equal(url.searchParams.get('latlng'), '19,72');
    return Response.json({ status: 'OK', results: [{ formatted_address: 'Verified address', address_components: [
      { long_name: 'Mumbai', types: ['locality'] }, { long_name: 'Maharashtra', types: ['administrative_area_level_1'] }, { long_name: 'India', types: ['country'] }
    ], geometry: { location: { lat: 19.001, lng: 72.001 } } }] });
  };
  const result = await resolveMapsLocation('https://www.google.com/maps?q=19,72', 'test-key', geocode);
  assert.deepEqual(result.details, { address: 'Verified address', city: 'Mumbai', state: 'Maharashtra', country: 'India', latitude: 19, longitude: 72 }); assert.equal(result.complete, true);
});
test('place IDs are passed as place IDs and Google errors do not expose response secrets', async () => {
  const geocode: typeof fetch = async input => { const url = new URL(String(input)); assert.equal(url.searchParams.get('place_id'), 'ChIJtest'); assert.equal(url.searchParams.has('address'), false); return Response.json({ status: 'REQUEST_DENIED', error_message: 'test-key should not appear in errors' }); };
  await assert.rejects(resolveMapsLocation('https://www.google.com/maps/search/?api=1&query=House&query_place_id=ChIJtest', 'test-key', geocode), error => error instanceof Error && !error.message.includes('test-key') && error.message.includes('API configuration'));
});
