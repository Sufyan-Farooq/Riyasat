import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, emptyState, today, uid } from '../lib/domain';
import type { Actor } from '../lib/types';
const owner: Actor = { id: 'owner', name: 'Owner', role: 'owner', propertyIds: null };
function fixture(withLease = false) {
  let state = emptyState();
  const run = (type: string, payload: Record<string, unknown>, actor = owner) => state = applyCommand(state, { id: uid(), type, payload }, actor);
  run('property.add', { name: 'Test property', address: 'Test street', city: 'Hyderabad', state: 'Telangana', waterCan: '001234', ptin: '0005678' });
  const propertyId = state.properties[0].id;
  run('tenant.add', { propertyId, name: 'Test tenant', email: 'test@example.test', phone: '0123', notes: 'Original notes' });
  const tenantId = state.tenants[0].id;
  if (withLease) { run('floor.add', { propertyId, name: 'Ground floor', order: 0 }); run('unit.add', { propertyId, floorId: state.floors[0].id, name: '101', kind: 'Flat', area: 800 }); run('lease.add', { propertyId, tenantId, unitId: state.units[0].id, rent: 100000, deposit: 200000, start: `${today().slice(0,7)}-01`, end: `${Number(today().slice(0,4))+1}-12-31`, dueDay: 5 }); }
  return { get state() { return state; }, run, propertyId, tenantId };
}
test('tenant edits preserve identity, historical agreements and financial entries', () => {
  const f = fixture(true), leaseId = f.state.leases[0].id;
  f.run('receipt.add', { leaseId, amount: 50000, date: today(), kind: 'rent', accountId: 'bank', method: 'Cash' });
  const history = structuredClone({ leases: f.state.leases, receipts: f.state.receipts, journals: f.state.journals });
  f.run('tenant.update', { tenantId: f.tenantId, name: 'Corrected name', notes: '' });
  assert.equal(f.state.tenants[0].id, f.tenantId); assert.equal(f.state.tenants[0].email, 'test@example.test'); assert.equal(f.state.tenants[0].notes, '');
  assert.deepEqual({ leases: f.state.leases, receipts: f.state.receipts, journals: f.state.journals }, history);
  assert.match(f.state.audit[0].detail, /Test tenant → Corrected name/);
});
test('unused tenant deletion removes only the tenant and leaves an audit trail', () => {
  const f = fixture(); f.run('tenant.remove', { tenantId: f.tenantId }); assert.equal(f.state.tenants.length, 0); assert.equal(f.state.properties.length, 1); assert.match(f.state.audit[0].detail, /Deleted unused tenant/);
});
test('tenants with agreements cannot be deleted or archived while the agreement is active', () => {
  const f = fixture(true), before = structuredClone(f.state);
  assert.throws(() => f.run('tenant.remove', { tenantId: f.tenantId }), /agreement history/);
  assert.throws(() => f.run('tenant.archive', { tenantId: f.tenantId }), /move-out/);
  assert.deepEqual(f.state, before);
});
test('archive and restore retain ended agreement history and block new agreements until restored', () => {
  const f = fixture(true); f.run('lease.end', { leaseId: f.state.leases[0].id, date: today() });
  const leases = structuredClone(f.state.leases), journals = structuredClone(f.state.journals);
  f.run('tenant.archive', { tenantId: f.tenantId }); assert.equal(f.state.tenants[0].archived, true); assert.deepEqual(f.state.leases, leases); assert.deepEqual(f.state.journals, journals);
  f.run('unit.add', { propertyId: f.propertyId, floorId: f.state.floors[0].id, name: '102', kind: 'Flat', area: 600 });
  assert.throws(() => f.run('lease.add', { propertyId: f.propertyId, tenantId: f.tenantId, unitId: f.state.units[1].id, rent: 100000, start: today(), end: `${Number(today().slice(0,4))+1}-12-31`, dueDay: 5 }), /Restore this tenant/);
  f.run('tenant.restore', { tenantId: f.tenantId }); assert.equal(f.state.tenants[0].archived, false);
});
test('record-management commands enforce viewer and assigned-property access on the server', () => {
  const f = fixture();
  for (const role of ['viewer', 'manager'] as const) for (const type of ['tenant.update','tenant.remove','tenant.archive','tenant.restore']) assert.throws(() => f.run(type, { tenantId: f.tenantId, name: 'Changed', propertyId: f.propertyId }, { ...owner, role, propertyIds: [] }), /Viewers|access/);
  f.run('tenant.update', { tenantId: f.tenantId, phone: '456' }, { ...owner, role: 'manager', propertyIds: [f.propertyId] }); assert.equal(f.state.tenants[0].phone, '456');
});
test('property billing IDs preserve leading zeros and can be changed or cleared without touching the ledger', () => {
  const f = fixture(true); assert.equal(f.state.properties[0].waterCan, '001234'); assert.equal(f.state.properties[0].ptin, '0005678');
  const before = structuredClone(f.state.journals);
  f.run('property.update', { propertyId: f.propertyId, name: 'Renamed property', waterCan: '000009', ptin: '', latitude: '', longitude: '' });
  assert.equal(f.state.properties[0].waterCan, '000009'); assert.equal(f.state.properties[0].ptin, ''); assert.deepEqual(f.state.journals, before);
  assert.equal(f.state.properties[0].latitude, undefined);
  assert.throws(() => f.run('property.update', { propertyId: f.propertyId, ptin: '123' }, { ...owner, role: 'manager' }), /Only an owner/);
  assert.throws(() => f.run('property.update', { propertyId: f.propertyId, waterCan: 'x'.repeat(81) }), /80 characters/);
});
