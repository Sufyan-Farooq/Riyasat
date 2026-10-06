import { chromium, expect } from '@playwright/test';
import { applyCommand, emptyState } from '../lib/domain';
import type { Actor } from '../lib/types';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run against a locally running app: npx tsx tests/flat-property.browser.ts
// All authentication and workspace requests use isolated fixtures.
const baseURL = process.env.UI_TEST_URL || 'http://localhost:3100';
const actor: Actor = { id: 'browser-owner', name: 'Browser owner', role: 'owner', propertyIds: null };
const user = { id: actor.id, aud: 'authenticated', role: 'authenticated', email: 'browser@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: actor.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
async function verify() {
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    let state = emptyState('Browser verification'), version = 0;
    const errors: string[] = [];
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('console', message => { if (message.type() === 'error') console.log('Browser console:', message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.startsWith('/auth/v1/')) {
        return json(url.pathname.endsWith('/user') ? user : { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user });
      }
      if (url.origin !== new URL(baseURL).origin) return route.abort();
      if (url.pathname === '/api/workspaces') return json({ workspaces: [{ id: 'browser-workspace', name: state.name, actor }] });
      if (url.pathname === '/api/workspace/browser-workspace') {
        if (request.method() === 'POST') {
          try { state = applyCommand(state, request.postDataJSON(), actor); version++; }
          catch (error) { return json({ error: String(error) }, 400); }
        }
        return json({ state, actor, version });
      }
      if (url.pathname.startsWith('/api/')) return json({ error: 'Unexpected test API request' }, 400);
      return route.continue();
    });
    await page.goto(baseURL);
    console.log(`Checking ${viewport.width}px: sign in`);
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    console.log('Waiting for workspace');
    await page.getByRole('heading', { name: 'Your properties' }).waitFor();
    await page.getByRole('button', { name: 'Add property', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Flat number')).toHaveCount(0);
    await dialog.getByLabel('Property type').selectOption('flat');
    await dialog.getByLabel('Flat number').fill('302');
    await dialog.getByLabel('Building / society').fill('Garden Society');
    await dialog.getByLabel(/^Floor/).fill('Third floor');
    await dialog.getByLabel('Area (sq ft)').fill('900');
    await dialog.getByLabel('Property name').fill('Garden flat');
    await dialog.getByLabel('Street address').fill('Garden Road');
    await dialog.getByLabel('City', { exact: true }).fill('Hyderabad');
    await dialog.getByLabel('State / region').fill('Telangana');
    await dialog.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: join(tmpdir(), `riyasat-flat-form-${viewport.width}.png`), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Save record' }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.units).toHaveLength(1);
    await page.getByRole('button', { name: /Garden flat/ }).click();
    await expect(page.getByRole('heading', { name: 'Unit 302' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Floor', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add unit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Layout controls' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit property details' }).click();
    await dialog.getByLabel('Flat number').fill('303');
    await dialog.getByLabel(/^Floor/).fill('Fourth floor');
    await dialog.getByRole('button', { name: 'Save record' }).click();
    await expect(page.getByRole('heading', { name: 'Unit 303' })).toBeVisible();
    await expect(page.getByText('Fourth floor', { exact: true })).toBeVisible();
    await page.screenshot({ path: join(tmpdir(), `riyasat-flat-details-${viewport.width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Add property', exact: true }).click();
    await expect(dialog.getByLabel('Flat number')).toHaveCount(0);
    await dialog.getByLabel('Property name').fill('Test building');
    await dialog.getByLabel('Street address').fill('Main Road');
    await dialog.getByLabel('City', { exact: true }).fill('Hyderabad');
    await dialog.getByLabel('State / region').fill('Telangana');
    await dialog.getByRole('button', { name: 'Save record' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Test building', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Floor', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Build this property' })).toBeVisible();
    expect(state.units).toHaveLength(1);
    expect(errors).toEqual([]);
    console.log(`Browser verification passed at ${viewport.width}px (flat creation/editing, automatic details, building setup, no page errors).`);
    await context.close();
  }
} finally { await browser.close(); }
}
void verify().catch(error => { console.error(error); process.exitCode = 1; });
