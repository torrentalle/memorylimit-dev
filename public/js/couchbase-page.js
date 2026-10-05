/**
 * Entry point for the Couchbase calculator page. Its input is a list of
 * buckets plus the node layout rather than an average/peak pair, so it has
 * its own page script (see `entry` in ./platforms.js) instead of app.js. The
 * math and the output live in ./formatters/couchbase.js.
 *
 * Sets <html data-calculator-ready> once the form is wired up, like
 * calculator-page.js, so the e2e tests know the page is listening.
 */
import './site.js';
import { isEnabled } from './platforms.js';
import * as couchbase from './formatters/couchbase.js';
import { pluralize } from './formatters/shared.js';
import { parseCouchbaseInput } from './couchbase-parser.js';
import { attachTip } from './field-tips.js';
import { renderExplanation } from './explanation.js';
import { initAdvancedSettings, readAdvancedNumber } from './advanced-settings.js';
import { element, initModeToggle, createResultView } from './result-view.js';

const MIB_PER_GIB = 1024;
const MAX_BUCKETS = 30;
const DEFAULT_BUCKET = { name: 'default', documents: 1000000, keyBytes: 36, documentBytes: 1024, replicas: 1, workingSetPct: 20, eviction: 'value' };

function readNumber(input) {
  const value = parseFloat(input.value);
  return Number.isFinite(value) ? value : null;
}

const el = {
  modePaste: element('mode-paste-btn'),
  modeManual: element('mode-manual-btn'),
  pastePanel: element('mode-paste'),
  manualPanel: element('mode-manual'),
  metricsInput: element('metrics-input'),
  metricsFeedback: element('metrics-feedback'),
  bucketList: element('bucket-list'),
  addBucket: element('add-bucket-btn'),
  dataNodes: element('data-nodes-input'),
  nodeRam: element('node-ram-input'),
  indexQuota: element('index-quota-input'),
  searchQuota: element('search-quota-input'),
  eventingQuota: element('eventing-quota-input'),
  analyticsQuota: element('analytics-quota-input'),
  advanced: element('advanced-settings'),
  disabledState: element('disabled-state'),
  outputPanels: element('output-panels'),
  statRow: element('stat-row'),
  warnings: element('warnings'),
  snippetTitle: element('snippet-title'),
  snippetCode: element('snippet-code'),
  snippetNote: element('snippet-secondary-note'),
  copyButton: element('copy-snippet'),
  explanation: element('explanation'),
  explanationNote: element('explanation-note')
};

// "Advanced: sizing defaults and thresholds": each control carries data-setting="<calculateSizing() setting>".
const settingControls = [...el.advanced.querySelectorAll('[data-setting]')];

// The paste/manual toggle and the result panels work as on the other calculators (./result-view.js).
// The form stays visible in both modes, so a paste can be reviewed and edited.
const setMode = initModeToggle(el);
const { renderFigures, renderWarnings, renderSnippet } = createResultView(el);

let bucketSerial = 0;

// ---- bucket rows ---------------------------------------------------------

function fieldNode({ id, label, unit, control, tip }) {
  const field = document.createElement('div');
  field.className = 'field';
  const labelNode = document.createElement('label');
  labelNode.className = 'field-label';
  labelNode.htmlFor = id;
  labelNode.append(label);
  if (unit) {
    const unitNode = document.createElement('span');
    unitNode.className = 'field-unit';
    unitNode.textContent = unit;
    labelNode.append(' ', unitNode);
  }
  control.id = id;
  control.classList.add('field-input');
  field.append(tip ? attachTip(labelNode, control, tip) : labelNode, control);
  return field;
}

function numberInput(key, value, { min = 0, step = 'any' } = {}) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.step = String(step);
  input.inputMode = 'decimal';
  input.value = String(value);
  input.dataset.bucketField = key;
  return input;
}

function selectInput(key, options, selected) {
  const select = document.createElement('select');
  select.dataset.bucketField = key;
  for (const [value, text] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    option.selected = value === String(selected);
    select.append(option);
  }
  return select;
}

