/**
 * Calculator page wiring: reads the form, runs calculateRawSizing() and the
 * page's formatter, and renders the result. All sizing math and
 * platform-specific output live in ./calculator.js and ./formatters/.
 */
import { calculateRawSizing } from './calculator.js';
import { parseAndAnalyze } from './prometheus-parser.js';
import { isEnabled } from './platforms.js';

const GAUGE_HEADROOM = 1.15;
const MAX_REPLICAS = 1000;

function element(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`MemoryLimit: #${id} is missing from this page`);
  return el;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatMiB(value) {
  return `${Math.round(value)}Mi`;
}

function readPositiveNumber(input) {
  const value = parseFloat(input.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function copyLabelFor(snippet) {
  return snippet?.language === 'yaml' ? 'Copy YAML' : 'Copy snippet';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }
}

/**
 * @param {object} options
 * @param {string} options.platformId - id from ./platforms.js
 * @param {{ format: Function }} options.formatter - the page's formatter module
 */
export function initCalculator({ platformId, formatter }) {
  const el = {
    modePaste: element('mode-paste-btn'),
    modeManual: element('mode-manual-btn'),
    pastePanel: element('mode-paste'),
    manualPanel: element('mode-manual'),
    promInput: element('prom-input'),
    promFeedback: element('prom-feedback'),
    avg: element('avg-input'),
    peak: element('peak-input'),
    workload: element('workload-select'),
    replicasField: element('replicas-field'),
    replicas: element('replicas-input'),
    sensitivity: element('sensitivity-select'),
    environment: element('environment-select'),
    qos: document.getElementById('qos-select'),
    disabledState: element('disabled-state'),
    outputPanels: element('output-panels'),
    gaugeTrack: element('gauge-track'),
    gaugeFill: element('gauge-fill'),
    gaugeMarkers: element('gauge-markers'),
    gaugeScaleMax: element('gauge-scale-max'),
    gaugeLegend: element('gauge-legend'),
    statRow: element('stat-row'),
    warnings: element('warnings'),
    snippetTitle: element('snippet-title'),
    snippetCode: element('snippet-code'),
    snippetNote: element('snippet-secondary-note'),
    copyButton: element('copy-snippet'),
    explanation: element('explanation'),
    explanationNote: element('explanation-note')
  };

  const live = isEnabled(platformId);
  el.disabledState.classList.toggle('is-hidden', live);
  el.outputPanels.classList.toggle('is-hidden', !live);
  if (!live) return;

  let currentSnippet = null;
  let copyResetTimer = null;
  let renderedWarnings = '';
  // True while the average/peak fields hold values filled in from the paste
  // box, so clearing or breaking the paste also clears them instead of
  // leaving stale results on screen. Typing in the fields takes them over.
  let fieldsFilledFromPaste = false;

  // ---- input mode --------------------------------------------------------

  function setMode(mode) {
    const paste = mode === 'paste';
    el.modePaste.setAttribute('aria-pressed', String(paste));
    el.modeManual.setAttribute('aria-pressed', String(!paste));
    el.pastePanel.classList.toggle('is-hidden', !paste);
    el.manualPanel.classList.toggle('is-hidden', paste);
  }

  // ---- paste parsing -----------------------------------------------------

  function clearPastedFields() {
    if (!fieldsFilledFromPaste) return;
    el.avg.value = '';
    el.peak.value = '';
    fieldsFilledFromPaste = false;
    recalculate();
  }

  function describeDiscarded({ skippedSeries, ignoredLines }) {
    const parts = [];
    if (skippedSeries) parts.push(`skipped ${skippedSeries} pod-level/pause series`);
    if (ignoredLines) parts.push(`${ignoredLines} unreadable line${ignoredLines === 1 ? '' : 's'} ignored`);
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  }

  function handlePaste() {
    const text = el.promInput.value;
    if (!text.trim()) {
      el.promFeedback.textContent = 'Paste raw samples above — every numeric value is parsed automatically.';
      el.promFeedback.className = 'prom-feedback is-empty';
      clearPastedFields();
      return;
    }

    const analysis = parseAndAnalyze(text);
    if (analysis.count === 0) {
      el.promFeedback.textContent = `No memory samples found.${describeDiscarded(analysis)}`;
      el.promFeedback.className = 'prom-feedback is-error';
      clearPastedFields();
      return;
    }

    el.avg.value = Math.round(analysis.averageMiB * 10) / 10;
    el.peak.value = Math.round(analysis.peakMiB * 10) / 10;
    fieldsFilledFromPaste = true;

    const unitLabel = analysis.unit === 'bytes' ? 'bytes → MiB' : 'already MiB';
    el.promFeedback.textContent =
      `${analysis.count} sample${analysis.count === 1 ? '' : 's'} parsed (${unitLabel}) — ` +
      `avg ${formatMiB(analysis.averageMiB)}, peak ${formatMiB(analysis.peakMiB)}${describeDiscarded(analysis)}`;
    el.promFeedback.className = 'prom-feedback is-ok';
    recalculate();
  }

  // ---- rendering ---------------------------------------------------------

  function renderGauge(averageMiB, markers) {
    const max = Math.max(averageMiB, ...markers.map((m) => m.value)) * GAUGE_HEADROOM;
    const pct = (value) => `${clamp((value / max) * 100, 0, 100)}%`;

    el.gaugeFill.style.width = pct(averageMiB);
    el.gaugeMarkers.replaceChildren(
      ...markers.map((marker) => {
        const node = document.createElement('div');
        node.className = `gauge__marker gauge__marker--${marker.role}`;
        node.style.left = pct(marker.value);
        const flag = document.createElement('span');
        flag.className = 'gauge__marker-flag';
        flag.textContent = `${marker.name} ${marker.text}`;
        node.append(flag);
        return node;
      })
    );
    el.gaugeScaleMax.textContent = `${Math.round(max).toLocaleString()} MiB`;
    el.gaugeTrack.setAttribute(
      'aria-label',
      [`average usage ${formatMiB(averageMiB)}`, ...markers.map((m) => `${m.name} ${m.text}`)].join(', ')
    );

    const legendItems = [{ role: 'fill', name: 'average usage' }, ...markers];
    el.gaugeLegend.replaceChildren(
      ...legendItems.flatMap(({ role, name }) => {
        const swatch = document.createElement('span');
        swatch.className = `legend-swatch legend-swatch--${role}`;
        return [swatch, ` ${name}  `];
      })
    );
  }

  function resetGauge() {
    el.gaugeFill.style.width = '0%';
    el.gaugeMarkers.replaceChildren();
    el.gaugeScaleMax.textContent = '—';
    el.gaugeLegend.replaceChildren();
    el.gaugeTrack.setAttribute('aria-label', 'No usage data yet');
  }

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
    if (copyResetTimer === null) el.copyButton.textContent = copyLabelFor(snippet);

    el.snippetNote.textContent = alternative ? `${alternative.label}: ${alternative.code}` : '';
    el.snippetNote.classList.toggle('is-hidden', !alternative);
  }

  function renderExplanation(explanation, note) {
    el.explanation.textContent = explanation;
    el.explanationNote.textContent = note ?? '';
    el.explanationNote.classList.toggle('is-hidden', !note);
  }

  function recalculate() {
    const averageMiB = readPositiveNumber(el.avg);
    const peakMiB = readPositiveNumber(el.peak);

    if (averageMiB === null || peakMiB === null) {
      resetGauge();
      el.statRow.replaceChildren();
      renderWarnings([]);
      renderSnippet(null, null);
      renderExplanation('Enter usage data to see the calculation.', null);
      return;
    }

    const raw = calculateRawSizing({
      averageMiB,
      peakMiB,
      workloadType: el.workload.value,
      sensitivity: el.sensitivity.value,
      environment: el.environment.value,
      replicas: clamp(Math.round(parseFloat(el.replicas.value) || 1), 1, MAX_REPLICAS)
    });
    const result = formatter.format(raw, el.qos ? { qos: el.qos.value } : {});

    renderGauge(raw.averageMiB, result.markers);
    renderFigures(result.figures);
    renderWarnings(result.warnings);
    renderSnippet(result.snippet, result.alternative);
    renderExplanation(result.explanation, result.note);
  }

  // ---- events ------------------------------------------------------------

  el.modePaste.addEventListener('click', () => setMode('paste'));
  el.modeManual.addEventListener('click', () => setMode('manual'));
  el.promInput.addEventListener('input', handlePaste);

  for (const input of [el.avg, el.peak]) {
    input.addEventListener('input', () => {
      fieldsFilledFromPaste = false;
    });
  }
  for (const input of [el.avg, el.peak, el.replicas]) {
    input.addEventListener('input', recalculate);
  }
  for (const select of [el.workload, el.sensitivity, el.environment, el.qos].filter(Boolean)) {
    select.addEventListener('change', recalculate);
  }

  el.copyButton.addEventListener('click', async () => {
    if (!currentSnippet) return;
    const copied = await copyText(currentSnippet.code);
    clearTimeout(copyResetTimer);
    el.copyButton.textContent = copied ? 'Copied' : 'Copy failed — select the text';
    el.copyButton.classList.toggle('is-copied', copied);
    copyResetTimer = setTimeout(() => {
      copyResetTimer = null;
      el.copyButton.textContent = copyLabelFor(currentSnippet);
      el.copyButton.classList.remove('is-copied');
    }, 1600);
  });

  setMode('manual');
  recalculate();
}
