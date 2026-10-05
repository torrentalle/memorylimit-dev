/**
 * The tooltip sentence for each shared field of the calculator page (app.js):
 * how that field moves the result. The defaults are worded for the
 * request/limit pair of the shared sizing model; a formatter whose output
 * works differently exports `fieldTips` to reword one, or sets it to null when
 * the field doesn't change its result. Pure data, so it can be unit-tested.
 */

/**
 * The tooltip of a margin override in "Advanced: margins and defaults", ending with what the margin sizes, e.g.
 * 'the request is the average plus it'.
 */
export function marginTip(effect) {
  return `Replaces the margin from sensitivity, workload type and environment, shown greyed while empty: ${effect}.`;
}

// Keys match the controls app.js reads.
export const DEFAULT_FIELD_TIPS = {
  avg: 'The request is this plus the request margin.',
  peak: 'The limit is this plus the limit margin.',
  workload: 'JVM and worker/batch get extra margin above the peak; JVM and cache extra above the average, worker/batch less.',
  sensitivity: 'Sets the base margins: the higher the sensitivity, the more headroom above the average and the peak.',
  environment: 'Scales the margins down to 60% in development and 85% in staging; production keeps them in full.',
  replicas: 'Only the total changes: it’s the per-replica value times this.',
  qos: 'Guaranteed sets the request equal to the limit (the Pod also needs equal CPU request and limit); Burstable keeps the request at the average plus its margin.',
  requestMargin: marginTip('the request is the average plus it'),
  limitMargin: marginTip('the limit is the peak plus it')
};

/** The tooltips for a page: the defaults with the formatter's `fieldTips` applied, minus the ones set to null. */
export function fieldTipsFor(formatter) {
  const tips = { ...DEFAULT_FIELD_TIPS, ...formatter.fieldTips };
  return Object.fromEntries(Object.entries(tips).filter(([, text]) => text));
}
