# Riyasat

Property operations and financial transparency for owners, managers, and families. Next.js + TypeScript, with a pure financial domain engine and Supabase hosted storage/authentication.

## Run locally

```powershell
npm install
npm run dev
```

Complete the hosted setup below, then open http://localhost:3000. Without the required database and authentication configuration, the application shows a connection-required screen. There is no demo mode, seeded property/tenant/financial data, or local-storage business-data fallback. Verified users create an empty workspace and enter their own records; CSV templates contain column headers only.

```powershell
npm test
npm run typecheck
npm run build
```

## Hosted setup

1. Create a Supabase project. Run `supabase/migrations/001_workspace.sql` in its SQL editor. It creates workspaces, memberships, invitations, versioned workspace data, service-only transaction functions, and a private evidence bucket.
2. Copy `.env.example` to `.env.local`. Supply the project URL, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and **server-only `SUPABASE_SECRET_KEY`**. Never prefix the secret key with `NEXT_PUBLIC_`. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` variables are also supported.
3. Configure Supabase Auth email verification, the application site URL, and allowed password-reset redirect URLs (`http://localhost:3000/?reset=true` locally and your production URL). Configure transactional email delivery for production.
4. Restart the dev server. Register and verify your email, then create a workspace. In Settings → Account security, enroll a TOTP authenticator and verify it. Owner writes, private uploads, and access grants require an `aal2` session on the server.
5. Deploy to Vercel with the same environment variables and a long random `CRON_SECRET`. `vercel.json` calls `/api/cron` daily at 00:30 UTC. The endpoint requires the secret and returns HTTP 500 plus workspace IDs when any generation fails. Monitor this response and retry failures; retries cannot duplicate charges/bills.
6. Invite members from Settings and share the app URL yourself. The application does **not send invitation messages**. An invitation is accepted when a verified account signs in with the exact invited email; pending invitations expire after seven days. Owners can revoke membership and cancel invitations.

No remote account, database, or deployment has been provisioned by this repository. Hosted auth, SQL, MFA, storage and invitation flows require verification against your configured Supabase project before production use.

## Workflows

The Add property form accepts Google Maps place and dropped-pin links, including supported shortened share links. It fills coordinates from selected pins without an API key. To fill address, city, state and country, set the server-only `GOOGLE_MAPS_API_KEY` environment variable with Google Maps Platform's Geocoding API enabled and billing configured. Restrict the key to that API and set usage quotas. The lookup runs only for authenticated workspace owners. Review the returned address before saving; Google may omit individual address components. A map camera centre is never treated as the property pin. Manual entry remains available. Share links are followed only across the explicit Google Maps host allowlist.

- Properties, buildings represented by property records, named floors and rentable unit blocks; drag/reorder/resize plus keyboard-accessible layout controls; coordinates and external maps; private property documents.
- Owners can edit property names, addresses, map coordinates, water Consumer Account Numbers (CAN), and property-tax PTIN references. Billing identifiers are optional strings, preserve leading zeros, and do not automatically fetch or pay bills.
- Owners and assigned managers can edit tenant names, contact details and notes. Unused tenants with no agreements can be deleted after confirmation. Tenants with history are archived after active/future agreements end; archive preserves financial records and supports restoration. The Tenants screen has an archived view. Viewer access remains read-only.
- Tenants/co-tenant notes, agreements, scheduled monthly charges, due-day clamping, day-based proration, one dated rent increase, recurring tenant charges, end-of-tenancy credits and deposit settlement.
- Payments with payer, collector, method, destination, date/reference, partial allocations, withholding, advance rent and overpayments. Printable receipts and tenant statement exports.
- Bills separately from payments, partial settlement, included tax, recurring monthly bills, shared costs by equal shares, area or entered percentages, loan principal/interest and capital improvement categorisation.
- Maintenance issues, vendor/estimate, linked actual bills, status changes including cancellation/recovery; metered usage creates tenant charges.
- Owner approvals for deposit refunds/deductions, owner withdrawals, write-offs, charge credits and receipt/bill-payment reversals. Posted journals preserve financial history; closed periods block financial entries.
- Cash held by managers, cash-to-bank and other transfers, owner contributions, account balances and retained reserves.
- Bank CSV import, duplicate detection by date/amount/reference, multiple-journal exact matches. Atomic property/unit/tenant/agreement CSV imports and balanced opening account entries.
- Reports: income/expenses, cash flow, rent roll, aged arrears, deposits/advances, bills/maintenance, performance, family statement, audit trail. CSV export and print-to-PDF.

## Financial semantics

