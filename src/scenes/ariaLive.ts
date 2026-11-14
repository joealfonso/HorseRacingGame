// The aria-live mirror (docs/specs/track-hub.md section 7): one visually hidden, polite live
// region beside the canvas, so a screen reader hears what a screen says in words. The game
// keeps no state here; a screen hands it its text, and only a change is announced.

const ID = 'aria-live';

function region(): HTMLElement {
  let el = document.getElementById(ID);
  if (el === null) {
    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('role', 'status');
    // Visually hidden, still read: the usual clip pattern.
    el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    document.body.appendChild(el);
  }
  return el;
}

/** Puts `text` in the live region if it differs from what is there. */
export function announce(text: string): void {
  const el = region();
  if (el.textContent !== text) el.textContent = text;
}
