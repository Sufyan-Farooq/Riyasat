'use client';
import type { Tenant } from '@/lib/types';

export default function TenantActions({ tenant, hasHistory, activeAgreement, busy, onEdit, onChange }: { tenant: Tenant; hasHistory: boolean; activeAgreement: boolean; busy: boolean; onEdit: () => void; onChange: (type: string) => void }) {
  const remove = () => {
    const message = hasHistory ? `Archive ${tenant.name}? Agreements, payments and balances will remain available in the archived view and reports.` : `Delete ${tenant.name}? This tenant has no agreements. This cannot be undone.`;
    if (window.confirm(message)) onChange(hasHistory ? 'tenant.archive' : 'tenant.remove');
  };
  return <div className="record-actions"><button className="secondary small" disabled={busy} onClick={onEdit}>Edit tenant</button>{tenant.archived ? <button className="secondary small" disabled={busy} onClick={() => onChange('tenant.restore')}>Restore tenant</button> : <button className="text-button danger" disabled={busy || hasHistory && activeAgreement} title={hasHistory && activeAgreement ? 'Record move-out before archiving this tenant.' : undefined} onClick={remove}>{hasHistory ? 'Archive tenant' : 'Delete tenant'}</button>}{hasHistory && activeAgreement && <span className="caption">Record move-out before archiving.</span>}</div>;
}
