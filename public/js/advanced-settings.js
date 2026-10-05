/**
 * The "Advanced" section every calculator page has ("margins and defaults";
 * on Couchbase "sizing defaults and thresholds"): a <details>
 * closed by default, holding the values the result relies on that are either
 * MemoryLimit's own choices or vendor defaults you can change. Each control's
 * default is its HTML default (value attribute, selected option), so the
 * summary can count what differs from it and "Reset to defaults" can put it
 * back. Shared by app.js and the Couchbase page script.
 */

function defaultIndex(select) {
  const index = [...select.options].findIndex((option) => option.defaultSelected);
  return index === -1 ? 0 : index;
}

function isChanged(control) {
  return control.tagName === 'SELECT' ? control.selectedIndex !== defaultIndex(control) : control.value !== control.defaultValue;
}

// What a field's data-unit converts its value by: a percentage arrives as a fraction, GiB as MiB.
const UNIT_FACTORS = { percent: 1 / 100, gib: 1024 };

/**
 * Reads a number input the section holds: null when empty or not a number, otherwise the value kept within the
 * input's min and max, and converted by its data-unit (percent → fraction, gib → MiB).
 */
export function readAdvancedNumber(input) {
  const value = parseFloat(input.value);
  if (!Number.isFinite(value)) return null;
  const min = input.min === '' ? -Infinity : Number(input.min);
  const max = input.max === '' ? Infinity : Number(input.max);
  const kept = Math.min(max, Math.max(min, value));
  return kept * (UNIT_FACTORS[input.dataset.unit] ?? 1);
}

/**
 * @param {HTMLDetailsElement} details - the section
 * @param {() => void} onReset - called after "Reset to defaults" puts the values back
 * @returns {{ refresh: () => void }} refresh() updates the count of changed values
 */
export function initAdvancedSettings(details, onReset) {
  const controls = [...details.querySelectorAll('input, select')];
  const count = details.querySelector('[data-advanced-count]');
  const reset = details.querySelector('[data-advanced-reset]');

  function refresh() {
    const changed = controls.filter((control) => !control.closest('.is-hidden, [hidden]') && isChanged(control)).length;
    count.textContent = changed ? `${changed} changed` : '';
    reset.disabled = changed === 0;
  }

  for (const control of controls) control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', refresh);
  reset.addEventListener('click', () => {
    for (const control of controls) {
      if (control.tagName === 'SELECT') control.selectedIndex = defaultIndex(control);
      else control.value = control.defaultValue;
    }
    refresh();
    onReset();
  });
  refresh();
  return { refresh };
}
