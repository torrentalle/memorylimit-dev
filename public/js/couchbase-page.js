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
import { copyText } from './clipboard.js';
import * as couchbase from './formatters/couchbase.js';
import { parseCouchbaseInput } from './couchbase-parser.js';

const MIB_PER_GIB = 1024;
const MAX_BUCKETS = 30;
const DEFAULT_BUCKET = { name: 'default', documents: 1000000, keyBytes: 36, documentBytes: 1024, replicas: 1, workingSetPct: 20, eviction: 'value' };

function element(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`MemoryLimit: #${id} is missing from this page`);
  return el;
}

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
  headroom: element('headroom-select'),
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

let bucketSerial = 0;
let currentSnippet = null;
let copyResetTimer = null;
let renderedWarnings = '';

// ---- bucket rows ---------------------------------------------------------

function fieldNode({ id, label, unit, control }) {
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
  field.append(labelNode, control);
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
    fieldNode({ id: `bucket-${serial}-documents`, label: 'Documents', control: numberInput('documents', bucket.documents) }),
    fieldNode({ id: `bucket-${serial}-key`, label: 'Average key length', unit: 'bytes', control: numberInput('keyBytes', bucket.keyBytes) }),
    fieldNode({ id: `bucket-${serial}-size`, label: 'Average document size', unit: 'bytes', control: numberInput('documentBytes', bucket.documentBytes) }),
    fieldNode({
      id: `bucket-${serial}-replicas`,
      label: 'Replicas',
      control: selectInput('replicas', [0, 1, 2, 3].map((n) => [String(n), String(n)]), bucket.replicas)
    }),
    fieldNode({
      id: `bucket-${serial}-working-set`,
      label: 'Working set in RAM',
      unit: '%',
      control: numberInput('workingSetPct', bucket.workingSetPct, { min: 1, step: 1 })
    }),
    fieldNode({
      id: `bucket-${serial}-eviction`,
      label: 'Eviction policy',
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

// Same toggle as the other calculators; the form stays visible in both modes so a paste can be reviewed and edited.
function setMode(mode) {
  const paste = mode === 'paste';
  el.modePaste.setAttribute('aria-pressed', String(paste));
  el.modeManual.setAttribute('aria-pressed', String(!paste));
  el.pastePanel.classList.toggle('is-hidden', !paste);
  el.manualPanel.classList.toggle('is-hidden', paste);
}

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

const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function describeBucket({ name, documents, currentQuotaMiB }) {
  const parts = [];
  if (documents !== undefined) parts.push(`${documents.toLocaleString('en-US')} documents`);
  if (currentQuotaMiB !== undefined) parts.push(`quota now ${currentQuotaMiB} MiB`);
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
    if (dataNodes !== undefined) parts.push(count(dataNodes, 'Data node'));
    if (nodeRamMiB !== undefined) parts.push(`${Math.round((nodeRamMiB / MIB_PER_GIB) * 10) / 10} GiB per node`);
    if (services) parts.push(`${count(Object.values(services).filter(Boolean).length, 'other service')} with a quota`);
    setFeedback(`Cluster info read — ${parts.join(' · ') || 'no node or quota fields found'}.`, parts.length ? 'ok' : 'error');
  } else if (parsed.kind === 'prometheus' || parsed.kind === 'buckets') {
    applyBuckets(parsed.buckets);
    const source = parsed.kind === 'prometheus' ? 'Prometheus' : 'Bucket API';
    const skipped = parsed.skipped.length ? ` · skipped ${parsed.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}` : '';
    const missing =
      parsed.kind === 'prometheus'
        ? ' Metrics don’t include document size, replicas or eviction — set those yourself.'
        : ' Set the average key and document size yourself.';
    setFeedback(`${source}: ${count(parsed.buckets.length, 'bucket')} — ${parsed.buckets.map(describeBucket).join('; ')}.${missing}${skipped}`, 'ok');
  } else {
    setFeedback('Nothing recognised. Paste kv_curr_items from /metrics, or the JSON from /pools/default/buckets or /pools/default.', 'error');
    return;
  }
  recalculate();
}

// ---- rendering -----------------------------------------------------------

function renderFigures(figures) {
  el.statRow.replaceChildren(
    ...figures.map(({ role, label, text, detail }) => {
      const card = document.createElement('div');
      card.className = `stat-card${role === 'total' ? ' stat-card--accent' : ''}`;
      const parts = [
        ['stat-card__label', label],
        ['stat-card__value', text],
        ['stat-card__sub', detail]
      ].map(([className, content]) => {
        const p = document.createElement('p');
        p.className = className;
        p.textContent = content;
        return p;
      });
      card.append(...parts);
      return card;
    })
  );
}

// The warnings region is aria-live, so only touch it when the warnings
// actually change; re-rendering on every keystroke re-announces them.
function renderWarnings(warnings) {
  const signature = warnings.map((w) => `${w.code}:${w.message}`).join('|');
  if (signature === renderedWarnings) return;
  renderedWarnings = signature;

  el.warnings.replaceChildren(
    ...warnings.map((warning) => {
      const item = document.createElement('div');
      item.className = `warning-item${warning.level === 'error' ? ' is-error' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'warning-item__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = warning.level === 'error' ? '✕' : '▲';
      const text = document.createElement('span');
      text.textContent = warning.message;
      item.append(icon, text);
      return item;
    })
  );
}

function renderSnippet(snippet, alternative) {
  currentSnippet = snippet;
  el.snippetTitle.textContent = snippet ? snippet.label : 'Snippet';
  el.snippetCode.textContent = snippet ? snippet.code : '—';
  el.copyButton.disabled = !snippet;
  if (copyResetTimer === null) el.copyButton.textContent = 'Copy snippet';

  el.snippetNote.textContent = alternative ? `${alternative.label}:\n${alternative.code}` : '';
  el.snippetNote.classList.toggle('is-hidden', !alternative);
}

function renderExplanation(explanation, note) {
  el.explanation.textContent = explanation;
  el.explanationNote.textContent = note ?? '';
  el.explanationNote.classList.toggle('is-hidden', !note);
}

function renderEmpty(message) {
  el.statRow.replaceChildren();
  renderWarnings([]);
  renderSnippet(null, null);
  renderExplanation(message, null);
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
      headroom: el.headroom.value
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    renderEmpty(`Check the inputs: ${error.message}.`);
    return;
  }

  renderFigures(result.figures);
  renderWarnings(result.warnings);
  renderSnippet(result.snippet, result.alternative);
  renderExplanation(result.explanation, result.note);
}

// ---- events --------------------------------------------------------------

el.modePaste.addEventListener('click', () => setMode('paste'));
el.modeManual.addEventListener('click', () => setMode('manual'));
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
el.headroom.addEventListener('change', recalculate);

el.copyButton.addEventListener('click', async () => {
  if (!currentSnippet) return;
  const copied = await copyText(currentSnippet.code);
  clearTimeout(copyResetTimer);
  el.copyButton.textContent = copied ? 'Copied' : 'Copy failed — select the text';
  el.copyButton.classList.toggle('is-copied', copied);
  copyResetTimer = setTimeout(() => {
    copyResetTimer = null;
    el.copyButton.textContent = 'Copy snippet';
    el.copyButton.classList.remove('is-copied');
  }, 1600);
});

const live = isEnabled('couchbase');
el.disabledState.classList.toggle('is-hidden', live);
el.outputPanels.classList.toggle('is-hidden', !live);
if (live) {
  setMode('manual');
  addBucketRow();
  recalculate();
}
document.documentElement.dataset.calculatorReady = '';
