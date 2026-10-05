/** Text helpers shared by the platform formatters. */
import { marginTip } from '../field-tip-texts.js';

export { marginTip };

/** A MiB figure for an explanation, to at most one decimal: 832.5 MiB, 410 MiB. */
export function mib(value) {
  return `${Number(value.toFixed(1))} MiB`;
}

/** A number for an explanation, to at most one decimal. */
export function fixed(value) {
  return Number(value.toFixed(1));
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
  workload: 'JVM and worker/batch get extra margin above the peak; the other types don’t change it.',
  requestMargin: null
};
