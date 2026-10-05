import { test, expect } from './fixtures.js';

const PROMETHEUS_PASTE = [
  '# HELP container_memory_working_set_bytes Current working set',
  'container_memory_working_set_bytes{container="api",pod="api-7c9"}',
  '472289689 @1727260000.123',
  '659972505 @1727260015.123',
  'container_memory_working_set_bytes{container="POD",pod="api-7c9"}',
  '520192 @1727260000.123'
].join('\n');

const PLATFORM_COUNT = 11;
const K8S_REFERENCE_MANIFEST = 'resources:\n  requests:\n    memory: "586Mi"\n  limits:\n    memory: "819Mi"';

const averageInput = (page) => page.getByRole('spinbutton', { name: /^Average usage/ });
const peakInput = (page) => page.getByRole('spinbutton', { name: /^Peak usage/ });
const currentNavLink = (page) => page.locator('.site-nav [aria-current="page"]');
// The form control for a label, not the tooltip button next to it (whose name repeats the label).
const field = (page, label) => page.getByLabel(label).and(page.locator('input, select, textarea'));

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
  const list = page.locator('.site-nav__panel');
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
  await expect(page.locator('#stat-row')).toContainText('1758Mi');
  await expect(page.locator('#gauge-track')).toHaveAttribute('aria-label', /request 586Mi, limit 819Mi/);
  await expect(page.locator('#explanation .explanation-steps li')).toHaveText([
    'Request: 450.4 MiB average + 30% = 585.5 MiB → 586Mi',
    'Limit: 629.4 MiB peak + 30% = 818.2 MiB → 819Mi',
    'Total request: 586Mi × 3 replicas = 1758Mi'
  ]);
  await expect(page.locator('#explanation-note')).toContainText('Vertical Pod Autoscaler');
});

test('Kubernetes: Guaranteed QoS sets request equal to limit', async ({ page }) => {
  await page.goto('/kubernetes/');
  await fillUsage(page, 450.4, 629.4);
  await field(page, 'QoS class').selectOption('guaranteed');
  await expect(page.locator('#snippet-code')).toHaveText(
    'resources:\n  requests:\n    memory: "819Mi"\n  limits:\n    memory: "819Mi"'
  );
  await expect(page.locator('#explanation-note')).toContainText('CPU request equal to its CPU limit');
});

test('Kubernetes: a Prometheus range-table paste fills the fields and skips the pause container', async ({ page }) => {
  await page.goto('/kubernetes/');
  await page.getByRole('button', { name: 'Paste Prometheus' }).click();
  await page.getByLabel('Raw query output / scrape').fill(PROMETHEUS_PASTE);

  await expect(page.locator('#prom-feedback')).toContainText('2 samples parsed');
  await expect(page.locator('#prom-feedback')).toContainText('skipped 1 pod-level/pause series');
  await expect(averageInput(page)).toHaveValue('539.9');
  await expect(peakInput(page)).toHaveValue('629.4');
});

test('Kubernetes: replacing a good paste with garbage clears the stale results', async ({ page }) => {
  await page.goto('/kubernetes/');
  await page.getByRole('button', { name: 'Paste Prometheus' }).click();
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
  await field(page, 'Workload type').selectOption('cache');

  await expect(page.locator('#snippet-code')).toHaveText(
    'deploy:\n  resources:\n    limits:\n      memory: 1350M\n    reservations:\n      memory: 1350M'
  );
  await expect(page.locator('#warnings')).toContainText('raised to 1350M');
  await expect(page.locator('#explanation .explanation-steps li')).toHaveText([
    'Reservation: 1000 MiB average + 35% = 1350 MiB → 1350M',
    'Limit: 1020 MiB peak + 30% = 1326 MiB, raised to the reservation → 1350M',
    'Total reservation: 1350M × 3 replicas = 4050M'
  ]);
  await expect(page.locator('#snippet-secondary-note')).toHaveText(
    'Service-level equivalent (use one or the other):\nmem_limit: 1350M\nmem_reservation: 1350M'
  );
  await expect(page.locator('#explanation-note')).toContainText('memswap_limit');
  await expect(page.locator('.explanation-panel .guide-link a')).toHaveAttribute('href', '/docker-compose/how-it-works/');
});

test('AWS Lambda: recommends a single peak-based MemorySize and hides replicas', async ({ page }) => {
  await page.goto('/lambda/');
  await expect(field(page, 'Replica count')).toBeHidden();
  await fillUsage(page, 450, 630);
  // 630 MiB × 1.30 = 819 MiB = 858.8 MB: Lambda's MB are decimal.
  await expect(page.locator('#stat-row')).toContainText('859 MB');
  await expect(page.locator('#stat-row')).toContainText('≈ 0.49 vCPU');
  await expect(page.locator('#snippet-code')).toContainText('--function-name <function> --memory-size 859');
  await expect(page.locator('#explanation-note')).toBeVisible();
  await expect(page.locator('.explanation-panel .guide-link a')).toHaveAttribute('href', '/lambda/how-it-works/');
});