function addBucketRow(values = {}) {
  const bucket = { ...DEFAULT_BUCKET, ...values };
  const serial = ++bucketSerial;
  const row = document.createElement('fieldset');
  row.className = 'bucket-row';
  row.dataset.bucketRow = '';

  const legend = document.createElement('legend');
  legend.className = 'bucket-row__legend';
  legend.textContent = 'Bucket';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'copy-btn bucket-row__remove';
  remove.textContent = 'Remove';
  remove.dataset.removeBucket = '';
  remove.setAttribute('aria-label', `Remove bucket ${serial}`);

  const name = document.createElement('input');
  name.type = 'text';
  name.value = bucket.name;
  name.spellcheck = false;
  name.dataset.bucketField = 'name';

  const grid = document.createElement('div');
  grid.className = 'field-grid';
  grid.append(
    fieldNode({ id: `bucket-${serial}-name`, label: 'Bucket name', control: name }),
    fieldNode({
      id: `bucket-${serial}-documents`,
      label: 'Documents',
      control: numberInput('documents', bucket.documents),
      tip: couchbase.bucketFieldTips.documents
    }),
    fieldNode({
      id: `bucket-${serial}-key`,
      label: 'Average key length',
      unit: 'bytes',
      control: numberInput('keyBytes', bucket.keyBytes),
      tip: couchbase.bucketFieldTips.keyBytes
    }),
    fieldNode({
      id: `bucket-${serial}-size`,
      label: 'Average document size',
      unit: 'bytes',
      control: numberInput('documentBytes', bucket.documentBytes),
      tip: couchbase.bucketFieldTips.documentBytes
    }),
    fieldNode({
      id: `bucket-${serial}-replicas`,
      label: 'Replicas',
      control: selectInput('replicas', [0, 1, 2, 3].map((n) => [String(n), String(n)]), bucket.replicas),
      tip: couchbase.bucketFieldTips.replicas
    }),
    fieldNode({
      id: `bucket-${serial}-working-set`,
      label: 'Working set in RAM',
      unit: '%',
      control: numberInput('workingSetPct', bucket.workingSetPct, { min: 1, step: 1 }),
      tip: couchbase.bucketFieldTips.workingSetPct
    }),
    fieldNode({
      id: `bucket-${serial}-eviction`,
      label: 'Eviction policy',
      tip: couchbase.bucketFieldTips.eviction,
      control: selectInput(
        'eviction',
        [
          ['value', 'Value ejection'],
          ['full', 'Full ejection']
        ],
        bucket.eviction
      )
    })
  );

  row.append(legend, remove, grid);
  el.bucketList.append(row);
  refreshBucketChrome();
}

function refreshBucketChrome() {
  const rows = [...el.bucketList.querySelectorAll('[data-bucket-row]')];
  rows.forEach((row, index) => {
    row.querySelector('.bucket-row__legend').textContent = `Bucket ${index + 1}`;
    row.querySelector('[data-remove-bucket]').classList.toggle('is-hidden', rows.length === 1);
  });
  el.addBucket.disabled = rows.length >= MAX_BUCKETS;
}

function readBuckets() {
  return [...el.bucketList.querySelectorAll('[data-bucket-row]')].map((row) => {
    const field = (key) => row.querySelector(`[data-bucket-field="${key}"]`);
    return {
      name: field('name').value,
      documents: readNumber(field('documents')),
      keyBytes: readNumber(field('keyBytes')),
      documentBytes: readNumber(field('documentBytes')),
      replicas: parseInt(field('replicas').value, 10),
      workingSetPct: readNumber(field('workingSetPct')),
      eviction: field('eviction').value
    };
  });
}

// ---- paste ---------------------------------------------------------------

const BUCKET_FIELDS = { documents: 'documents', replicas: 'replicas', eviction: 'eviction' };
const SERVICE_INPUTS = { index: el.indexQuota, search: el.searchQuota, eventing: el.eventingQuota, analytics: el.analyticsQuota };

function setInput(input, value) {
  input.value = String(value);
}

