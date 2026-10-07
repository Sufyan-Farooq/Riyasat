import { chromium, expect } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run against a locally running, configured app: npx tsx tests/password-recovery.browser.ts
// Auth requests are intercepted; no real email or password is changed.
const baseURL = process.env.UI_TEST_URL || 'http://localhost:3100';
const user = { id: 'recovery-user', aud: 'authenticated', role: 'authenticated', email: 'recovery@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;

async function verify() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      let workspaceRequests = 0, passwordUpdates = 0, rejectUpdate = true;
      let resetRedirect = '';
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname.startsWith('/auth/v1/')) {
          if (url.pathname.endsWith('/recover')) { resetRedirect = url.searchParams.get('redirect_to') || ''; return json({}); }
          if (url.pathname.endsWith('/logout')) return json({});
          if (url.pathname.endsWith('/user') && request.method() === 'PUT') {
            passwordUpdates++;
            expect(request.postDataJSON().password).toBe('new-fixture-password');
            if (rejectUpdate) return json({ msg: 'Please choose a different password.', code: 'same_password' }, 422);
          }
          return json(url.pathname.endsWith('/user') ? user : { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user });
        }
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (url.pathname === '/api/workspaces') { workspaceRequests++; return json({ workspaces: [] }); }
        return route.continue();
      });

      // The fragment alone must work when Supabase falls back to the site URL.
      await page.goto(`${baseURL}/#access_token=${token}&refresh_token=fixture-refresh&expires_in=3600&token_type=bearer&type=recovery`);
      await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save new password' })).toBeEnabled();
      expect(new URL(page.url()).searchParams.get('reset')).toBe('true');
      expect(workspaceRequests).toBe(0);
      await expect(page.getByRole('button', { name: 'Create an account', exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel('Confirm new password')).toBeVisible();
      expect(workspaceRequests).toBe(0);
      await page.getByLabel('New password', { exact: true }).fill('new-fixture-password');
      await page.getByLabel('Confirm new password').fill('wrong-fixture-password');
      await page.getByRole('button', { name: 'Save new password' }).click();
      await expect(page.getByRole('status')).toContainText('Passwords do not match');
      expect(passwordUpdates).toBe(0);
      await page.getByLabel('Confirm new password').fill('new-fixture-password');
      await page.getByRole('button', { name: 'Save new password' }).click();
      await expect(page.getByRole('status')).toContainText('Please choose a different password.');
      expect(workspaceRequests).toBe(0);
      await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
      await page.screenshot({ path: join(tmpdir(), `riyasat-password-recovery-${viewport.width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      rejectUpdate = false;
      await page.getByRole('button', { name: 'Save new password' }).click();
      await expect(page.getByRole('heading', { name: 'Start your estate' })).toBeVisible();
      expect(passwordUpdates).toBe(2);
      expect(workspaceRequests).toBe(1);
      expect(new URL(page.url()).searchParams.has('reset')).toBe(false);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Start your estate' })).toBeVisible();

      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.goto(`${baseURL}/?reset=true#error=access_denied&error_code=otp_expired&error_description=Link+expired`);
      await expect(page.getByRole('status')).toContainText('invalid or has expired');
      await expect(page.getByRole('button', { name: 'Save new password' })).toBeDisabled();
      await page.getByRole('button', { name: 'Request a new reset link' }).click();
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByRole('button', { name: 'Send reset link' }).click();
      await expect(page.getByRole('status')).toContainText('Check your email');
      expect(resetRedirect).toBe(`${baseURL}/?reset=true`);
      await page.getByRole('button', { name: 'Back to sign in' }).click();
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Start your estate' })).toBeVisible();
      expect(errors).toEqual([]);
      console.log(`Password recovery passed at ${viewport.width}px: fragment fallback, refresh, validation, API failure, save, expired link, resend, normal sign-in.`);
      await context.close();
    }
  } finally { await browser.close(); }
}
void verify().catch(error => { console.error(error); process.exitCode = 1; });
