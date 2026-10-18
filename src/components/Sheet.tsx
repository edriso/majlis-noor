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
 * A side drawer on a wide screen and a sheet from the bottom on a narrow one,
 * decided in CSS.
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
 * Escape and the backdrop close it, as everywhere.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  onBack,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** A panel opened from another one goes back to it instead of closing. */
  onBack?: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);
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
  // settings, and back) removes the button that was pressed; focus goes to
  // the new title instead of falling out of the sheet.
  useEffect(() => {
    const el = dialog.current;
    if (el?.open && !el.contains(document.activeElement))
      heading.current?.focus({ preventScroll: true });
  }, [title]);

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

  // A sheet that leaves with its screen («إنهاء الحلقة» in the settings)
  // never hears `close`, so the scrollbar's room is given back here too.
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
      <div className="sheet" ref={panel}>
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