test('Systemd: produces a MemoryHigh / MemoryMax drop-in with high/max gauge markers', async ({ page }) => {
  await page.goto('/systemd/');
  await expect(currentNavLink(page)).toHaveText('Systemd / Bare Metal / VM');
  await expect(field(page, 'Replica count')).toBeHidden();
  await fillUsage(page, 295, 390);

  await expect(page.locator('#snippet-code')).toHaveText('[Service]\nMemoryHigh=512M\nMemoryMax=640M');
  await expect(page.locator('#snippet-secondary-note')).toContainText('systemctl daemon-reload && systemctl restart <service>');
  await expect(page.locator('#gauge-track')).toHaveAttribute('aria-label', /high 512M, max 640M/);
  await expect(page.locator('#stat-row')).toContainText('Expected usage');
});

test('VMware vSphere: produces vSphere Client steps and a govc command', async ({ page }) => {
  await page.goto('/vmware/');
  await expect(currentNavLink(page)).toHaveText('VMware vSphere');
  await expect(field(page, 'Replica count')).toBeHidden();
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
  await expect(field(page, 'Group count')).toBeVisible();
  await fillUsage(page, 450.4, 629.4);

  await expect(page.locator('#snippet-code')).toHaveText('resources {\n  memory     = 586\n  memory_max = 819\n}');
  await expect(page.locator('#snippet-secondary-note')).toContainText('nomad operator scheduler set-config -memory-oversubscription=true');
  await expect(page.locator('#stat-row')).toContainText('1758 MB');
  await expect(page.locator('#explanation .explanation-steps li')).toHaveCount(3);
  await expect(page.locator('.explanation-panel .guide-link a')).toHaveAttribute('href', '/nomad/how-it-works/');
});

test('Google Cloud Run: produces a gcloud command with the memory limit', async ({ page }) => {
  await page.goto('/cloud-run/');
  await expect(currentNavLink(page)).toHaveText('Google Cloud Run');
  await fillUsage(page, 400, 629.4);

  await expect(page.locator('#snippet-code')).toHaveText('gcloud run services update <service> --memory 819Mi');
  await expect(page.locator('#stat-row')).toContainText('1 vCPU');
  await expect(page.locator('#snippet-secondary-note')).toHaveText('service.yaml:\nspec.template.spec.containers[0].resources.limits:\n  memory: 819Mi');
  await expect(page.locator('.explanation-panel .guide-link a')).toHaveAttribute('href', '/cloud-run/how-it-works/');
});

test('Azure Functions: produces a Flex Consumption instance size command', async ({ page }) => {
  await page.goto('/azure-functions/');
  await expect(currentNavLink(page)).toHaveText('Azure Functions');
  await fillUsage(page, 400, 629.4);

  await expect(page.locator('#snippet-code')).toContainText('--instance-memory 2048');
  await expect(page.locator('#stat-row')).toContainText('2048 MB');
  await expect(page.locator('#stat-row')).toContainText('1 core');
  await expect(page.locator('#explanation .explanation-steps li')).toHaveCount(2);
  await expect(page.locator('.explanation-panel .guide-link a')).toHaveAttribute('href', '/azure-functions/how-it-works/');
});

test('Redis: a used_memory paste produces maxmemory and host sizing', async ({ page }) => {
  await page.goto('/redis/');
  await expect(currentNavLink(page)).toHaveText('Redis maxmemory');
  await expect(field(page, 'Workload type')).toHaveValue('cache');
  await page.locator('#mode-paste-btn').click();
  await page.getByLabel('used_memory samples').fill('used_memory:419430400\nused_memory:524288000');

  await expect(page.locator('#prom-feedback')).toContainText('2 samples parsed');
  await expect(page.locator('#snippet-code')).toHaveText('maxmemory 704mb\nmaxmemory-policy allkeys-lru');
  await expect(page.locator('#stat-row')).toContainText('1408 MB');
});

test('Couchbase: default bucket produces quotas and couchbase-cli commands, and buckets can be added and removed', async ({ page }) => {
  await page.goto('/couchbase/');
  await expect(currentNavLink(page)).toHaveText('Couchbase memory quotas');

  // 1M docs × (92 B metadata+key, 1 KiB value) × 2 copies, 20% resident → 833 MiB; ÷ 3 Data nodes → 278 MiB per node.
  await expect(page.locator('#snippet-code')).toContainText('--cluster-ramsize 278');
  await expect(page.locator('#snippet-code')).toContainText('--cluster-index-ramsize 512');
  await expect(page.locator('#snippet-code')).toContainText('--bucket default --bucket-ramsize 833');
  await expect(page.locator('#stat-row')).toContainText('Bucket default');

  await page.getByRole('button', { name: 'Add bucket' }).click();
  await expect(page.locator('[data-bucket-row]')).toHaveCount(2);
  await expect(page.locator('#snippet-code')).toContainText('--bucket bucket2');

  await page.getByRole('button', { name: 'Remove bucket 2' }).click();
  await expect(page.locator('[data-bucket-row]')).toHaveCount(1);
  await expect(page.locator('#snippet-code')).not.toContainText('bucket2');
});

