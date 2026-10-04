import { test, expect } from './fixtures.js';

const PROMETHEUS_PASTE = [
  '# HELP container_memory_working_set_bytes Current working set',
  'container_memory_working_set_bytes{container="api",pod="api-7c9"}',
  '472289689 @1727260000.123',
  '659972505 @1727260015.123',
  'container_memory_working_set_bytes{container="POD",pod="api-7c9"}',
  '520192 @1727260000.123'
].join('\n');

const PLATFORM_COUNT = 10;
const K8S_REFERENCE_MANIFEST = 'resources:\n  requests:\n    memory: "608Mi"\n  limits:\n    memory: "832Mi"';

const averageInput = (page) => page.getByRole('spinbutton', { name: /^Average usage/ });
const peakInput = (page) => page.getByRole('spinbutton', { name: /^Peak usage/ });
const currentNavLink = (page) => page.locator('.site-nav [aria-current="page"]');

async function fillUsage(page, average, peak) {
  await averageInput(page).fill(String(average));
  await peakInput(page).fill(String(peak));
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('landing page links to every calculator without relying on JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('[data-platform-card]')).toHaveCount(PLATFORM_COUNT);
  await expect(page.locator('.site-nav a')).toHaveCount(PLATFORM_COUNT);
  await context.close();
});

test('nav dropdown opens, navigates, and closes on Escape or an outside click', async ({ page }) => {
  await page.goto('/kubernetes/');
  const toggle = page.locator('.site-nav__toggle');
  const list = page.locator('.site-nav__list');
  await expect(toggle).toContainText('Kubernetes');
  await expect(list).toBeHidden();

  await toggle.click();
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.locator('h1').click();
  await expect(list).toBeHidden();

  await toggle.click();
  await page.getByRole('link', { name: 'Redis maxmemory' }).click();
  await expect(page).toHaveURL(/\/redis\/$/);
  await expect(currentNavLink(page)).toHaveText('Redis maxmemory');
});

test('Kubernetes: manual values produce the expected manifest', async ({ page }) => {
  await page.goto('/kubernetes/');
  await expect(currentNavLink(page)).toHaveText('Kubernetes');
  await fillUsage(page, 450.4, 629.4);

  await expect(page.locator('#snippet-code')).toHaveText(K8S_REFERENCE_MANIFEST);
  await expect(page.locator('#stat-row')).toContainText('1824Mi');
  await expect(page.locator('#gauge-track')).toHaveAttribute('aria-label', /request 608Mi, limit 832Mi/);
});

test('Kubernetes: Guaranteed QoS sets request equal to limit', async ({ page }) => {
  await page.goto('/kubernetes/');
  await fillUsage(page, 450.4, 629.4);
  await page.getByLabel('QoS class').selectOption('guaranteed');
  await expect(page.locator('#snippet-code')).toHaveText(
    'resources:\n  requests:\n    memory: "832Mi"\n  limits:\n    memory: "832Mi"'
  );
});

test('Kubernetes: a Prometheus range-table paste fills the fields and skips the pause container', async ({ page }) => {
  await page.goto('/kubernetes/');
  await page.getByLabel('Raw query output / scrape').fill(PROMETHEUS_PASTE);

  await expect(page.locator('#prom-feedback')).toContainText('2 samples parsed');
  await expect(page.locator('#prom-feedback')).toContainText('skipped 1 pod-level/pause series');
  await expect(averageInput(page)).toHaveValue('539.9');
  await expect(peakInput(page)).toHaveValue('629.4');
});

test('Kubernetes: replacing a good paste with garbage clears the stale results', async ({ page }) => {
  await page.goto('/kubernetes/');
  const paste = page.getByLabel('Raw query output / scrape');
  await paste.fill(PROMETHEUS_PASTE);
  await expect(page.locator('#stat-row')).not.toBeEmpty();

  await paste.fill('this is not a metric');
  await expect(page.locator('#prom-feedback')).toContainText('No memory samples found');
  await expect(averageInput(page)).toHaveValue('');
  await expect(page.locator('#stat-row')).toBeEmpty();
  await expect(page.locator('#copy-snippet')).toBeDisabled();
});

