/**
 * The parts of a calculator page both page scripts share — ./app.js and the
 * Couchbase page's ./couchbase-page.js: the paste/manual toggle, and the
 * result panels (stat cards, warnings, and the snippet with its copy button).
 * Each page script keeps only its own inputs and calculation.
 */
import { copyText } from './clipboard.js';

export function element(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`MemoryLimit: #${id} is missing from this page`);
  return el;
}

function copyLabelFor(snippet) {
  return snippet?.language === 'yaml' ? 'Copy YAML' : 'Copy snippet';
}

/**
 * Wires the paste/manual toggle.
 * @param {{ modePaste: HTMLElement, modeManual: HTMLElement, pastePanel: HTMLElement, manualPanel: HTMLElement }} el
 * @returns {(mode: 'paste' | 'manual') => void} sets the mode
 */
export function initModeToggle(el) {
  function setMode(mode) {
    const paste = mode === 'paste';
    el.modePaste.setAttribute('aria-pressed', String(paste));
    el.modeManual.setAttribute('aria-pressed', String(!paste));
    el.pastePanel.classList.toggle('is-hidden', !paste);
    el.manualPanel.classList.toggle('is-hidden', paste);
  }
  el.modePaste.addEventListener('click', () => setMode('paste'));
  el.modeManual.addEventListener('click', () => setMode('manual'));
  return setMode;
}

/**
 * The result panels, and the copy button they share.
 * @param {{ statRow: HTMLElement, warnings: HTMLElement, snippetTitle: HTMLElement, snippetCode: HTMLElement,
 *   snippetNote: HTMLElement, copyButton: HTMLButtonElement }} el
 */
export function createResultView(el) {
  let currentSnippet = null;
  let copyResetTimer = null;
  let renderedWarnings = '';

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

    // Code of more than one line starts on its own line, so it can be copied as it is.
    const separator = alternative?.code.includes('\n') ? ':\n' : ': ';
    el.snippetNote.textContent = alternative ? `${alternative.label}${separator}${alternative.code}` : '';
    el.snippetNote.classList.toggle('is-hidden', !alternative);
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

  return { renderFigures, renderWarnings, renderSnippet };
}
