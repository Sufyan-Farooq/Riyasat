import { chromium, expect } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run with a configured local app: npx tsx tests/google-auth.browser.ts
// Uses isolated OAuth/session fixtures; never signs in a real Google account.
const baseURL = process.env.UI_TEST_URL || 'http://localhost:3100';
const user = { id: 'google-fixture', aud: 'authenticated', role: 'authenticated', email: 'google@example.test', app_metadata: { provider: 'google' }, user_metadata: { name: 'Google fixture' }, created_at: '2026-01-01T00:00:00Z' };
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture-signature`;

async function verify() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      let authorizeRequests = 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname.endsWith('/auth/v1/authorize')) {
          authorizeRequests++;
          expect(url.searchParams.get('provider')).toBe('google');
          expect(url.searchParams.get('redirect_to')).toBe(`${baseURL}/`);
          return route.fulfill({ status: 302, headers: { location: `${baseURL}/#access_token=${token}&refresh_token=fixture-refresh&token_type=bearer&expires_in=3600&type=oauth` } });
        }
        if (url.pathname.startsWith('/auth/v1/')) return json(url.pathname.endsWith('/user') ? user : { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user });
        if (url.origin !== new URL(baseURL).origin) return route.abort();
        if (url.pathname === '/api/workspaces') return json({ workspaces: [] });
        return route.continue();
      });
      await page.goto(baseURL);
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await page.getByRole('button', { name: 'Create an account', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
      await page.screenshot({ path: join(tmpdir(), `riyasat-google-auth-${viewport.width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Continue with Google' }).click();
      await expect(page.getByRole('heading', { name: 'Start your estate' })).toBeVisible();
      expect(authorizeRequests).toBe(1);
      await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.goto(`${baseURL}/#error=access_denied&error_description=User+cancelled+sign-in`);
      // A real OAuth return loads a new document from the provider's origin.
      await page.reload();
      await expect(page.getByRole('status')).toContainText('Sign-in could not be completed');
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
      expect(new URL(page.url()).hash).toBe('');
      expect(errors).toEqual([]);
      console.log(`Google auth passed at ${viewport.width}px: sign-in/signup button, reset isolation, OAuth redirect, callback session, cancellation.`);
      await context.close();
    }
  } finally { await browser.close(); }
}
void verify().catch(error => { console.error(error); process.exitCode = 1; });
