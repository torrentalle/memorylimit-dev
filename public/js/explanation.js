/**
 * Renders "How this was derived": the formatter's steps as a list when it
 * returns `explanationSteps`, its one-paragraph `explanation` otherwise, and
 * the optional note below. Shared by app.js and the Couchbase page script.
 */

/**
 * @param {{ explanation: HTMLElement, explanationNote: HTMLElement }} el
 * @param {string} explanation - plain-text fallback
 * @param {string | null} note
 * @param {Array<{ label: string, text: string }> | null} [steps]
 */
export function renderExplanation(el, explanation, note, steps = null) {
  if (steps) {
    const list = document.createElement('ul');
    list.className = 'explanation-steps';
    list.append(
      ...steps.map(({ label, text }) => {
        const item = document.createElement('li');
        const term = document.createElement('strong');
        term.textContent = `${label}:`;
        item.append(term, ` ${text}`);
        return item;
      })
    );
    el.explanation.replaceChildren(list);
  } else {
    el.explanation.textContent = explanation;
  }
  el.explanationNote.textContent = note ?? '';
  el.explanationNote.classList.toggle('is-hidden', !note);
}
