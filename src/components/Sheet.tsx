import { Dialog } from '@base-ui/react/dialog';
import { ArrowRight, X } from './icons';
import { useRef, type ReactNode } from 'react';

/**
 * The one panel the app slides in: settings, the reciter list, and the halaqa
 * on a phone. A side drawer on a wide screen and a sheet from the bottom on a
 * narrow one, decided in CSS.
 *
 * Focus lands on the title rather than on «إغلاق», so a screen reader hears
 * what opened instead of how to leave it, and returns to whatever opened the
 * panel when it closes. Escape and the backdrop close it, as everywhere.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  onBack,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** A panel opened from another one goes back to it instead of closing. */
  onBack?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => onOpenChange(v)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="sheet-backdrop" />
        <Dialog.Popup
          className={wide ? 'sheet sheet-wide' : 'sheet'}
          dir="rtl"
          initialFocus={heading}
        >
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
            <Dialog.Title className="sheet-title" tabIndex={-1} ref={heading}>
              {title}
            </Dialog.Title>
            <Dialog.Close className="icon-button sheet-close" aria-label="إغلاق">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </header>
          {description ? (
            <Dialog.Description className="visually-hidden">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="sheet-body">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
