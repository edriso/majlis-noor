/* What the tests ask of every control's name, shared so each screen's
   tests can hold its controls to it: that it has one, and that it begins
   with the words the control shows (WCAG 2.5.3), so someone speaking to
   their device can say what they see. Only tests import this. */

/** Every button, field and link with no name at all. */
export const unnamed = (root: ParentNode = document) =>
  [...root.querySelectorAll('button, input, select, a')].filter((el) => {
    const labelled =
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      (el as HTMLInputElement).labels?.length ||
      el.textContent?.trim();
    return !labelled;
  });

/** Words alone, as someone speaking to their device says them. */
const words = (s: string) =>
  s
    .replace(/[،؛:.…·—–()«»/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The text nodes under `el`, but those inside `skip`. */
const texts = (el: Element, skip: (parent: Element) => boolean) => {
  const out: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode())
    if (!skip(n.parentElement!)) out.push(n as Text);
  return out;
};

/** A control's name: its aria-label, the elements its aria-labelledby
    names, or its words (a radio's, its label's) but those hidden from
    screen readers. */
const nameOf = (el: Element) => {
  const label = el.getAttribute('aria-label');
  if (label) return label;
  const by = el.getAttribute('aria-labelledby');
  if (by)
    return by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
  const from = el instanceof HTMLInputElement ? el.labels?.[0] : el;
  return from
    ? texts(from, (p) => !!p.closest('[aria-hidden="true"]'))
        .map((t) => t.data)
        .join(' ')
    : '';
};

/** The words a control shows, but those kept for screen readers alone. A
    radio described by its hint shows the hint too, but is not named by
    it, so the hint is left out; and so is what is hidden from screen
    readers as decoration, such as a sheikh's initial in place of his
    photo, which is a picture of a letter and not a label anyone reads
    out. */
const shownBy = (el: Element) => {
  const from = el instanceof HTMLInputElement ? el.labels?.[0] : el;
  if (!from) return '';
  return texts(
    from,
    (p) => !!p.closest('.visually-hidden, .choice-hint, [aria-hidden="true"]'),
  )
    .map((t) => t.data)
    .join(' ');
};

/** Every button and radio whose name does not begin with the words it
    shows. */
export const misnamed = (root: ParentNode = document) =>
  [...root.querySelectorAll('button, input[type="radio"]')].flatMap((el) => {
    const name = words(nameOf(el));
    const shown = words(shownBy(el));
    return shown && !name.startsWith(shown)
      ? [`«${shown}» named «${name}»`]
      : [];
  });
