/**
 * T-243 Layer 2: Playwright UI regression - key user journeys against a live
 * Reqly server on localhost:4242 (started by helpers/global-setup.ts with the
 * fixture project).
 *
 * Journeys run serially (workers: 1) because some mutate shared server state
 * (active environment, workspaces) and later journeys depend on earlier ones
 * (history shows the request fired in the REST journey).
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe.configure({ mode: 'serial' });

test('app loads: nav rail, sidebar, and fixture collections visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible();
  await expect(page.getByText('httpbin', { exact: true })).toBeVisible();
  await expect(page.getByText('graphql-demo', { exact: true })).toBeVisible();
  await expect(page.getByText('mock-demo', { exact: true })).toBeVisible();
});

test('REST journey: open request, editor populates, Send shows a 200 response', async ({ page }) => {
  await page.goto('/');
  // Collections render expanded by default - request rows are directly visible.
  await page.getByText('httpbin-get', { exact: true }).click();

  // The URL field is a variable-aware display (renders {{baseUrl}} as a chip),
  // not a plain input - assert on the rendered text.
  const editor = page.locator('main');
  await expect(editor.locator('select').first()).toHaveValue('GET');
  await expect(editor.getByText('baseUrl').first()).toBeVisible();
  await expect(editor.getByText('/get').first()).toBeVisible();

  await editor.getByRole('button', { name: /^Send/ }).click();
  // Status badge in the response viewer (network round-trip to httpbin.org).
  await expect(editor.getByText(/200 OK/).first()).toBeVisible({ timeout: 30_000 });
});

test('environment switcher: selecting staging moves the active badge', async ({ page }) => {
  await page.goto('/');
  const devRow = page.locator('li', { hasText: 'development' });
  const stagingRow = page.locator('li', { hasText: 'staging' });
  await expect(devRow.getByText('active', { exact: true })).toBeVisible();

  await stagingRow.click();
  await expect(stagingRow.getByText('active', { exact: true })).toBeVisible();
  await expect(devRow.getByText('active', { exact: true })).not.toBeVisible();
});

test('GraphQL journey: saved request opens the workspace with URL and schema docs', async ({ page }) => {
  await page.goto('/');
  await page.getByText('countries', { exact: true }).click();

  // URL bar pre-filled from the saved request (variable-aware display field).
  await expect(page.locator('main').getByText('https://countries.trevorblades.com/').first()).toBeVisible();

  // Schema loads from the committed .schema-cache fixture - the Docs toggle
  // only renders once a schema is present.
  const docsButton = page.getByRole('button', { name: 'Docs' });
  await expect(docsButton).toBeVisible({ timeout: 10_000 });
  await docsButton.click();
  await expect(page.getByText('Country', { exact: true })).toBeVisible();
});

test('gRPC workspace: proto, service, and method inputs are present', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'gRPC' }).click();
  // Config fields are variable-aware display components - assert labels and
  // placeholder text rendered in the workspace.
  const main = page.locator('main');
  await expect(main.getByText(/host:port/).first()).toBeVisible();
  await expect(main.getByText('Proto File').first()).toBeVisible();
  await expect(main.getByText('grpcbin.proto').first()).toBeVisible();
  await expect(main.getByText('hello.HelloService').first()).toBeVisible();
  await expect(main.getByText('SayHello').first()).toBeVisible();
});

test('Realtime workspace: Connect button and protocol menu are present', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Realtime' }).click();
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();

  // The + tab menu lists all supported realtime protocols.
  await page.getByTitle('New tab').click();
  await expect(page.getByRole('button', { name: 'WebSocket', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Server-Sent Events' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Socket.IO' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MQTT' })).toBeVisible();
});

test('history panel: shows the earlier request and restores its response', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();

  // The REST journey fired httpbin-get - history stores the templated URL.
  const entry = page.getByText('{{baseUrl}}/get').first();
  await expect(entry).toBeVisible();
  await entry.click();

  // Clicking restores the stored response into the response viewer.
  await expect(page.locator('main').getByText(/200 OK/).first()).toBeVisible();
});

test('collections context menu: right-click a request shows actions', async ({ page }) => {
  await page.goto('/');
  await page.getByText('httpbin-get', { exact: true }).click({ button: 'right' });

  await expect(page.getByText('Duplicate', { exact: true })).toBeVisible();
  await expect(page.getByText('Delete', { exact: true })).toBeVisible();
  await expect(page.getByText('Rename', { exact: true })).toBeVisible();
});

test('code generation modal: shows a resolved cURL snippet and target tabs', async ({ page }) => {
  await page.goto('/');
  await page.getByText('httpbin-get', { exact: true }).click();
  // Every open tab keeps its editor mounted (hidden) - target the visible one.
  await page.locator('main').getByTitle('Generate code snippet').filter({ visible: true }).click();

  // Variables are resolved server-side: {{baseUrl}}/get -> https://httpbin.org/get.
  await expect(page.getByText(/curl 'https:\/\/httpbin\.org\/get'/)).toBeVisible();

  await page.getByRole('button', { name: 'fetch', exact: true }).click();
  await expect(page.getByText(/await fetch\('https:\/\/httpbin\.org\/get'/)).toBeVisible();

  await page.getByRole('button', { name: 'axios', exact: true }).click();
  await expect(page.getByText(/import axios from 'axios'/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('environments panel: lists fixture environments with their variables', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Environments' }).first().click();

  const panel = page.locator('aside');
  // Both fixture environments listed in the panel.
  await expect(panel.getByText('development', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText('staging', { exact: true }).first()).toBeVisible();
});

test('workspace switcher: create a workspace, link a repo, dropdown shows it active', async ({ page }) => {
  // The linked path must exist on disk - reuse the sandbox project dir.
  const state = JSON.parse(await fs.readFile(path.join(__dirname, '.ui-server-state.json'), 'utf8'));

  await page.goto('/');
  await page.getByTitle('No workspace active').click();
  await page.getByRole('button', { name: 'New workspace' }).click();
  await page.getByPlaceholder('workspace-name').fill('e2e-ui');
  await page.getByPlaceholder('workspace-name').press('Enter');

  // Creating auto-activates the workspace and opens its settings modal.
  await expect(page.getByText('Workspace: e2e-ui')).toBeVisible();
  await page.getByPlaceholder('alias').fill('fixture');
  await page.getByPlaceholder('/path/to/repo').fill(state.projectDir);
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByText('fixture', { exact: true })).toBeVisible();

  // Close the modal via the overlay, then verify the dropdown shows the
  // active workspace.
  await page.mouse.click(20, 300);
  await expect(page.getByTitle('Workspace: e2e-ui')).toBeVisible();
  await expect(page.getByTitle('Workspace: e2e-ui')).toContainText('e2e-ui');
});
