import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, X } from './icons';

/**
 * The one panel the app slides in: settings, the reciter list, and the jump.
 * A sheet from the bottom on a narrow screen, sized to what it holds. On a
 * wide one, a side drawer the height of the screen for a long panel, or,
 * for a short one (`variant="dialog"`), a box in the middle sized to what
 * it holds, so a few controls are not left at the top of an empty column.
 * Decided in CSS.
 *
 * It is a native <dialog> opened with showModal(), which puts it above
 * everything, makes the page behind it inert and turns Escape into a
 * `cancel` event. The dialog covers the screen and dims it; the panel is
 * inside it, so a tap whose target is the dialog itself is a tap outside the
 * panel. The browser is told to open and close it through a ref, never
 * through the `open` attribute, which would open it without the top layer.
 *
 * Focus lands on the title rather than on «إغلاق», so a screen reader hears
 * what opened instead of how to leave it, and goes back to whatever opened
 * the panel when it closes, which Safari does not promise to do itself.
 * A panel that changes in place (the circle's form or the list of sheikhs
 * opened from the menu) is a step forward, and focus goes to its title; a
 * step back, by «رجوع» or by choosing, returns it to the control that
 * stepped forward, so the hand is where it was. Escape and the backdrop
 * close it, as everywhere.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  onBack,
  variant = 'drawer',
  onClosed,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** A panel opened from another one goes back to it instead of closing. */
  onBack?: () => void;
  /** On a wide screen: `drawer` for a long panel (settings, the reciter
      list), `dialog` for a short one (the jump, a confirmation). */
  variant?: 'drawer' | 'dialog';
  /** Once it has gone, its exit played and the focus given back: for a
      panel that must open after it rather than over it. */
  onClosed?: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);
  // The panels shown in place, the first opened first, each with the
  // control last used in it.
  const trail = useRef<{ title: string; spot: Spot | null }[]>([]);
  const titleNow = useEffectEvent(() => title);
  // A press that starts in the panel and ends on the backdrop (selecting
  // text, a slip of the finger) clicks the dialog too, and is not a tap
  // outside.
  const pressedOutside = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  // In the page from the moment it opens until the browser says it has
  // closed, which is after its exit has played.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open) {
      // Opened again while it was leaving: the panel slides back.
      delete el.dataset.closing;
      if (el.open) return;
      opener.current = document.activeElement;
      trail.current = [{ title: titleNow(), spot: null }];
      // Locking the page's scroll hides a classic scrollbar, and the page
      // would widen behind the sheet; it keeps the scrollbar's room.
      const root = document.documentElement;
      if (window.innerWidth > root.clientWidth)
        root.style.scrollbarGutter = 'stable';
      el.showModal();
      heading.current?.focus({ preventScroll: true });
      return;
    }
    if (!el.open) return;
    // Only Chrome animates a dialog's close by itself, so the exit plays
    // here first, from CSS, and the dialog closes when it has. Under
    // reduced motion, or without the Web Animations API, it closes at once.
    if (
      typeof el.getAnimations !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      el.close();
      return;
    }
    el.dataset.closing = '';
    let cancelled = false;
    const running = [el, panel.current].flatMap(
      (part) => part?.getAnimations() ?? [],
    );
    void Promise.allSettled(running.map((a) => a.finished)).then(() => {
      if (!cancelled) el.close();
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // A panel that changes in place (the reciter list opened from the
  // settings, and back) removes the button that was pressed. Stepping
  // forward, focus goes to the new title instead of falling out of the
  // sheet; stepping back to the panel before, to the control that left it,
  // found again in the panel drawn afresh.
  useEffect(() => {
    const el = dialog.current;
    const steps = trail.current;
    const back = steps.length > 1 && steps[steps.length - 2].title === title;
    if (back) steps.pop();
    else if (steps.at(-1)?.title !== title) steps.push({ title, spot: null });
    if (!el?.open) return;
    const spot = back ? steps[steps.length - 1].spot : null;
    const found = spot && panel.current ? findSpot(panel.current, spot) : null;
    if (found) found.focus({ preventScroll: true });
    else if (!el.contains(document.activeElement))
      heading.current?.focus({ preventScroll: true });
  }, [title]);

  // The control last used in the panel shown, for the step back above.
  // A press is heard as well as focus: Safari does not focus a button it
  // clicks. Both are heard as they start, before the press changes the
  // panel.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const note = (e: Event) => {
      const spot = spotOf(el, e.target);
      const step = trail.current.at(-1);
      if (spot && step) step.spot = spot;
    };
    el.addEventListener('focusin', note);
    el.addEventListener('click', note, true);
    return () => {
      el.removeEventListener('focusin', note);
      el.removeEventListener('click', note, true);
    };
  }, [mounted]);

  // A tap on the dimmed screen closes the sheet. Escape and «إغلاق» do the
  // same from the keyboard, so this one is for pointers alone, and listens
  // on the element itself.
  const dismiss = useEffectEvent(() => onOpenChange(false));
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const press = (e: PointerEvent) => {
      pressedOutside.current = e.target === el;
    };
    const click = (e: MouseEvent) => {
      if (e.target === el && pressedOutside.current) dismiss();
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('click', click);
    return () => {
      el.removeEventListener('pointerdown', press);
      el.removeEventListener('click', click);
    };
  }, [mounted]);

  // A sheet that leaves with its screen (the close card, whose «إنهاء»
  // ends the sitting) never hears `close`, so the scrollbar's room is
  // given back here too.
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('scrollbar-gutter');
    },
    [],
  );

  // State follows the dialog's `close` event, however it closed: the exit
  // above, or the browser closing it on an Escape it did not let us cancel.
  const onClose = () => {
    if (dialog.current?.open) return;
    setMounted(false);
    document.documentElement.style.removeProperty('scrollbar-gutter');
    const back = opener.current;
    opener.current = null;
    if (back instanceof HTMLElement) back.focus({ preventScroll: true });
    if (open) onOpenChange(false);
    onClosed?.();
  };

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="sheet-dialog"
      dir="rtl"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        // Escape asks to close, like every other way out, so the exit
        // plays; the parent decides.
        e.preventDefault();
        onOpenChange(false);
      }}
      onClose={onClose}
    >
      <div className="sheet" data-variant={variant} ref={panel}>
        <header className="sheet-header">
          {onBack ? (
            <button
              type="button"
              className="icon-button"
              aria-label="رجوع"
              onClick={onBack}
            >
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          ) : null}
          <h2 id={titleId} className="sheet-title" tabIndex={-1} ref={heading}>
            {title}
          </h2>
          <button
            type="button"
            className="icon-button sheet-close"
            aria-label="إغلاق"
            onClick={() => onOpenChange(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {description ? (
          <p id={descriptionId} className="visually-hidden">
            {description}
          </p>
        ) : null}
        <div className="sheet-body">{children}</div>
      </div>
    </dialog>,
    document.body,
  );
}

