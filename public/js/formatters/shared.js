/** Text helpers shared by the platform formatters. */

const WORKLOAD_LABELS = {
  api: 'API service',
  worker: 'worker/batch',
  cache: 'cache',
  jvm: 'JVM',
  node: 'Node.js',
  python: 'Python',
  generic: 'generic'
};

export function describeProfile({ sensitivity, workloadType, environment }) {
  return `${sensitivity} sensitivity, ${WORKLOAD_LABELS[workloadType]}, ${environment}`;
}

export function percent(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

export function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