/** Pasted buckets replace the list: a bucket that's already there keeps its sizes, one that isn't is added. */
function applyBuckets(buckets) {
  const rows = new Map([...el.bucketList.querySelectorAll('[data-bucket-row]')].map((row) => [row.querySelector('[data-bucket-field="name"]').value.trim(), row]));
  const keep = new Set();
  for (const bucket of buckets.slice(0, MAX_BUCKETS)) {
    if (!rows.has(bucket.name)) {
      addBucketRow({ name: bucket.name });
      rows.set(bucket.name, el.bucketList.lastElementChild);
    }
    const row = rows.get(bucket.name);
    keep.add(row);
    for (const [key, field] of Object.entries(BUCKET_FIELDS)) {
      if (bucket[key] !== undefined) setInput(row.querySelector(`[data-bucket-field="${field}"]`), bucket[key]);
    }
  }
  for (const row of rows.values()) if (!keep.has(row)) row.remove();
  refreshBucketChrome();
}

function applyCluster({ dataNodes, nodeRamMiB, services }) {
  if (dataNodes !== undefined) setInput(el.dataNodes, dataNodes);
  if (nodeRamMiB !== undefined) setInput(el.nodeRam, Math.round((nodeRamMiB / MIB_PER_GIB) * 10) / 10);
  for (const [service, value] of Object.entries(services ?? {})) setInput(SERVICE_INPUTS[service], value);
}

function describeBucket({ name, documents, documentsFromNodes, documentsFromUnnamedSeries, currentQuotaMiB }) {
  const parts = [];
  if (documents !== undefined) {
    const source =
      documentsFromNodes !== undefined
        ? documentsFromNodes === 1
          ? ' from one node’s /metrics'
          : ` from ${documentsFromNodes} nodes’ /metrics`
        : documentsFromUnnamedSeries
          ? ', read from series without a metric name'
          : '';
    parts.push(`${documents.toLocaleString('en-US')} documents${source}`);
  }
  if (currentQuotaMiB !== undefined) parts.push(`quota now ${currentQuotaMiB} MiB per node`);
  return parts.length ? `${name} (${parts.join(', ')})` : name;
}

function setFeedback(message, state) {
  el.metricsFeedback.textContent = message;
  el.metricsFeedback.className = `prom-feedback is-${state}`;
}

function handlePaste() {
  if (!el.metricsInput.value.trim()) {
    setFeedback('Paste Prometheus metrics or Couchbase REST output above — the kind is detected automatically.', 'empty');
    return;
  }

  const parsed = parseCouchbaseInput(el.metricsInput.value);
  if (parsed.error) {
    setFeedback(parsed.error, 'error');
    return;
  }

  if (parsed.kind === 'cluster') {
    const { dataNodes, nodeRamMiB, services } = parsed.cluster;
    applyCluster(parsed.cluster);
    const parts = [];
    if (dataNodes !== undefined) parts.push(pluralize(dataNodes, 'Data node'));
    if (nodeRamMiB !== undefined) parts.push(`${Math.round((nodeRamMiB / MIB_PER_GIB) * 10) / 10} GiB per node`);
    if (services) parts.push(`${pluralize(Object.values(services).filter(Boolean).length, 'other service')} with a quota`);
    setFeedback(`Cluster info read — ${parts.join(' · ') || 'no node or quota fields found'}.`, parts.length ? 'ok' : 'error');
  } else if (parsed.kind === 'prometheus' || parsed.kind === 'buckets') {
    const source = parsed.kind === 'prometheus' ? 'Prometheus' : 'Bucket API';
    const skipped = parsed.skipped.length ? ` · skipped ${parsed.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}` : '';
    // Pasted buckets replace the list, so a paste with nothing to size (only ephemeral or Memcached buckets)
    // would otherwise remove every bucket entered.
    if (parsed.buckets.length === 0) {
      setFeedback(`${source}: no bucket this calculator sizes${skipped}. Your buckets are unchanged.`, 'error');
      return;
    }
    applyBuckets(parsed.buckets);
    const missing =
      parsed.kind === 'prometheus'
        ? ' Metrics don’t include document size, replicas or eviction — set those yourself.'
        : ' Set the average key and document size yourself.';
    // A bucket with only its quota in the paste keeps the default document count, so say it wasn't read.
    const uncounted = parsed.buckets.filter((bucket) => bucket.documents === undefined).map((bucket) => bucket.name);
    const noCount = uncounted.length ? ` No document count for ${uncounted.join(', ')} (no kv_curr_items) — enter it yourself.` : '';
    // A node's /metrics counts only the items active on that node, so a count from some of the nodes is too low.
    const perNode = parsed.buckets.some((bucket) => bucket.documentsFromNodes !== undefined)
      ? ' A node’s /metrics counts only its own active items: paste every Data node’s output, or use the bucket API for the whole cluster.'
      : '';
    setFeedback(`${source}: ${pluralize(parsed.buckets.length, 'bucket')} — ${parsed.buckets.map(describeBucket).join('; ')}.${noCount}${perNode}${missing}${skipped}`, 'ok');
  } else {
    setFeedback('Nothing recognised. Paste kv_curr_items from /metrics, or the JSON from /pools/default/buckets or /pools/default.', 'error');
    return;
  }
  recalculate();
}