test('Docker Compose: steady workloads never get a reservation above the limit', async ({ page }) => {
  await page.goto('/docker-compose/');
  await fillUsage(page, 1000, 1020);
  await page.getByLabel('Workload type').selectOption('cache');

  await expect(page.locator('#snippet-code')).toHaveText(
    'deploy:\n  resources:\n    limits:\n      memory: 1350M\n    reservations:\n      memory: 1350M'
  );
  await expect(page.locator('#warnings')).toContainText('raised to 1350M');
});

test('AWS Lambda: recommends a single peak-based MemorySize and hides replicas', async ({ page }) => {
  await page.goto('/lambda/');
  await expect(page.getByLabel('Replica count')).toBeHidden();
  await fillUsage(page, 450, 630);
  await expect(page.locator('#stat-row')).toContainText('819 MB');
  await expect(page.locator('#snippet-code')).toContainText('--memory-size 819');
  await expect(page.locator('#explanation-note')).toBeVisible();
});

test('Systemd: produces a MemoryHigh / MemoryMax drop-in with high/max gauge markers', async ({ page }) => {
  await page.goto('/systemd/');
  await expect(currentNavLink(page)).toHaveText('Systemd / Bare Metal / VM');
  await expect(page.getByLabel('Replica count')).toBeHidden();
  await fillUsage(page, 295, 390);

  await expect(page.locator('#snippet-code')).toHaveText('[Service]\nMemoryHigh=512M\nMemoryMax=640M');
  await expect(page.locator('#snippet-secondary-note')).toContainText('systemctl daemon-reload && systemctl restart <service>');
  await expect(page.locator('#gauge-track')).toHaveAttribute('aria-label', /high 512M, max 640M/);
  await expect(page.locator('#stat-row')).toContainText('Expected usage');
});

test('VMware vSphere: produces vSphere Client steps and a govc command', async ({ page }) => {
  await page.goto('/vmware/');
  await expect(currentNavLink(page)).toHaveText('VMware vSphere');
  await expect(page.getByLabel('Replica count')).toBeHidden();
  await fillUsage(page, 390, 700);

  await expect(page.locator('#snippet-code')).toHaveText(
    'govc vm.change -vm "<vm-name>" -mem.reservation 512 -mem.limit 1024 -mem.shares normal'
  );
  await expect(page.locator('#snippet-secondary-note')).toHaveText(
    'In vSphere Client: Edit Settings → Virtual Hardware → Memory → set Reservation to 512 MB, Limit to 1024 MB, Shares to Normal.'
  );
  await expect(page.locator('#gauge-track')).toHaveAttribute('aria-label', /reservation 512 MB, limit 1024 MB/);
  await expect(page.locator('#stat-row')).toContainText('Normal');
});

test('HashiCorp Nomad: produces a resources block and the oversubscription command', async ({ page }) => {
  await page.goto('/nomad/');
  await expect(currentNavLink(page)).toHaveText('HashiCorp Nomad');
  await expect(page.getByLabel('Group count')).toBeVisible();
  await fillUsage(page, 450.4, 629.4);

  await expect(page.locator('#snippet-code')).toHaveText('resources {\n  memory     = 608\n  memory_max = 832\n}');
  await expect(page.locator('#snippet-secondary-note')).toContainText('nomad operator scheduler set-config -memory-oversubscription=true');
  await expect(page.locator('#stat-row')).toContainText('1824 MB');
});

test('Google Cloud Run: produces a gcloud command with the memory limit', async ({ page }) => {
  await page.goto('/cloud-run/');
  await expect(currentNavLink(page)).toHaveText('Google Cloud Run');
  await fillUsage(page, 400, 629.4);

  await expect(page.locator('#snippet-code')).toHaveText('gcloud run services update <service> --memory 832Mi');
  await expect(page.locator('#stat-row')).toContainText('1 vCPU');
});

