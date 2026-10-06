import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, emptyState, metrics, today, uid, depositBalance } from '../lib/domain';
import type { Actor } from '../lib/types';

const owner: Actor = { id: 'owner', name: 'Owner', role: 'owner', propertyIds: null };
const flat = { kind: 'flat', name: 'My flat', flatNumber: '302', buildingName: 'Garden Society', floorName: 'Third floor', area: 900, address: 'Garden Road', city: 'Hyderabad', state: 'Telangana' };
function fixture() {
  let state = emptyState();
  const run = (type: string, payload: Record<string, unknown>, actor = owner, id = uid()) => state = applyCommand(state, { id, type, payload }, actor);
  return { get state() { return state; }, run };
}

test('flat setup creates exactly one rentable unit and retries do not duplicate it', () => {
  const f = fixture(), commandId = uid();
  f.run('property.add', flat, owner, commandId);
  f.run('property.add', flat, owner, commandId);
  assert.equal(f.state.properties.length, 1);
  assert.equal(f.state.floors.length, 1);
  assert.equal(f.state.units.length, 1);
  assert.equal(f.state.properties[0].buildingName, flat.buildingName);
  assert.equal(f.state.floors[0].name, flat.floorName);
  const unit = f.state.units[0];
  assert.equal(unit.propertyId, f.state.properties[0].id);
  assert.equal(unit.floorId, f.state.floors[0].id);
  assert.equal(unit.name, '302');
  assert.equal(unit.kind, 'Flat');
  assert.equal(unit.area, 900);
});

test('legacy building setup keeps floors and units manual', () => {
  const f = fixture(); f.run('property.add', { ...flat, kind: undefined });
  assert.equal(f.state.properties[0].kind, 'building');
  assert.equal(f.state.floors.length, 0);
  assert.equal(f.state.units.length, 0);
  f.run('floor.add', { propertyId: f.state.properties[0].id, name: 'Ground', order: 0 });
  assert.equal(f.state.floors.length, 1);
});

test('invalid or unauthorized flat setup leaves the workspace untouched', () => {
  const f = fixture(), before = structuredClone(f.state);
  for (const payload of [{ ...flat, kind: 'unknown' }, { ...flat, flatNumber: '' }, { ...flat, buildingName: '' }, { ...flat, floorName: '' }, { ...flat, area: -1 }]) {
    assert.throws(() => f.run('property.add', payload));
    assert.deepEqual(f.state, before);
  }
  assert.throws(() => f.run('property.add', flat, { ...owner, role: 'manager' }));
  assert.deepEqual(f.state, before);
});

test('flat supports agreements, deposits, bills and occupancy without builder commands', () => {
  const f = fixture(); f.run('property.add', flat);
  const propertyId = f.state.properties[0].id, unitId = f.state.units[0].id, date = today();
  f.run('tenant.add', { propertyId, name: 'Tenant' });
  f.run('lease.add', { propertyId, unitId, tenantId: f.state.tenants[0].id, rent: 100000, deposit: 200000, start: date, end: `${Number(date.slice(0, 4)) + 1}-12-31`, dueDay: 5 });
  const leaseId = f.state.leases[0].id;
  f.run('receipt.add', { leaseId, amount: 200000, date, kind: 'deposit', accountId: 'bank', method: 'Bank transfer' });
  f.run('bill.add', { propertyId, vendor: 'Society', category: 'Association fees', amount: 10000, date, due: date, description: 'Monthly fee', allocationMethod: 'equal' });
  assert.equal(depositBalance(f.state, leaseId), 200000);
  assert.deepEqual(f.state.bills[0].allocations, [{ unitId, amount: 10000 }]);
  assert.equal(metrics(f.state, date, date).occupancy, 100);
  const history = structuredClone({ leases: f.state.leases, journals: f.state.journals, receipts: f.state.receipts });
  const floorId = f.state.floors[0].id;
  f.run('property.update', { propertyId, flatNumber: '303', floorName: 'Fourth floor', buildingName: 'New society', area: 950 });
  assert.equal(f.state.units[0].id, unitId);
  assert.equal(f.state.units[0].name, '303');
  assert.equal(f.state.units[0].area, 950);
  assert.equal(f.state.floors[0].id, floorId);
  assert.equal(f.state.floors[0].name, 'Fourth floor');
  assert.deepEqual({ leases: f.state.leases, journals: f.state.journals, receipts: f.state.receipts }, history);
});

test('flat remains one unit and property type cannot be changed by an update', () => {
  const f = fixture(); f.run('property.add', flat);
  const propertyId = f.state.properties[0].id, before = structuredClone(f.state);
  assert.throws(() => f.run('floor.add', { propertyId, name: 'Extra', order: 1 }), /additional floors/);
  assert.throws(() => f.run('unit.add', { propertyId, floorId: f.state.floors[0].id, name: '304', kind: 'Flat', area: 900 }), /already has/);
  assert.throws(() => f.run('property.update', { propertyId, kind: 'building' }), /cannot change/);
  assert.deepEqual(f.state, before);
});
