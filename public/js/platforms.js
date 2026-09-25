/**
 * Which output platforms the site offers. Flip a value in
 * ENABLED_PLATFORMS to turn a platform on or off; nav links, landing-page
 * cards and the sitemap generator all read from here.
 */

export const ENABLED_PLATFORMS = {
  kubernetes: true,
  dockerCompose: true,
  lambda: true,
  systemd: true,
  vmware: true,
  nomad: true,
  cloudRun: true,
  redis: true,
  proxmox: true
};

// Array order is the nav order.
export const PLATFORM_DEFINITIONS = [
  {
    id: 'kubernetes',
    label: 'Kubernetes',
    path: '/kubernetes/',
    tagline: 'Right-size Pod memory requests and limits from real usage data.'
  },
  {
    id: 'dockerCompose',
    label: 'Docker Compose',
    path: '/docker-compose/',
    tagline: 'Size deploy.resources memory reservations and limits for Compose services.'
  },
  {
    id: 'lambda',
    label: 'AWS Lambda',
    path: '/lambda/',
    tagline: 'Find the MemorySize that balances cost per invocation against duration.'
  },
  {
    id: 'systemd',
    label: 'Systemd / Bare Metal / VM',
    path: '/systemd/',
    tagline: 'Set MemoryHigh and MemoryMax for services running directly on a Linux host.'
  },
  {
    id: 'vmware',
    label: 'VMware vSphere',
    path: '/vmware/',
    tagline: 'Size a VM’s memory reservation and limit without ballooning or wasted host capacity.'
  },
  {
    id: 'nomad',
    label: 'HashiCorp Nomad',
    path: '/nomad/',
    tagline: 'Set a task’s memory and memory_max for Nomad’s memory oversubscription.'
  },
  {
    id: 'cloudRun',
    label: 'Google Cloud Run',
    path: '/cloud-run/',
    tagline: 'Pick a Cloud Run memory limit, with the CPU it needs, from real instance usage.'
  },
  {
    id: 'redis',
    label: 'Redis maxmemory',
    path: '/redis/',
    tagline: 'Size maxmemory for a Redis cache — and the host memory it needs around it.'
  },
  {
    id: 'proxmox',
    label: 'Proxmox VE',
    path: '/proxmox/',
    tagline: 'Set a VM’s memory and ballooning minimum — handy when migrating from VMware.'
  }
];

export function isEnabled(id) {
  return ENABLED_PLATFORMS[id] === true;
}

export function getEnabledPlatforms() {
  return PLATFORM_DEFINITIONS.filter((def) => isEnabled(def.id));
}

export function getPlatform(id) {
  return PLATFORM_DEFINITIONS.find((def) => def.id === id) ?? null;
}

/** Each platform's formatter module is named after its page path, e.g. /cloud-run/ → cloud-run.js. */
export function formatterUrl(def) {
  return `/js/formatters/${def.path.slice(1, -1)}.js`;
}