/** What can hold the focus in a panel's body. */
const FOCUSABLE =
  'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/** A control as it can be found again once its panel is drawn afresh,
    when React has made every element anew: by its id if it keeps one, by
    what it says, or else by its place among the panel's controls. */
type Spot = { id: string; name: string; index: number };

const nameOf = (el: Element) =>
  (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();

function spotOf(panel: HTMLElement, target: EventTarget | null): Spot | null {
  const body = panel.querySelector('.sheet-body');
  if (!(target instanceof Element) || !body?.contains(target)) return null;
  const el = target.closest(FOCUSABLE);
  if (!el) return null;
  const all = [...body.querySelectorAll(FOCUSABLE)];
  return { id: el.id, name: nameOf(el), index: all.indexOf(el) };
}

/** The control a spot names, in the panel as it is now. A sheikh just
    chosen has changed the words of the row that chose him, which is then
    found by its place. */
function findSpot(panel: HTMLElement, spot: Spot): HTMLElement | null {
  const body = panel.querySelector('.sheet-body');
  if (!body) return null;
  const all = [...body.querySelectorAll<HTMLElement>(FOCUSABLE)];
  return (
    (spot.id && all.find((el) => el.id === spot.id)) ||
    all.find((el) => nameOf(el) === spot.name) ||
    all[Math.min(spot.index, all.length - 1)] ||
    null
  );
}
