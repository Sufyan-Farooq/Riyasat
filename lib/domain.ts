import type { Actor, Approval, Bill, Command, JournalLine, Lease, WorkspaceState } from './types';

export const uid = () => crypto.randomUUID();
export function today(timezone = 'Asia/Kolkata') { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function emptyState(name = 'My properties'): WorkspaceState {
  return { schemaVersion: 1, name, currency: 'INR', timezone: 'Asia/Kolkata', fiscalStart: 4, reserve: 0, properties: [], floors: [], units: [], tenants: [], leases: [], charges: [], receipts: [], bills: [], billPayments: [], accounts: [{ id: 'bank', name: 'Property bank account', kind: 'bank' }, { id: 'cash', name: 'Cash in hand', kind: 'cash' }], journals: [], maintenance: [], meters: [], approvals: [], statements: [], audit: [], evidence: [], closedThrough: '', commandIds: [] };
}
export function money(value: unknown): number {
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 0 || n > 100_000_000_000) throw new Error('Enter a valid non-negative amount.'); return n;
}
function text(value: unknown, label: string, required = true): string { const s = String(value ?? '').trim(); if ((required && !s) || s.length > 2000) throw new Error(`${label} is required and must be under 2,000 characters.`); return s; }
function reference(value: unknown, label: string): string { const s = text(value, label, false); if (s.length > 80) throw new Error(`${label} must be under 80 characters.`); return s; }
function date(value: unknown): string { const s = text(value, 'Date'); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error('Enter a valid date.'); return s; }
function number(value: unknown, min: number, max: number): number { const n = Number(value); if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Value must be between ${min} and ${max}.`); return n; }
function integer(value: unknown, min: number, max: number): number { const n = number(value, min, max); if (!Number.isInteger(n)) throw new Error('Use a whole number.'); return n; }
function positive(value: unknown) { const n = money(value); if (!n) throw new Error('Amount must be greater than zero.'); return n; }
function find<T extends { id: string }>(list: T[], id: unknown, label: string): T { const item = list.find(x => x.id === id); if (!item) throw new Error(`${label} could not be found.`); return item; }
function accessible(actor: Actor, propertyId: string) { return actor.role === 'owner' || actor.propertyIds === null || actor.propertyIds.includes(propertyId); }
export function assertProperty(s: WorkspaceState, actor: Actor, id: unknown) { const p = find(s.properties, id, 'Property'); if (!accessible(actor, p.id)) throw new Error('You do not have access to this property.'); return p.id; }
function unlocked(s: WorkspaceState, d: string) { if (s.closedThrough && d <= s.closedThrough) throw new Error('This reporting period is closed. An owner must reopen it first.'); }
function post(s: WorkspaceState, propertyId: string, d: string, sourceId: string, description: string, lines: JournalLine[], reversalOf?: string) {
  unlocked(s, d); if (lines.some(x => !Number.isSafeInteger(x.debit) || !Number.isSafeInteger(x.credit) || x.debit < 0 || x.credit < 0) || lines.reduce((n, l) => n + l.debit - l.credit, 0) !== 0) throw new Error('Journal must balance.');
  s.journals.push({ id: uid(), propertyId, date: d, sourceId, description, lines, reversalOf });
}
const dr = (account: string, debit: number): JournalLine => ({ account, debit, credit: 0 });
const cr = (account: string, credit: number): JournalLine => ({ account, debit: 0, credit });
function receiptActiveAt(s: WorkspaceState, r: WorkspaceState['receipts'][number], at?: string) {
  if (at && r.date > at) return false;
  if (!r.reversed) return true;
  if (!at) return false;
  return !s.approvals.some(a => a.kind === 'reversal' && a.status === 'approved' && a.sourceId === r.id && a.date <= at);
}
export function effectiveAllocations(s: WorkspaceState, receipt: WorkspaceState['receipts'][number], at?: string) {
  const allocated = receipt.allocations.filter(a => !at || (a.date || receipt.date) <= at).map(a => ({ ...a }));
  const moved = s.approvals.filter(a => a.status === 'approved' && (!at || a.date <= at)).flatMap(a => a.creditMoves || []).filter(m => m.receiptId === receipt.id);
  for (const move of moved) { let left = move.amount; for (const a of allocated.filter(a => a.chargeId === move.chargeId)) { const n = Math.min(left, a.amount); a.amount -= n; left -= n; } }
  return allocated;
}
export function chargeBalance(s: WorkspaceState, id: string, at?: string) { const c = find(s.charges, id, 'Charge'); if (at && c.date > at) return 0; return c.amount - s.receipts.filter(r => receiptActiveAt(s, r, at)).flatMap(r => effectiveAllocations(s, r, at)).filter(a => a.chargeId === id).reduce((n, a) => n + a.amount, 0) - s.approvals.filter(a => a.status === 'approved' && ['writeoff', 'charge-credit'].includes(a.kind) && a.sourceId === id && (!at || a.date <= at)).reduce((n, a) => n + a.amount, 0); }
export function billBalance(s: WorkspaceState, id: string) { return find(s.bills, id, 'Bill').amount - s.billPayments.filter(p => p.billId === id && !p.reversed).reduce((n, p) => n + p.amount, 0); }
export function accountBalance(s: WorkspaceState, id: string, at?: string) { return s.journals.filter(j => !at || j.date <= at).flatMap(j => j.lines).filter(l => l.account === id).reduce((n, l) => n + l.debit - l.credit, 0); }
export function depositBalance(s: WorkspaceState, leaseId?: string, at?: string) { return s.receipts.filter(r => receiptActiveAt(s, r, at) && r.kind === 'deposit' && (!leaseId || r.leaseId === leaseId)).reduce((n, r) => n + r.amount, 0) - s.approvals.filter(a => a.status === 'approved' && ['refund', 'deduction'].includes(a.kind) && (!leaseId || a.leaseId === leaseId) && (!at || a.date <= at)).reduce((n, a) => n + a.amount, 0); }
export function creditBalance(s: WorkspaceState, leaseId?: string) { return s.receipts.filter(r => !r.reversed && r.kind !== 'deposit' && (!leaseId || r.leaseId === leaseId)).reduce((n, r) => n + r.amount + r.withholding - effectiveAllocations(s, r).reduce((m, a) => m + a.amount, 0), 0); }
function allocate(s: WorkspaceState, leaseId: string, amount: number, requested?: { chargeId: string; amount: number }[], at?: string) {
  const allocations: { chargeId: string; amount: number }[] = []; let remaining = amount;
  if (requested) {
    const ids = new Set<string>();
    for (const a of requested) { const c = find(s.charges, a.chargeId, 'Charge'); if (c.leaseId !== leaseId || ids.has(c.id) || at && c.date > at) throw new Error('Allocation must use distinct existing charges from this agreement.'); ids.add(c.id); const n = positive(a.amount); if (n > chargeBalance(s, c.id) || n > remaining) throw new Error('Allocation exceeds the outstanding charge or payment.'); allocations.push({ chargeId: c.id, amount: n }); remaining -= n; }
  } else {
    for (const c of s.charges.filter(c => c.leaseId === leaseId && (!at || c.date <= at)).sort((a, b) => a.due.localeCompare(b.due))) { const n = Math.min(remaining, chargeBalance(s, c.id)); if (n > 0) { allocations.push({ chargeId: c.id, amount: n }); remaining -= n; } }
  }
  return allocations;
}
function makeCharge(s: WorkspaceState, l: Lease, amount: number, d: string, due: string, description: string, key: string, kind: 'rent' | 'utility' | 'maintenance' = 'rent') {
  if (s.charges.some(c => c.key === key)) return;
  const id = uid(); s.charges.push({ id, propertyId: l.propertyId, leaseId: l.id, date: d, due, amount, kind, description, key }); post(s, l.propertyId, d, id, description, [dr('receivable', amount), cr(kind === 'rent' ? 'rent-income' : 'recovery-income', amount)]);
}
export function generateCharges(s: WorkspaceState, through: string, allowed?: Set<string>) {
  for (const l of s.leases) {
    if (allowed && !allowed.has(l.propertyId)) continue;
    const end = l.ended && l.ended < l.end ? l.ended : l.end;
    for (let month = l.start.slice(0, 7); month <= through.slice(0, 7) && month <= end.slice(0, 7);) {
      const [y, m] = month.split('-').map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const first = `${month}-01`, last = `${month}-${String(days).padStart(2, '0')}`;
      const from = l.start > first ? l.start : first, to = end < last ? end : last;
      if (from <= to && from <= through && (!s.closedThrough || from > s.closedThrough)) {
        const occupied = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
        const rent = l.escalationDate && first >= l.escalationDate ? Math.round(l.rent * (1 + l.escalationPercent / 100)) : l.rent;
        const due = `${month}-${String(Math.min(days, l.dueDay)).padStart(2, '0')}`;
        makeCharge(s, l, Math.round(rent * occupied / days), from, due < from ? from : due, `Rent · ${month}`, `rent:${l.id}:${month}`);
        if (l.recurring) makeCharge(s, l, Math.round(l.recurring * occupied / days), from, due < from ? from : due, `Recurring charges · ${month}`, `recurring:${l.id}:${month}`, 'maintenance');
      }
      month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    }
  }
  // Apply retained advance and overpayment credits only when new charges exist.
  for (const r of s.receipts.filter(r => !r.reversed && r.kind !== 'deposit' && (!allowed || allowed.has(r.propertyId)))) {
    const available = r.amount + r.withholding - effectiveAllocations(s, r).reduce((n, a) => n + a.amount, 0); if (!available) continue;
    const alloc = allocate(s, r.leaseId, available); const used = alloc.reduce((n, a) => n + a.amount, 0);
    if (used) { const d = through > s.closedThrough ? through : ''; if (!d) continue; r.allocations.push(...alloc.map(a => ({ ...a, date: d }))); post(s, r.propertyId, d, r.id, 'Apply advance to charges', [dr('tenant-credit', used), cr('receivable', used)]); }
  }
}
function generateBills(s: WorkspaceState, through: string, allowed?: Set<string>) {
  for (const template of s.bills.filter(b => b.recurrence === 'monthly' && (!allowed || allowed.has(b.propertyId)))) {
    let month = template.date.slice(0, 7); const day = Number(template.date.slice(8)), dueDay = Number(template.due.slice(8));
    const offset = Math.round((Date.parse(template.due) - Date.parse(template.date)) / 86400000);
    for (let i = 0; i < 360; i++) { const [y, m] = month.split('-').map(Number); month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); const [ny, nm] = month.split('-').map(Number); const d = `${month}-${String(Math.min(day, new Date(Date.UTC(ny, nm, 0)).getUTCDate())).padStart(2, '0')}`; if (d > through || template.recurrenceEnd && d > template.recurrenceEnd) break; const key = `bill:${template.id}:${month}`; if (s.bills.some(b => b.key === key) || s.closedThrough && d <= s.closedThrough) continue; const due = new Date(Date.parse(d) + Math.max(0, offset) * 86400000).toISOString().slice(0, 10); const id = uid(); const bill: Bill = { ...template, id, date: d, due, recurrence: undefined, recurrenceParent: template.id, key }; s.bills.push(bill); const expenseAccount = bill.category === 'Capital improvement' ? 'capital-assets' : bill.category === 'Loan principal' ? 'loan-liability' : `expense:${bill.category}`; post(s, bill.propertyId, d, id, `${bill.description} · scheduled`, [dr(expenseAccount, bill.amount), cr('payable', bill.amount)]); }
  }
}
export function applyCommand(original: WorkspaceState, command: Command, actor: Actor): WorkspaceState {
  if (original.commandIds.includes(command.id)) return original;
  if (actor.role === 'viewer') throw new Error('Viewers cannot change records.');
  const s = structuredClone(original), p = command.payload; let propertyId: string | undefined; let detail = command.type;
  const owner = () => { if (actor.role !== 'owner') throw new Error('Only an owner can perform this action.'); };
  const property = (id = p.propertyId) => propertyId = assertProperty(s, actor, id);
  const lease = () => { const l = find(s.leases, p.leaseId, 'Agreement'); property(l.propertyId); return l; };
  const account = (id = p.accountId) => find(s.accounts, id, 'Account').id;
  switch (command.type) {
    case 'batch.import': {
      if (!Array.isArray(p.commands) || p.commands.length > 500) throw new Error('Import up to 500 records at a time.');
      let result = s;
      for (const child of p.commands as Command[]) { if (child.type === 'batch.import' || !['property.add', 'unit.add', 'tenant.add', 'lease.add', 'opening.tenant'].includes(child.type)) throw new Error('Invalid import operation.');
        const payload = { ...child.payload };
        if (child.type === 'unit.add') payload.floorId = result.floors.find(f => f.propertyId === payload.propertyId && f.name === payload.floor)?.id;
        if (child.type === 'lease.add') { payload.tenantId = result.tenants.find(t => t.name === payload.tenant && t.propertyId === payload.propertyId)?.id; payload.unitId = result.units.find(u => u.name === payload.unit && u.propertyId === payload.propertyId)?.id; }
        if (child.type === 'opening.tenant') { const tenant = result.tenants.find(t => t.name === payload.tenant && t.propertyId === payload.propertyId); const unit = result.units.find(u => u.name === payload.unit && u.propertyId === payload.propertyId); payload.leaseId = result.leases.find(l => l.tenantId === tenant?.id && l.unitIds.includes(unit?.id || ''))?.id; }
        result = applyCommand(result, { ...child, payload }, actor);
      }
      result.commandIds.push(command.id); result.audit.unshift({ id: uid(), actor: actor.name, date: new Date().toISOString(), action: command.type, detail: `Imported ${p.commands.length} records` }); return result;
    }
    case 'settings': {
      owner(); s.name = text(p.name, 'Workspace name'); s.reserve = money(p.reserve); s.fiscalStart = integer(p.fiscalStart, 1, 12); const timezone = text(p.timezone, 'Timezone'); new Intl.DateTimeFormat('en', { timeZone: timezone }); s.timezone = timezone;
      const currency = text(p.currency, 'Currency'); if (!/^[A-Z]{3}$/.test(currency) || !Intl.supportedValuesOf('currency').includes(currency)) throw new Error('Use a valid three-letter currency code.'); if (new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits !== 2) throw new Error('This release supports currencies with two decimal places.'); if (s.journals.length && currency !== s.currency) throw new Error('Currency cannot change after financial posting.'); s.currency = currency; break;
    }
    case 'property.add': {
      owner(); const id = uid(); const latitude = p.latitude === '' || p.latitude === undefined ? undefined : number(p.latitude, -90, 90); const longitude = p.longitude === '' || p.longitude === undefined ? undefined : number(p.longitude, -180, 180);
      const kind = p.kind === undefined ? 'building' : String(p.kind);
      if (kind !== 'building' && kind !== 'flat') throw new Error('Choose a building or an individual flat.');
      const flat = kind === 'flat' ? { flatNumber: text(p.flatNumber, 'Flat number'), buildingName: text(p.buildingName, 'Building / society'), floorName: text(p.floorName, 'Floor') } : {};
      s.properties.push({ id, kind, ...flat, name: text(p.name, 'Property name'), address: text(p.address, 'Address'), city: text(p.city, 'City'), state: text(p.state, 'State'), country: text(p.country || 'India', 'Country'), latitude, longitude, waterCan: reference(p.waterCan, 'Water CAN'), ptin: reference(p.ptin, 'Property tax PTIN') });
      if (kind === 'flat') {
        const floorId = uid();
        s.floors.push({ id: floorId, propertyId: id, name: flat.floorName!, order: 0 });
        s.units.push({ id: uid(), propertyId: id, floorId, name: flat.flatNumber!, kind: 'Flat', area: number(p.area || 0, 0, 1e7), order: 0, width: 1 });
      }
      propertyId = id; detail = `Added ${p.name}`; break;
    }
    case 'property.update': {
      owner(); property(); const record = find(s.properties, propertyId, 'Property'); const oldName = record.name;
      if ('kind' in p && p.kind !== (record.kind || 'building')) throw new Error('Property type cannot change after setup.');
      if (record.kind === 'flat') {
        for (const key of ['flatNumber', 'buildingName', 'floorName'] as const) if (key in p) record[key] = text(p[key], key);
        const unit = s.units.find(u => u.propertyId === record.id);
        if (unit) { if ('flatNumber' in p) unit.name = record.flatNumber!; if ('area' in p) unit.area = number(p.area || 0, 0, 1e7); }
        const floor = s.floors.find(f => f.propertyId === record.id);
        if (floor && 'floorName' in p) floor.name = record.floorName!;
      }
      for (const key of ['name', 'address', 'city', 'state', 'country'] as const) if (key in p) record[key] = text(p[key], key);
      for (const key of ['waterCan', 'ptin'] as const) if (key in p) record[key] = reference(p[key], key === 'waterCan' ? 'Water CAN' : 'Property tax PTIN');
      if ('latitude' in p) record.latitude = p.latitude === '' || p.latitude == null ? undefined : number(p.latitude, -90, 90);
      if ('longitude' in p) record.longitude = p.longitude === '' || p.longitude == null ? undefined : number(p.longitude, -180, 180);
      detail = `Updated property ${oldName}${oldName !== record.name ? ` → ${record.name}` : ''}`; break;
    }
    case 'floor.add': { property(); if (find(s.properties, propertyId, 'Property').kind === 'flat') throw new Error('An individual flat does not need additional floors.'); s.floors.push({ id: uid(), propertyId: propertyId!, name: text(p.name, 'Floor name'), order: number(p.order, -20, 300) }); break; }
    case 'unit.add': {
      property(); const f = find(s.floors, p.floorId, 'Floor'); if (f.propertyId !== propertyId) throw new Error('Floor belongs to a different property.');
      if (find(s.properties, propertyId, 'Property').kind === 'flat') throw new Error('An individual flat already has its rentable unit.');
      if (s.units.some(u => u.propertyId === propertyId && u.name === p.name && !u.archived)) throw new Error('Unit name already exists.');
      s.units.push({ id: uid(), propertyId: propertyId!, floorId: f.id, name: text(p.name, 'Unit name'), kind: text(p.kind, 'Unit type'), area: number(p.area, 0, 1e7), order: s.units.filter(u => u.floorId === f.id).length, width: number(p.width || 1, 1, 4) }); break;
    }
    case 'unit.layout': { const u = find(s.units, p.unitId, 'Unit'); property(u.propertyId); const f = find(s.floors, p.floorId, 'Floor'); if (f.propertyId !== u.propertyId) throw new Error('Cannot move between properties.'); u.floorId = f.id; u.order = number(p.order, 0, 10000); u.width = number(p.width, 1, 4); break; }
    case 'unit.archive': { const u = find(s.units, p.unitId, 'Unit'); property(u.propertyId); if (s.leases.some(l => l.unitIds.includes(u.id) && !l.ended && l.end >= today(s.timezone))) throw new Error('End the active agreement before archiving this unit.'); u.archived = true; break; }
    case 'tenant.add': { property(); s.tenants.push({ id: uid(), propertyId: propertyId!, name: text(p.name, 'Tenant name'), email: text(p.email, 'Email', false), phone: text(p.phone, 'Phone', false), notes: text(p.notes, 'Notes', false) }); break; }
    case 'tenant.update': {
      const tenant = find(s.tenants, p.tenantId, 'Tenant'); property(tenant.propertyId); const oldName = tenant.name;
      if ('name' in p) tenant.name = text(p.name, 'Tenant name');
      for (const key of ['email', 'phone', 'notes'] as const) if (key in p) tenant[key] = text(p[key], key, false);
      detail = `Updated tenant ${oldName}${oldName !== tenant.name ? ` → ${tenant.name}` : ''}`; break;
    }
    case 'tenant.remove': {
      const tenant = find(s.tenants, p.tenantId, 'Tenant'); property(tenant.propertyId);
      if (s.leases.some(l => l.tenantId === tenant.id)) throw new Error('This tenant has agreement history. Archive the tenant instead to preserve their records.');
      s.tenants = s.tenants.filter(t => t.id !== tenant.id); detail = `Deleted unused tenant ${tenant.name}`; break;
    }
    case 'tenant.archive': {
      const tenant = find(s.tenants, p.tenantId, 'Tenant'); property(tenant.propertyId);
      if (s.leases.some(l => l.tenantId === tenant.id && !l.ended && l.end >= today(s.timezone))) throw new Error('Record move-out or end the active/future agreement before archiving this tenant.');
      tenant.archived = true; detail = `Archived tenant ${tenant.name}; history retained`; break;
    }
    case 'tenant.restore': {
      const tenant = find(s.tenants, p.tenantId, 'Tenant'); property(tenant.propertyId); tenant.archived = false; detail = `Restored tenant ${tenant.name}`; break;
    }
    case 'lease.add': {
      property(); const unitIds = Array.isArray(p.unitIds) ? p.unitIds.map(String) : [String(p.unitId)]; if (!unitIds.length || new Set(unitIds).size !== unitIds.length) throw new Error('Select distinct units.');
      for (const id of unitIds) { const u = find(s.units, id, 'Unit'); if (u.archived || u.propertyId !== propertyId || u.kind === 'Common area') throw new Error('Choose an available rentable unit in this property.'); }
      const start = date(p.start), end = date(p.end); if (end < start || Date.parse(end) - Date.parse(start) > 30 * 366 * 86400000) throw new Error('Agreement end must follow its start, within 30 years.');
      if (s.leases.some(l => l.unitIds.some(id => unitIds.includes(id)) && l.start <= end && (l.ended || l.end) >= start)) throw new Error('An agreement already occupies this unit during those dates.');
      const tenant = find(s.tenants, p.tenantId, 'Tenant'); if (tenant.propertyId !== propertyId) throw new Error('Tenant belongs to a different property.'); if (tenant.archived) throw new Error('Restore this tenant before creating an agreement.'); const l: Lease = { id: uid(), propertyId: propertyId!, tenantId: String(p.tenantId), unitIds, start, end, rent: positive(p.rent), deposit: money(p.deposit || 0), dueDay: integer(p.dueDay, 1, 31), noticeDays: integer(p.noticeDays ?? 30, 0, 365), recurring: money(p.recurring || 0), escalationPercent: number(p.escalationPercent || 0, 0, 100), escalationDate: p.escalationDate ? date(p.escalationDate) : '' }; if (l.escalationDate && !l.escalationDate.endsWith('-01')) throw new Error('Rent increases must start on the first of a month.'); s.leases.push(l); generateCharges(s, today(s.timezone), new Set([propertyId!])); break;
    }
    case 'lease.end': { const l = lease(); const d = date(p.date); unlocked(s, d); if (l.ended) throw new Error('This agreement has already ended.'); if (d < l.start || d > l.end || d > today(s.timezone)) throw new Error('Move-out must be within the agreement dates and no later than today.'); l.ended = d; const [y, m] = d.split('-').map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate(); const monthEnd = `${d.slice(0, 7)}-${String(days).padStart(2, '0')}`; const originalTo = l.end < monthEnd ? l.end : monthEnd; for (const c of s.charges.filter(c => c.leaseId === l.id && (c.date > d || c.key.includes(`:${d.slice(0, 7)}`)))) { const originalDays = Math.round((Date.parse(originalTo) - Date.parse(c.date)) / 86400000) + 1; const stayed = Math.round((Date.parse(d) - Date.parse(c.date)) / 86400000) + 1; const reduction = c.date > d ? c.amount : d < originalTo ? c.amount - Math.round(c.amount * stayed / originalDays) : 0; if (reduction > 0) s.approvals.push({ id: uid(), propertyId: l.propertyId, kind: 'charge-credit', amount: reduction, sourceId: c.id, leaseId: l.id, accountId: s.accounts[0].id, date: c.date > d ? c.date : d, reason: `Move-out proration · ${c.description}`, requestedBy: actor.name, status: 'pending' }); } break; }
    case 'charges.generate': { const through = date(p.date); if (through > today(s.timezone)) throw new Error('Generate charges only through today.'); const allowed = new Set(s.properties.filter(p => accessible(actor, p.id)).map(p => p.id)); generateCharges(s, through, allowed); generateBills(s, through, allowed); break; }
    case 'charge.add': { const l = lease(); const d = date(p.date); const kind = String(p.kind); if (!['rent', 'utility', 'maintenance'].includes(kind)) throw new Error('Invalid charge type.'); makeCharge(s, l, positive(p.amount), d, date(p.due), text(p.description, 'Description'), command.id, kind as 'rent'); break; }
    case 'opening.tenant': {
      owner(); const l = lease(), d = date(p.date); unlocked(s, d); if (s.charges.some(c => c.leaseId === l.id && c.key.startsWith('opening:')) || s.receipts.some(r => r.leaseId === l.id && r.opening)) throw new Error('Opening tenant balances already exist for this agreement.'); if (s.charges.some(c => c.leaseId === l.id && c.date <= d)) throw new Error('Choose an opening date before the first generated charge.');
      const arrears = money(p.arrears || 0), deposit = money(p.deposit || 0), advance = money(p.advance || 0), id = uid(); if (!arrears && !deposit && !advance) throw new Error('Enter at least one opening balance.'); const lines: JournalLine[] = [];
      if (arrears) { s.charges.push({ id, propertyId: l.propertyId, leaseId: l.id, date: d, due: d, amount: arrears, kind: 'rent', description: 'Opening rent arrears', key: `opening:${l.id}` }); lines.push(dr('receivable', arrears), cr('owner-capital', arrears)); }
      for (const [kind, amount] of [['deposit', deposit], ['advance', advance]] as const) { if (!amount) continue; const receiptId = uid(); s.receipts.push({ id: receiptId, propertyId: l.propertyId, leaseId: l.id, date: d, amount, withholding: 0, kind, accountId: s.accounts[0].id, method: 'Opening balance', reference: id, payer: find(s.tenants, l.tenantId, 'Tenant').name, collector: actor.name, allocations: [], opening: true }); lines.push(dr('owner-capital', amount), cr(kind === 'deposit' ? 'deposit-liability' : 'tenant-credit', amount)); }
      post(s, l.propertyId, d, id, 'Opening tenant balances', lines); break;
    }
    case 'receipt.add': {
      const l = lease(), d = date(p.date), amount = positive(p.amount), withholding = money(p.withholding || 0), accountId = account(); const kind = String(p.kind); if (!['rent', 'deposit', 'advance'].includes(kind)) throw new Error('Invalid payment type.'); if (kind !== 'rent' && withholding) throw new Error('Withholding is only supported on rent receipts.');
      const allocations = kind === 'rent' ? allocate(s, l.id, amount + withholding, p.allocations as { chargeId: string; amount: number }[] | undefined, d).map(a => ({ ...a, date: d })) : [];
      const used = allocations.reduce((n, a) => n + a.amount, 0), id = uid();
      s.receipts.push({ id, propertyId: propertyId!, leaseId: l.id, date: d, amount, withholding, kind: kind as 'rent', accountId, method: text(p.method, 'Payment method'), reference: text(p.reference, 'Reference', false), payer: text(p.payer || find(s.tenants, l.tenantId, 'Tenant').name, 'Payer'), collector: actor.name, allocations, evidence: p.evidence ? String(p.evidence) : undefined });
      const lines = [dr(accountId, amount)]; if (withholding) lines.push(dr('withholding-receivable', withholding)); if (kind === 'deposit') lines.push(cr('deposit-liability', amount)); else { if (used) lines.push(cr('receivable', used)); if (amount + withholding > used) lines.push(cr('tenant-credit', amount + withholding - used)); }
      post(s, propertyId!, d, id, `${kind === 'deposit' ? 'Deposit' : 'Payment'} · ${p.payer || find(s.tenants, l.tenantId, 'Tenant').name}`, lines); detail = `Recorded ${kind} payment`; break;
    }
    case 'bill.add': {
      property(); const amount = positive(p.amount), tax = money(p.tax || 0); if (tax > amount) throw new Error('Tax cannot exceed the bill total.'); const d = date(p.date), id = uid(); const unitId = p.unitId ? String(p.unitId) : undefined; if (unitId && find(s.units, unitId, 'Unit').propertyId !== propertyId) throw new Error('Unit belongs to another property.');
      const category = text(p.category, 'Category'); const b: Bill = { id, propertyId: propertyId!, unitId, date: d, due: date(p.due), vendor: text(p.vendor, 'Vendor'), category, amount, tax, description: text(p.description, 'Description'), evidence: p.evidence ? String(p.evidence) : undefined, maintenanceId: p.maintenanceId ? String(p.maintenanceId) : undefined };
      if (b.maintenanceId && find(s.maintenance, b.maintenanceId, 'Maintenance').propertyId !== propertyId) throw new Error('Maintenance belongs to another property.');
      if (p.allocationMethod) { const units = s.units.filter(u => u.propertyId === propertyId && !u.archived && u.kind !== 'Common area'); if (!units.length) throw new Error('Add units before allocating shared costs.'); const weights = units.map(u => p.allocationMethod === 'area' ? u.area : p.allocationMethod === 'manual' ? number((p.weights as Record<string, number>)?.[u.id] || 0, 0, 100) : 1); const total = weights.reduce((n, w) => n + w, 0); if (!total || (p.allocationMethod === 'manual' && Math.abs(total - 100) > .001)) throw new Error('Allocation weights must be positive and manual percentages must total 100.'); const shares = weights.map(w => Math.floor(amount * w / total)); let left = amount - shares.reduce((n, x) => n + x, 0); const ranked = weights.map((w, i) => ({ i, fraction: amount * w / total - shares[i] })).sort((a, b) => b.fraction - a.fraction); for (const { i } of ranked) { if (!left) break; shares[i]++; left--; } b.allocations = units.map((u, i) => ({ unitId: u.id, amount: shares[i] })); }
      if (p.recurrence) { if (p.recurrence !== 'monthly') throw new Error('Unsupported recurrence.'); b.recurrence = 'monthly'; } s.bills.push(b); const expenseAccount = category === 'Capital improvement' ? 'capital-assets' : category === 'Loan principal' ? 'loan-liability' : `expense:${category}`; post(s, propertyId!, d, id, b.description, [dr(expenseAccount, amount), cr('payable', amount)]); break;
    }
    case 'bill.recurrence.stop': { const b = find(s.bills, p.billId, 'Bill'); property(b.propertyId); b.recurrenceEnd = date(p.date); detail = `Stopped recurring bill after ${b.recurrenceEnd}`; break; }
    case 'bill.pay': { const b = find(s.bills, p.billId, 'Bill'); property(b.propertyId); const amount = positive(p.amount), d = date(p.date), id = uid(), accountId = account(); if (d < b.date) throw new Error('Bill payment cannot predate the bill.'); if (amount > billBalance(s, b.id)) throw new Error('Payment exceeds the unpaid bill.'); s.billPayments.push({ id, propertyId: propertyId!, billId: b.id, amount, date: d, accountId, reference: text(p.reference, 'Reference', false) }); post(s, propertyId!, d, id, `Paid ${b.vendor}`, [dr('payable', amount), cr(accountId, amount)]); break; }
    case 'transfer': { property(); const from = account(p.from), to = account(p.to); if (from === to) throw new Error('Choose two different accounts.'); const amount = positive(p.amount); post(s, propertyId!, date(p.date), uid(), text(p.description || 'Account transfer', 'Description'), [dr(to, amount), cr(from, amount)]); break; }
    case 'contribution': { owner(); property(); const amount = positive(p.amount); post(s, propertyId!, date(p.date), uid(), text(p.description || 'Owner contribution', 'Description'), [dr(account(), amount), cr('owner-capital', amount)]); break; }
    case 'account.add': { owner(); const kind = String(p.kind); if (!['bank', 'cash'].includes(kind)) throw new Error('Invalid account type.'); s.accounts.push({ id: uid(), name: text(p.name, 'Account name'), kind: kind as 'bank' }); break; }
    case 'maintenance.add': { property(); const unitId = String(p.unitId || ''); if (unitId && find(s.units, unitId, 'Unit').propertyId !== propertyId) throw new Error('Unit belongs to another property.'); s.maintenance.push({ id: uid(), propertyId: propertyId!, unitId, title: text(p.title, 'Issue'), vendor: text(p.vendor, 'Vendor', false), estimate: money(p.estimate || 0), status: 'reported', date: date(p.date), notes: text(p.notes, 'Notes', false) }); break; }
    case 'maintenance.status': { const m = find(s.maintenance, p.maintenanceId, 'Maintenance'); property(m.propertyId); if (!['reported', 'assigned', 'in progress', 'completed', 'cancelled'].includes(String(p.status))) throw new Error('Invalid maintenance status.'); m.status = p.status as typeof m.status; break; }
    case 'meter.add': { const l = lease(), unitId = String(p.unitId); if (!l.unitIds.includes(unitId)) throw new Error('Meter unit must belong to the agreement.'); const current = number(p.current, 0, 1e12), previous = number(p.previous, 0, current), rate = money(p.rate); const last = s.meters.filter(m => m.unitId === unitId && m.kind === p.kind).sort((a, b) => b.date.localeCompare(a.date))[0]; if (last && (last.current !== previous || date(p.date) <= last.date)) throw new Error('Reading must follow the previous reading and its date.'); const id = uid(), d = date(p.date); s.meters.push({ id, propertyId: propertyId!, unitId, leaseId: l.id, current, previous, rate, date: d, kind: text(p.kind, 'Meter type') }); const amount = Math.round((current - previous) * rate); if (amount) makeCharge(s, l, amount, d, d, `${p.kind} · ${current - previous} units`, id, 'utility'); break; }
    case 'approval.request': { property(); const kind = String(p.kind); if (!['refund', 'deduction', 'withdrawal', 'reversal', 'writeoff', 'charge-credit'].includes(kind)) throw new Error('Invalid approval type.'); const a: Approval = { id: uid(), propertyId: propertyId!, kind: kind as Approval['kind'], amount: positive(p.amount), accountId: account(), date: date(p.date), reason: text(p.reason, 'Reason'), requestedBy: actor.name, status: 'pending', leaseId: p.leaseId ? String(p.leaseId) : undefined, sourceId: p.sourceId ? String(p.sourceId) : undefined }; unlocked(s, a.date); if (a.leaseId && find(s.leases, a.leaseId, 'Agreement').propertyId !== propertyId) throw new Error('Agreement belongs to another property.'); if (['refund', 'deduction'].includes(kind) && !a.leaseId) throw new Error('Select an agreement.'); s.approvals.push(a); break; }
    case 'approval.decide': {
      owner(); const a = find(s.approvals, p.approvalId, 'Approval'); property(a.propertyId); if (a.status !== 'pending') throw new Error('This request has already been decided.'); a.decidedBy = actor.name;
      if (!p.approved) { a.status = 'rejected'; break; } unlocked(s, a.date);
      if (a.kind === 'refund' || a.kind === 'deduction') { if (a.amount > Math.min(depositBalance(s, a.leaseId), depositBalance(s, a.leaseId, a.date))) throw new Error('Amount exceeds the refundable deposit available on this date.'); post(s, a.propertyId, a.date, a.id, a.reason, [dr('deposit-liability', a.amount), cr(a.kind === 'refund' ? a.accountId : 'recovery-income', a.amount)]); }
      if (a.kind === 'withdrawal') post(s, a.propertyId, a.date, a.id, a.reason, [dr('owner-drawings', a.amount), cr(a.accountId, a.amount)]);
      if (a.kind === 'writeoff') { const c = find(s.charges, a.sourceId, 'Charge'); if (a.date < c.date) throw new Error('Correction cannot predate its charge.'); if (c.propertyId !== a.propertyId || a.amount > chargeBalance(s, c.id)) throw new Error('Write-off exceeds the property charge balance.'); post(s, a.propertyId, a.date, a.id, a.reason, [dr('expense:Write-off', a.amount), cr('receivable', a.amount)]); }
      if (a.kind === 'charge-credit') { const c = find(s.charges, a.sourceId, 'Charge'); if (a.date < c.date) throw new Error('Correction cannot predate its charge.'); const previous = s.approvals.filter(x => x.status === 'approved' && ['charge-credit', 'writeoff'].includes(x.kind) && x.sourceId === c.id).reduce((n, x) => n + x.amount, 0); if (c.propertyId !== a.propertyId || a.amount + previous > c.amount) throw new Error('Credit exceeds the original charge.'); const unsettled = Math.max(0, chargeBalance(s, c.id)); const used = Math.min(a.amount, unsettled), excess = a.amount - used; const lines = [dr(c.kind === 'rent' ? 'rent-income' : 'recovery-income', a.amount)]; if (used) lines.push(cr('receivable', used)); if (excess) { lines.push(cr('tenant-credit', excess)); let left = excess; a.creditMoves = []; for (const receipt of s.receipts.filter(r => !r.reversed && r.leaseId === c.leaseId).reverse()) { const effective = effectiveAllocations(s, receipt).filter(x => x.chargeId === c.id).reduce((n, x) => n + x.amount, 0); const moved = Math.min(left, effective); if (moved) { if (receipt.date > a.date || receipt.allocations.some(x => x.chargeId === c.id && (x.date || receipt.date) > a.date)) throw new Error('Date the credit after the payment allocations it corrects.'); a.creditMoves.push({ receiptId: receipt.id, chargeId: c.id, amount: moved }); } left -= moved; } if (left) throw new Error('Unable to trace the overpaid charge.'); } post(s, a.propertyId, a.date, a.id, a.reason, lines); }
      if (a.kind === 'reversal') { const source = s.receipts.find(r => r.id === a.sourceId) || s.billPayments.find(b => b.id === a.sourceId); if (!source || source.propertyId !== a.propertyId || source.reversed) throw new Error('Select an unreversed receipt or bill payment from this property.'); if ('opening' in source && source.opening) throw new Error('Opening balances are not cash receipts. Use an owner-approved adjustment rather than reversing a collection.'); if (source.amount !== a.amount) throw new Error('Reversal must match the full source amount.'); if (a.date < source.date) throw new Error('Reversal cannot predate the source payment.'); const journals = s.journals.filter(j => j.sourceId === source.id && !j.reversalOf); if (journals.some(j => j.date > a.date)) throw new Error('Reversal must be dated after all allocations of this payment.'); for (const j of journals) post(s, j.propertyId, a.date, a.id, `Reversal: ${j.description}`, j.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit })), j.id); if (s.approvals.some(x => x.status === 'approved' && x.date > a.date && x.creditMoves?.some(m => m.receiptId === source.id))) throw new Error('Reversal must follow the credits applied to this payment.'); const moved = s.approvals.filter(x => x.status === 'approved').flatMap(x => x.creditMoves || []).filter(x => x.receiptId === source.id).reduce((n, x) => n + x.amount, 0); if (moved) post(s, a.propertyId, a.date, a.id, 'Reverse credited payment allocation', [dr('tenant-credit', moved), cr('receivable', moved)]); source.reversed = true; if ('kind' in source && source.kind === 'deposit' && depositBalance(s, source.leaseId) < 0) throw new Error('This deposit has refunds or deductions. Correct the settlement before reversing its collection.'); }
      a.status = 'approved'; break;
    }
    case 'period.close': { owner(); const d = date(p.date); if (d > today(s.timezone)) throw new Error('Cannot close a future period.'); s.closedThrough = d; detail = `Closed through ${d}`; break; }
    case 'period.reopen': { owner(); detail = text(p.reason, 'Reason for reopening'); s.closedThrough = ''; break; }
    case 'statement.import': { property(); const accountId = account(); if (!Array.isArray(p.rows) || p.rows.length > 5000) throw new Error('Import up to 5,000 statement rows.'); for (const row of p.rows as Record<string, unknown>[]) { const d = date(row.date), description = text(row.description, 'Description'), amount = Number(row.amount); if (!Number.isSafeInteger(amount) || !amount) throw new Error('Statement amount must be a signed amount in minor units.'); const fingerprint = `${propertyId}:${accountId}:${d}:${amount}:${String(row.reference || description)}`; if (!s.statements.some(x => x.fingerprint === fingerprint)) s.statements.push({ id: uid(), propertyId: propertyId!, accountId, date: d, description, amount, fingerprint, matchedIds: [] }); } break; }
    case 'statement.match': { const line = find(s.statements, p.lineId, 'Statement line'); property(line.propertyId); const ids = Array.isArray(p.journalIds) ? p.journalIds.map(String) : []; if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Select distinct journal records.'); let amount = 0; for (const id of ids) { const j = find(s.journals, id, 'Journal'); if (j.propertyId !== line.propertyId || s.statements.some(x => x.id !== line.id && x.matchedIds.includes(id))) throw new Error('Journal is unavailable or already matched.'); amount += j.lines.filter(l => l.account === line.accountId).reduce((n, l) => n + l.debit - l.credit, 0); } if (amount !== line.amount) throw new Error('Selected records must exactly match the statement amount.'); line.matchedIds = ids; break; }
    case 'opening.import': { owner(); property(); const d = date(p.date); if (s.journals.some(j => j.propertyId === propertyId)) throw new Error('Opening balances must be imported before posting property transactions.'); const rows = p.rows as { account: string; debit: number; credit: number }[]; if (!Array.isArray(rows) || !rows.length) throw new Error('Provide balanced opening rows.'); const allowed = new Set([...s.accounts.map(a => a.id), 'owner-capital', 'loan-principal', 'loan-liability', 'capital-assets']); for (const r of rows) { if (!allowed.has(r.account)) throw new Error('Use account balances and owner capital here; import tenant balances through charges/deposit receipts to retain their detail.'); money(r.debit); money(r.credit); } post(s, propertyId!, d, uid(), 'Opening balances', rows); break; }
    case 'evidence.add': { property(); s.evidence.push({ id: String(p.id), propertyId: propertyId!, name: text(p.name, 'File name'), path: text(p.path, 'File path'), sensitive: Boolean(p.sensitive) }); break; }
    default: throw new Error('Unknown operation.');
  }
  s.audit.unshift({ id: uid(), actor: actor.name, date: new Date().toISOString(), action: command.type, propertyId, detail }); s.commandIds.push(command.id); return s;
}
export function projectState(s: WorkspaceState, actor: Actor): WorkspaceState {
  if (actor.role === 'owner') return structuredClone(s);
  const out = structuredClone(s); const allow = (id: string) => accessible(actor, id);
  out.properties = out.properties.filter(p => allow(p.id));
  for (const key of ['floors', 'units', 'leases', 'charges', 'receipts', 'bills', 'billPayments', 'journals', 'maintenance', 'meters', 'approvals', 'statements', 'evidence'] as const) (out[key] as { propertyId: string }[]) = out[key].filter(x => allow(x.propertyId));
  const tenants = new Set(out.leases.map(l => l.tenantId)); out.tenants = out.tenants.filter(t => tenants.has(t.id) || allow(t.propertyId));
  out.audit = out.audit.filter(a => a.propertyId && allow(a.propertyId)); out.commandIds = []; out.reserve = 0;
  if (actor.role === 'viewer') { out.tenants = out.tenants.map(t => ({ ...t, email: '', phone: '', notes: '' })); out.evidence = out.evidence.filter(e => !e.sensitive); out.accounts = out.accounts.map(a => ({ ...a, name: a.kind === 'bank' ? 'Bank account' : a.name })); }
  return out;
}
export function metrics(s: WorkspaceState, from: string, to: string) {
  const inRange = (d: string) => d >= from && d <= to;
  const journals = s.journals.filter(j => inRange(j.date)); const net = (prefix: string) => journals.flatMap(j => j.lines).filter(l => l.account.startsWith(prefix)).reduce((n, l) => n + l.credit - l.debit, 0);
  const rent = net('rent-income'), recovery = net('recovery-income'), expenses = -net('expense:');
  const accounts = new Set(s.accounts.map(a => a.id)); const cashLines = journals.flatMap(j => j.lines).filter(l => accounts.has(l.account));
  const due = s.charges.filter(c => c.kind === 'rent' && inRange(c.due)); const dueTotal = due.reduce((n, c) => n + c.amount - s.approvals.filter(a => a.kind === 'charge-credit' && a.status === 'approved' && a.sourceId === c.id && a.date <= to).reduce((m, a) => m + a.amount, 0), 0); const dueIds = new Set(due.map(c => c.id)); const settled = s.receipts.filter(r => receiptActiveAt(s, r, to)).flatMap(r => effectiveAllocations(s, r, to)).filter(a => dueIds.has(a.chargeId)).reduce((n, a) => n + a.amount, 0);
  const active = s.leases.filter(l => l.start <= to && (l.ended || l.end) >= to); const units = s.units.filter(u => !u.archived && u.kind !== 'Common area'); const occupied = new Set(active.flatMap(l => l.unitIds));
  const cash = s.accounts.reduce((n, a) => n + accountBalance(s, a.id, to), 0);
  const deposits = s.journals.filter(j => j.date <= to).flatMap(j => j.lines).filter(l => l.account === 'deposit-liability').reduce((n, l) => n + l.credit - l.debit, 0);
  const credits = s.journals.filter(j => j.date <= to).flatMap(j => j.lines).filter(l => l.account === 'tenant-credit').reduce((n, l) => n + l.credit - l.debit, 0);
  const payable = s.journals.filter(j => j.date <= to).flatMap(j => j.lines).filter(l => l.account === 'payable').reduce((n, l) => n + l.credit - l.debit, 0);
  return { rent, recovery, expenses, noi: rent + recovery - expenses, dueTotal, settled, collectionRate: dueTotal ? settled / dueTotal * 100 : 0, occupancy: units.length ? [...occupied].filter(id => units.some(u => u.id === id)).length / units.length * 100 : 0, occupied: [...occupied].filter(id => units.some(u => u.id === id)).length, totalUnits: units.length, cash, deposits, credits, payable, estimatedAvailable: Math.max(0, cash - deposits - credits - payable - s.reserve), cashIn: cashLines.reduce((n, l) => n + l.debit, 0), cashOut: cashLines.reduce((n, l) => n + l.credit, 0), cashNet: cashLines.reduce((n, l) => n + l.debit - l.credit, 0) };
}