Amounts are integer minor units. This release supports currencies with two decimal places, one currency per workspace, with no foreign exchange. Currency locks after posting.

Income/expense reports use accrual accounting. Cash flow is separate. Deposits, tenant credits, transfers, owner contributions/withdrawals, loan principal, and capital improvements do not inflate operating performance. Cash in/out includes internal movements; transfers cancel in net cash flow.

Payments allocate to oldest outstanding charges by default; the domain API also accepts explicit allocations. Advance rent and overpayment credits apply on charge generation. Dates on allocation events and credit movements preserve historical reporting. Refundable deposits cannot pay rent implicitly.

End-of-tenancy changes produce pending owner-approved charge credits. Credits against fully paid charges create retained tenant credit, preserving original receipt allocations. Review requested credits before final settlement. A correction must follow the charge and payments it reclassifies; reversals must follow related credit events. A deposited collection with refunds/deductions cannot be reversed without first correcting settlement.

Estimated available funds deduct deposits, credits, unpaid bills and configured reserves. This is an estimate; it does not account for unrecorded liabilities or calculate family ownership entitlements.

## Architecture and access

The first release stores each workspace as a **versioned JSONB aggregate**, rather than a table per operational entity. API handlers authenticate the Supabase access token, check verified email/membership, execute tested domain commands, and atomically save via version compare-and-swap. A stale version returns 409; reload and retry. Do not retry by overwriting another user's state.

This is a deliberate implementation simplification: balanced journals and typed operational records are inside the aggregate. It suits small family portfolios; relational extraction, pagination and incremental analytics are required before large management-firm scale. The server reads the full aggregate, then projects only permitted property records for managers/viewers. Database RLS denies clients all direct aggregate access; do not add a browser read policy. The privileged key is only used in server modules.

Private files are uploaded through an authorised server endpoint. Downloads check current membership/property scope/sensitive flag and issue a 60-second signed URL. Public command endpoints cannot register arbitrary storage paths. Viewer exports use the same scoped state; identity/contact details are redacted.

Owner MFA is enforced for writes. Managers/viewers are not required to enroll MFA in this release. Platform Supabase administration remains separate and must stay with trusted administrators.

## Import and operational limits

- CSV import previews raw rows and validates each record; property/unit/tenant/agreement batches are all-or-nothing, max 500 records. Statement imports support up to 5,000 rows. Statement duplicate fingerprints assume a unique reference; distinct identical unreferenced transactions need different references.
- Opening account balances support bank/cash, capital assets, owner capital and loan balances before any property journal posts. The separate tenant opening-balances import records arrears, refundable deposits and advance balances against owner capital without creating new cash or rental income. Use an opening date before the first generated charge and do not include tenant receivables/liabilities again in the account import. These entries need accountant review; this release does not import a full historic accounting ledger.
- A property represents one building/site; separately named multiple buildings should be separate properties. The builder is schematic, not a measured floor-plan editor. UI agreement creation selects one unit; the domain supports multiple distinct units.
- Taxes/withholding are manually entered, effective rules are not calculated, and no tax returns or legal filings are made. Included bill tax is recorded but does not automatically create input-tax credits. Review local tenancy, privacy and tax requirements before deployment.
- No tenant portal, payment gateway, direct bank feed, automated SMS/WhatsApp, shareholder entitlement calculations, 3D modelling or foreign-exchange reporting.
- Evidence currently attaches at property level; maintenance bills link to issues. Identity documents can be marked restricted; do not require Aadhaar by default. No automated retention/deletion policy is applied yet.
- Configured reserves are workspace-wide. Single-property/member-scoped views omit them rather than inventing a distribution.
- Reports that say current deposit/advance or unpaid balances use current records; income/cash/performance and arrears use the selected reporting period/cutoff.

## Verification and launch

The automated domain suite covers partial payments, deposits versus income, transfers, excess credit, tax withholding, partial bills, approval enforcement, reversals, closed periods, access projection, idempotency, bank matching, overlap rejection, atomic imports, proration, CSV formula protection, backup serialisation, dated charge-credit corrections and tiny allocation rounding.

Before using real records, verify hosted flows with two independent workspaces and each role; confirm that direct database/storage access is denied; test owner MFA, invitation expiry and revocation; test scheduler retries and a concurrent-edit conflict; reconcile a sample month with bank statements. Configure provider database backup/PITR appropriate to your plan and perform a restoration into a separate staging project. Workspace JSON exports are supplemental backups, not a replacement for database and private-file backups. Hosted backup restoration has not been tested without a configured project.