test('Couchbase: quotas above the node RAM raise an error warning', async ({ page }) => {
  await page.goto('/couchbase/');
  // 790 MiB of quotas on a 768 MiB node, above its 614 MiB firm limit
  await field(page, 'RAM per node').fill('0.75');
  await expect(page.locator('#warnings .is-error')).toContainText('will refuse them');
});

test('Couchbase: pasted bucket API and cluster API output fill in the form', async ({ page }) => {
  await page.goto('/couchbase/');
  await expect(page.locator('#mode-paste')).toBeHidden();
  await page.locator('#mode-paste-btn').click();

  await page.getByLabel('Prometheus metrics or Couchbase REST output').fill(
    JSON.stringify([{ name: 'orders', bucketType: 'membase', replicaNumber: 2, evictionPolicy: 'fullEviction', quota: { ram: 536870912 }, basicStats: { itemCount: 2500000 } }])
  );
  await expect(page.locator('#metrics-feedback')).toContainText('Bucket API: 1 bucket');
  await expect(page.locator('[data-bucket-row]')).toHaveCount(1);
  await expect(field(page, 'Bucket name')).toHaveValue('orders');
  await expect(field(page, 'Documents')).toHaveValue('2500000');
  await expect(field(page, 'Replicas')).toHaveValue('2');
  await expect(field(page, 'Eviction policy')).toHaveValue('full');

  await page.getByLabel('Prometheus metrics or Couchbase REST output').fill(
    JSON.stringify({ memoryQuota: 4096, indexMemoryQuota: 1024, nodes: [{ services: ['kv', 'index'], systemStats: { mem_total: 34359738368 } }, { services: ['kv'], systemStats: { mem_total: 34359738368 } }] })
  );
  await expect(page.locator('#metrics-feedback')).toContainText('Cluster info read');
  await expect(field(page, 'Data nodes')).toHaveValue('2');
  await expect(field(page, 'RAM per node')).toHaveValue('32');
  await expect(field(page, 'Index quota')).toHaveValue('1024');
});

test('Couchbase: a Prometheus paste sets the document count and keeps the sizes you entered', async ({ page }) => {
  await page.goto('/couchbase/');
  await field(page, 'Average document size').fill('2048');
  await page.locator('#mode-paste-btn').click();
  await page.getByLabel('Prometheus metrics or Couchbase REST output').fill('kv_curr_items{bucket="default",instance="a"} 300000\nkv_curr_items{bucket="default",instance="b"} 200000');
  await expect(page.locator('#metrics-feedback')).toContainText('Prometheus: 1 bucket');
  await expect(field(page, 'Documents')).toHaveValue('500000');
  await expect(field(page, 'Average document size')).toHaveValue('2048');
});

test('Couchbase: each input that changes the result has a tooltip saying how', async ({ page }) => {
  await page.goto('/couchbase/');
  const button = page.getByRole('button', { name: 'How Replicas affects the result' });
  const tip = page.getByRole('tooltip').filter({ hasText: '1 replica doubles the quota' });
  await expect(tip).toBeHidden();
  await expect(field(page, 'Replicas')).toHaveAccessibleDescription(/1 replica doubles the quota/);

  await button.hover();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();

  await page.mouse.move(0, 0);
  await page.getByRole('button', { name: 'How Data nodes affects the result' }).focus();
  await expect(page.getByRole('tooltip').filter({ hasText: 'divided by this' })).toBeVisible();

  // 6 per bucket + Data nodes + RAM per node. The bucket name doesn't affect the numbers, and the other
  // services' quotas share one sentence in their section's hint.
  await expect(page.locator('.hint-tip__btn')).toHaveCount(8);
  await expect(page.getByText("These aren't calculated: each is added as entered")).toBeVisible();
  await expect(field(page, 'Bucket name')).not.toHaveAttribute('aria-describedby', /.+/);
});

test('shared fields have tooltips saying how they move the result, and the derivation links the sizing model', async ({ page }) => {
  await page.goto('/kubernetes/');
  // Average, peak, workload type, replicas, sensitivity, environment and QoS.
  await expect(page.locator('.hint-tip__btn')).toHaveCount(7);
  const tip = page.getByRole('tooltip').filter({ hasText: 'Guaranteed sets the request equal to the limit' });
  await expect(tip).toBeHidden();
  await expect(field(page, 'QoS class')).toHaveAccessibleDescription(/Guaranteed sets the request equal to the limit/);
  await page.getByRole('button', { name: 'How QoS class affects the result' }).hover();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();

  const guide = page.locator('.explanation-panel .guide-link a');
  await expect(guide).toHaveAttribute('href', '/kubernetes/how-it-works/');
  await expect(guide).toHaveAttribute('target', '_blank');

  // Lambda is sized from the peak alone: no tooltip on the average, and the replica field is hidden.
  await page.goto('/lambda/');
  await expect(page.locator('.hint-tip__btn')).toHaveCount(4);
  await expect(averageInput(page)).not.toHaveAttribute('aria-describedby', /.+/);
  await expect(peakInput(page)).toHaveAccessibleDescription(/MemorySize is this plus the limit margin/);
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
  ['couchbase', '/couchbase/'],
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
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('memory: "520Mi"');
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