// ---- rendering -----------------------------------------------------------

function renderEmpty(message) {
  el.statRow.replaceChildren();
  renderWarnings([]);
  renderSnippet(null, null);
  renderExplanation(el, message, null);
}

/** The values of "Advanced: sizing defaults and thresholds", as calculateSizing() takes them; an empty field keeps its default. */
function readSettings() {
  const settings = {};
  for (const control of settingControls) {
    const value = control.tagName === 'SELECT' ? control.value : readAdvancedNumber(control);
    if (value !== null) settings[control.dataset.setting] = value;
  }
  return settings;
}

function recalculate() {
  const nodeRamGiB = readNumber(el.nodeRam);
  const dataNodes = readNumber(el.dataNodes);
  if (!(nodeRamGiB > 0) || !Number.isInteger(dataNodes) || dataNodes < 1) {
    renderEmpty('Enter the node RAM and the number of Data nodes to see the calculation.');
    return;
  }

  let result;
  try {
    result = couchbase.format({
      buckets: readBuckets(),
      dataNodes,
      nodeRamMiB: nodeRamGiB * MIB_PER_GIB,
      services: {
        index: readNumber(el.indexQuota) ?? 0,
        search: readNumber(el.searchQuota) ?? 0,
        eventing: readNumber(el.eventingQuota) ?? 0,
        analytics: readNumber(el.analyticsQuota) ?? 0
      },
      settings: readSettings()
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    renderEmpty(`Check the inputs: ${error.message}.`);
    return;
  }

  renderFigures(result.figures);
  renderWarnings(result.warnings);
  renderSnippet(result.snippet, result.alternative);
  renderExplanation(el, result.explanation, result.note, result.explanationSteps);
}

// ---- events --------------------------------------------------------------

el.metricsInput.addEventListener('input', handlePaste);

el.addBucket.addEventListener('click', () => {
  addBucketRow({ name: `bucket${bucketSerial + 1}` });
  recalculate();
});

el.bucketList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-bucket]');
  if (!button) return;
  button.closest('[data-bucket-row]').remove();
  refreshBucketChrome();
  recalculate();
});

el.bucketList.addEventListener('input', recalculate);
el.bucketList.addEventListener('change', recalculate);
for (const input of [el.dataNodes, el.nodeRam, el.indexQuota, el.searchQuota, el.eventingQuota, el.analyticsQuota]) {
  input.addEventListener('input', recalculate);
}
for (const control of settingControls) {
  control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', recalculate);
}

const live = isEnabled('couchbase');
el.disabledState.classList.toggle('is-hidden', live);
el.outputPanels.classList.toggle('is-hidden', !live);
if (live) {
  // The formatter's tooltips name the page's own fields and the advanced settings (by their data-setting).
  for (const [key, text] of Object.entries(couchbase.fieldTips)) {
    const control = el[key] ?? el.advanced.querySelector(`[data-setting="${key}"]`);
    attachTip(document.querySelector(`label[for="${control.id}"]`), control, text);
  }
  initAdvancedSettings(el.advanced, recalculate);
  setMode('manual');
  addBucketRow();
  recalculate();
}
document.documentElement.dataset.calculatorReady = '';
