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

// Field tooltips for platforms with one memory setting sized from the peak:
// the average doesn't change their result, and only the limit margin applies.
export const PEAK_ONLY_FIELD_TIPS = {
  avg: null,
  sensitivity: 'Sets the base margin on the peak: the higher the sensitivity, the more headroom.',
  workload: 'JVM and worker/batch get extra margin above the peak; the other types don’t change it.'
};
