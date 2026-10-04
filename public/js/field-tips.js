/**
 * "?" tooltips next to a field's label, saying in one sentence how the field
 * moves the result. Shared by the calculator page (app.js) and the Couchbase
 * page script.
 */

const TIP_MARGIN = 8;

/**
 * Wraps a field's label in a row with a "?" button whose tooltip holds `text`: a bubble above the button that
 * shows while the button is hovered or focused (and while the bubble itself is hovered), Escape hides it, and the control
 * is described by it so screen readers read the sentence with the field. Returns the element to put in
 * place of the label.
 */
export function attachTip(label, control, text) {
  const tipId = `${control.id}-tip`;
  const head = document.createElement('div');
  head.className = 'field-head';
  if (label.parentNode) label.replaceWith(head);

  const row = document.createElement('div');
  row.className = 'field-label-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hint-tip__btn';
  button.textContent = '?';
  button.setAttribute('aria-label', `How ${label.firstChild.textContent.trim()} affects the result`);
  button.setAttribute('aria-describedby', tipId);
  row.append(label, button);

  const tip = document.createElement('span');
  tip.className = 'hint-tip__text';
  tip.id = tipId;
  tip.setAttribute('role', 'tooltip');
  tip.textContent = text;

  control.setAttribute('aria-describedby', tipId);
  head.append(row, tip);
  for (const type of ['pointerenter', 'focus']) button.addEventListener(type, () => placeTip(button, tip));
  return head;
}

/**
 * Centres the bubble on its button, shifted to stay inside the viewport, with the arrow still pointing at
 * the button; flips it below the label when there's no room above. Runs just before the bubble shows (it's
 * laid out while hidden, so it can be measured).
 */
function placeTip(button, tip) {
  const head = tip.parentElement.getBoundingClientRect();
  const anchor = button.getBoundingClientRect();
  const { width, height } = tip.getBoundingClientRect();
  const centre = anchor.left + anchor.width / 2;
  const left = Math.max(TIP_MARGIN, Math.min(centre - width / 2, window.innerWidth - TIP_MARGIN - width));
  tip.style.left = `${left - head.left}px`;
  tip.style.setProperty('--arrow-x', `${centre - left}px`);
  tip.classList.toggle('is-below', anchor.top - height - TIP_MARGIN * 2 < 0);
}

// WCAG 1.4.13: a tooltip must be dismissable without moving the pointer or focus.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.body.classList.add('tips-dismissed');
});
document.addEventListener('pointerover', (event) => {
  if (event.target.closest?.('.hint-tip__btn')) document.body.classList.remove('tips-dismissed');
});
document.addEventListener('focusin', (event) => {
  if (event.target.closest?.('.hint-tip__btn')) document.body.classList.remove('tips-dismissed');
});