test('Azure Functions: produces a Flex Consumption instance size command', async ({ page }) => {
  await page.goto('/azure-functions/');
  await expect(currentNavLink(page)).toHaveText('Azure Functions');
  await fillUsage(page, 400, 629.4);

  await expect(page.locator('#snippet-code')).toContainText('--instance-memory 2048');
  await expect(page.locator('#stat-row')).toContainText('2048 MB');
});

test('Redis: a used_memory paste produces maxmemory and host sizing', async ({ page }) => {
  await page.goto('/redis/');
  await expect(currentNavLink(page)).toHaveText('Redis maxmemory');
  await expect(page.getByLabel('Workload type')).toHaveValue('cache');
  await page.getByLabel('used_memory samples').fill('used_memory:419430400\nused_memory:524288000');

  await expect(page.locator('#prom-feedback')).toContainText('2 samples parsed');
  await expect(page.locator('#snippet-code')).toHaveText('maxmemory 704mb\nmaxmemory-policy allkeys-lru');
  await expect(page.locator('#stat-row')).toContainText('1408 MB');
});

test('Proxmox VE: produces a qm command and web UI steps', async ({ page }) => {
  await page.goto('/proxmox/');
  await expect(currentNavLink(page)).toHaveText('Proxmox VE');
  await fillUsage(page, 450.4, 629.4);

  await expect(page.locator('#snippet-code')).toHaveText('qm set <vmid> --memory 1024 --balloon 640');
  await expect(page.locator('#snippet-secondary-note')).toContainText('Minimum memory (MiB): 640');
  await expect(page.locator('#gauge-track')).toHaveAttribute('aria-label', /minimum 640 MiB, memory 1024 MiB/);
});

for (const [id, path] of [
  ['dockerCompose', '/docker-compose/'],
  ['lambda', '/lambda/'],
  ['systemd', '/systemd/'],
  ['vmware', '/vmware/'],
  ['nomad', '/nomad/'],
  ['cloudRun', '/cloud-run/'],
  ['azureFunctions', '/azure-functions/'],
  ['redis', '/redis/'],
  ['proxmox', '/proxmox/']
]) {
  test(`turning ${id} off removes it everywhere without affecting the other calculators`, async ({ page }) => {
    await page.route('**/js/platforms.js', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(`${id}: true`, `${id}: false`);
      await route.fulfill({ response, body });
    });

    await page.goto('/');
    await expect(page.locator(`[data-platform-card="${id}"]`)).toHaveCount(0);
    await expect(page.locator('[data-platform-card]')).toHaveCount(PLATFORM_COUNT - 1);

    await page.goto(path);
    await expect(page.locator('#disabled-state')).toBeVisible();
    await expect(page.locator('#output-panels')).toBeHidden();

    await page.goto('/kubernetes/');
    await expect(page.locator(`[data-platform-link="${id}"]`)).toHaveCount(0);
    await expect(page.locator('.site-nav a')).toHaveCount(PLATFORM_COUNT - 1);
    await fillUsage(page, 450.4, 629.4);
    await expect(page.locator('#snippet-code')).toHaveText(K8S_REFERENCE_MANIFEST);
  });
}

test('copy button reports success and resets, even when clicked twice', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-specific');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/kubernetes/');
  await fillUsage(page, 400, 500);

  const button = page.locator('#copy-snippet');
  await button.click();
  await button.click();
  await expect(button).toHaveText('Copied');
  await expect(button).toHaveText('Copy YAML', { timeout: 3000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('memory: "544Mi"');
});

test('theme choice persists across pages without a flash', async ({ page }) => {
  await page.goto('/kubernetes/');
  const initial = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('button', { name: 'Dark theme' }).click();
  const toggled = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(toggled).not.toBe(initial);

  await page.goto('/lambda/');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(toggled);
  expect(['light', 'dark']).toContain(await page.evaluate(() => document.documentElement.dataset.theme));
});

test('/k8s/ falls back to a meta refresh that lands on /kubernetes/', async ({ page }) => {
  await page.goto('/k8s/');
  await page.waitForURL('**/kubernetes/');
});
