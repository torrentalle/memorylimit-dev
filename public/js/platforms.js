/**
 * Which output platforms the site offers. Flip a value in
 * ENABLED_PLATFORMS to turn a platform on or off; nav links, landing-page
 * cards and the sitemap generator all read from here. Each platform belongs
 * to a category (PLATFORM_CATEGORIES), which groups it in the nav and on the
 * landing page. A platform whose input isn't an average/peak pair declares its
 * own page script in `entry`; the rest share calculator-page.js.
 */

export const ENABLED_PLATFORMS = {
  kubernetes: true,
  dockerCompose: true,
  lambda: true,
  systemd: true,
  vmware: true,
  nomad: true,
  cloudRun: true,
  azureFunctions: true,
  redis: true,
  couchbase: true,
  proxmox: true
};

// Array order is the display order of the categories in the nav and on the landing page.
export const PLATFORM_CATEGORIES = [
  { id: 'containers', label: 'Containers & orchestration' },
  { id: 'serverless', label: 'Serverless' },
  { id: 'vms', label: 'VMs & bare metal' },
  { id: 'datastores', label: 'Data stores' }
];

// Array order is the display order within a category.
export const PLATFORM_DEFINITIONS = [
  {
    id: 'kubernetes',
    category: 'containers',
    label: 'Kubernetes',
    path: '/kubernetes/',
    guide: '/kubernetes/how-it-works/',
    tagline: 'Right-size Pod memory requests and limits from real usage data.'
  },
  {
    id: 'dockerCompose',
    category: 'containers',
    label: 'Docker Compose',
    path: '/docker-compose/',
    guide: '/docker-compose/how-it-works/',
    tagline: 'Size deploy.resources memory reservations and limits for Compose services.'
  },
  {
    id: 'nomad',
    category: 'containers',
    label: 'HashiCorp Nomad',
    path: '/nomad/',
    tagline: 'Set a task’s memory and memory_max for Nomad’s memory oversubscription.'
  },
  {
    id: 'lambda',
    category: 'serverless',
    label: 'AWS Lambda',
    path: '/lambda/',
    tagline: 'Find the MemorySize that balances cost per invocation against duration.'
  },
  {
    id: 'cloudRun',
    category: 'serverless',
    label: 'Google Cloud Run',
    path: '/cloud-run/',
    tagline: 'Pick a Cloud Run memory limit, with the CPU it needs, from real instance usage.'
  },
  {
    id: 'azureFunctions',
    category: 'serverless',
    label: 'Azure Functions',
    path: '/azure-functions/',
    tagline: 'Pick the Flex Consumption instance size, or the Premium SKU, a function app needs.'
  },
  {
    id: 'systemd',
    category: 'vms',
    label: 'Systemd / Bare Metal / VM',
    path: '/systemd/',
    tagline: 'Set MemoryHigh and MemoryMax for services running directly on a Linux host.'
  },
  {
    id: 'vmware',
    category: 'vms',
    label: 'VMware vSphere',
    path: '/vmware/',
    tagline: 'Size a VM’s memory reservation and limit without ballooning or wasted host capacity.'
  },
  {
    id: 'proxmox',
    category: 'vms',
    label: 'Proxmox VE',
    path: '/proxmox/',
    tagline: 'Set a VM’s memory and ballooning minimum — handy when migrating from VMware.'
  },
  {
    id: 'redis',
    category: 'datastores',
    label: 'Redis maxmemory',
    path: '/redis/',
    tagline: 'Size maxmemory for a Redis cache — and the host memory it needs around it.'
  },
  {
    id: 'couchbase',
    category: 'datastores',
    label: 'Couchbase memory quotas',
    path: '/couchbase/',
    entry: '/js/couchbase-page.js',
    guide: '/couchbase/how-it-works/',
    tagline: 'Set Data, Index and Search service quotas and each bucket’s quota from the dataset.'
  }
];

export function isEnabled(id) {
  return ENABLED_PLATFORMS[id] === true;
}

/** The page explaining the average/peak sizing model the calculators share (calculator.js). */
export const SIZING_MODEL_GUIDE = '/sizing-model/';

/** Where a calculator's "How this was derived" links to: its own guide, or the shared sizing model. */
export function guideUrl(def) {
  return def.guide ?? SIZING_MODEL_GUIDE;
}

/** Pages explaining a platform's method in detail (`guide` in its definition), as { platformId, path }. */
export function getGuidePages(defs = PLATFORM_DEFINITIONS) {
  return defs.filter((def) => def.guide).map((def) => ({ platformId: def.id, path: def.guide }));
}

export function getEnabledPlatforms() {
  return PLATFORM_DEFINITIONS.filter((def) => isEnabled(def.id));
}

/** Platform definitions grouped by category, in category order; categories with no platforms are omitted. */
export function getPlatformGroups(defs = PLATFORM_DEFINITIONS) {
  return PLATFORM_CATEGORIES.map((category) => ({
    ...category,
    platforms: defs.filter((def) => def.category === category.id)
  })).filter((group) => group.platforms.length > 0);
}

export function getPlatform(id) {
  return PLATFORM_DEFINITIONS.find((def) => def.id === id) ?? null;
}

/** The module a platform's page loads: its own `entry`, or the shared calculator page. */
export function entryUrl(def) {
  return def.entry ?? '/js/calculator-page.js';
}

/** Each platform's formatter module is named after its page path, e.g. /cloud-run/ → cloud-run.js. */
export function formatterUrl(def) {
  return `/js/formatters/${def.path.slice(1, -1)}.js`;
}
