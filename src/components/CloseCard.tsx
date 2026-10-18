import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { Summary } from '@/halaqa/state';
import { cardImage } from '@/sitting/cardImage';
import { cardText } from '@/sitting/cardText';
import { imageName, saveImage } from '@/sitting/saveImage';
import { Check } from './icons';
import { LogoMark } from './Logo';
import { Sheet } from './Sheet';

/** A sitting being closed: what it read, as the model sums it up, and when
    «إنهاء المجلس» was pressed, which the card dates itself by. */
export type Closing = { summary: Summary; endedAt: number };

/** Where saving the picture has got to. */
type Saving = 'idle' | 'busy' | 'saved' | 'failed';

/* The button says each step in its own words, and its name is those words
   (WCAG 2.5.3). A cancelled share sheet goes straight back to idle: the
   reader changed their mind, nothing failed. */
const SAVE_LABEL: Record<Saving, string> = {
  idle: 'احفظ صورة',
  busy: 'جارٍ التحضير…',
  saved: 'حُفظت الصورة',
  failed: 'تعذّر حفظ الصورة، أعد المحاولة',
};

/** What a screen reader hears when saving ends, since a button's words
    changing under focus is not announced everywhere. */
const SAVE_SAID: Partial<Record<Saving, string>> = {
  saved: 'حُفظت الصورة',
  failed: 'تعذّر حفظ الصورة',
};

/** How long «حُفظت الصورة» stays before the button offers to save again. */
const SAVED_FOR = 4000;

/** The diamond of the Mushaf's surah headers between two hairlines. */
function Ornament() {
  return (
    <div className="close-ornament" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 3 21 12 12 21 3 12Z" />
        <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" />
      </svg>
    </div>
  );
}

/**
 * «ختام المجلس»: what the sitting read, from where to where, how long and
 * who sat, ending on the supplication that closes a gathering. «احفظ صورة»
 * draws the same card as a picture and hands it to the share sheet or the
 * downloads; «تابعوا القراءة» goes back to the sitting with nothing lost
 * (so do Escape, «إغلاق» and a tap outside); «إنهاء» ends it. Once closed,
 * the card is gone: the app keeps no record of past sittings (D2).
 *
 * Open while `closing` is set. The card keeps the last one through the
 * sheet's exit, which plays after the parent has let it go.
 */
export function CloseCard({
  closing,
  onContinue,
  onEnd,
}: {
  closing: Closing | null;
  onContinue: () => void;
  onEnd: () => void;
}) {
  const [shown, setShown] = useState(closing);
  const [saving, setSaving] = useState<Saving>('idle');
  if (closing && closing !== shown) {
    setShown(closing);
    setSaving('idle');
  }
  const noteId = useId();

  /* The picture is drawn once the sheet has settled, before it is asked
     for, so «احفظ صورة» hands it over at once: a phone opens its share
     sheet only close to the tap that asked. It is kept for this card in
     this theme, and drawn again if either changes. */
  const picture = useRef<{
    of: Closing;
    theme: string | undefined;
    blob: Promise<Blob>;
  } | null>(null);
  const pictureOf = (c: Closing) => {
    const theme = document.documentElement.dataset.theme;
    const kept = picture.current;
    if (kept && kept.of === c && kept.theme === theme) return kept.blob;
    const blob = cardImage(cardText(c.summary, c.endedAt));
    picture.current = { of: c, theme, blob };
    // A picture that failed is not kept: the next press tries afresh.
    blob.catch(() => {
      if (picture.current?.blob === blob) picture.current = null;
    });
    return blob;
  };
  const prepare = useEffectEvent((c: Closing) => {
    pictureOf(c).catch(() => {});
  });
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => prepare(closing), 400);
    return () => window.clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (saving !== 'saved') return;
    const timer = window.setTimeout(() => setSaving('idle'), SAVED_FOR);
    return () => window.clearTimeout(timer);
  }, [saving]);

  if (!shown) return null;
  const text = cardText(shown.summary, shown.endedAt);

  const save = async () => {
    if (saving === 'busy') return;
    setSaving('busy');
    try {
      const blob = await pictureOf(shown);
      const saved = await saveImage(blob, imageName(shown.endedAt));
      setSaving(saved === 'cancelled' ? 'idle' : 'saved');
    } catch {
      setSaving('failed');
    }
  };

  const [day, ...otherDays] = text.dates;
  return (
    <Sheet
      open={closing !== null}
      onOpenChange={(open) => {
        if (!open) onContinue();
      }}
      title={text.title}
      variant="dialog"
    >
      <div className="close-card">
        <div className="close-face">
          <div className="close-dates">
            <p className="close-day">{day}</p>
            {otherDays.map((d) => (
              <p key={d} className="close-day-other">
                {d}
              </p>
            ))}
          </div>
          <Ornament />
          <div className="close-read">
            {text.read.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {text.amount ? <p className="close-amount">{text.amount}</p> : null}
          {text.present ? (
            <p className="close-present">
              <span className="close-present-label">{text.present.label}:</span>{' '}
              {text.present.names}
            </p>
          ) : null}
          <Ornament />
          <p className="close-supplication">
            {text.supplication.map((clause, i) => (
              <span key={clause}>
                {i ? <br /> : null}
                {clause}
              </span>
            ))}
          </p>
          <p className="close-brand">
            <LogoMark size={28} />
            <span>{text.brand}</span>
          </p>
        </div>

        <div className="close-actions">
          <button
            type="button"
            className="button button-primary button-large button-block"
            aria-busy={saving === 'busy' || undefined}
            onClick={() => void save()}
          >
            {saving === 'saved' ? <Check size={20} aria-hidden="true" /> : null}
            {SAVE_LABEL[saving]}
          </button>
          <div className="close-actions-row">
            <button type="button" className="button" onClick={onContinue}>
              تابعوا القراءة
            </button>
            <button
              type="button"
              className="button"
              aria-describedby={noteId}
              onClick={onEnd}
            >
              إنهاء
            </button>
          </div>
          <p id={noteId} className="close-note">
            لا يحتفظ التطبيق بهذا الملخّص بعد الإنهاء.
          </p>
        </div>
        <output className="visually-hidden" aria-live="polite">
          {SAVE_SAID[saving] ?? ''}
        </output>
      </div>
    </Sheet>
  );
}
