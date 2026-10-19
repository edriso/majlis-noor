import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { CardDesign, Summary } from '@/halaqa/state';
import { cardImage } from '@/sitting/cardImage';
import { cardText } from '@/sitting/cardText';
import { imageName, saveImage } from '@/sitting/saveImage';
import { Choice, type Option } from './Choice';
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

/** Each picture's shape and look in small, beside its name: the framed
    4:5, the tall 9:16 under its arch, the plain square set from the
    right. Drawn in the theme's own colours by close.css. */
function Thumb({ design }: { design: CardDesign }) {
  return (
    <svg
      className="close-thumb"
      viewBox="0 0 24 28"
      aria-hidden="true"
      focusable="false"
    >
      {design === 'ornate' ? (
        <>
          <rect
            className="close-thumb-frame"
            x="2"
            y="1.5"
            width="20"
            height="25"
            rx="2.5"
          />
          <rect
            className="close-thumb-frame"
            x="4"
            y="3.5"
            width="16"
            height="21"
            rx="1.5"
          />
          <path
            className="close-thumb-gold"
            d="M12 1 13.4 2.5 12 4 10.6 2.5Z"
          />
          <path
            className="close-thumb-line"
            d="M8 10h8M7 13.5h10M8.5 17h7M9.5 20.5h5"
          />
        </>
      ) : design === 'status' ? (
        <>
          <path
            className="close-thumb-frame"
            d="M5 27V11.5C5 7 8 3.5 12 1.5c4 2 7 5.5 7 10V27"
          />
          <path
            className="close-thumb-line"
            d="M9 12h6M8 15.5h8M9 19h6M10 22.5h4"
          />
        </>
      ) : (
        <>
          <rect
            className="close-thumb-frame"
            x="1.5"
            y="3.5"
            width="21"
            height="21"
            rx="2"
          />
          <path className="close-thumb-gold" d="M19 8h-5" />
          <path className="close-thumb-line" d="M19 12H7M19 15.5H9M19 19h-8" />
        </>
      )}
    </svg>
  );
}

/* The three pictures, each named by a word that is also how it is heard,
   and then what it is for. */
const DESIGNS: Option<CardDesign>[] = [
  {
    value: 'ornate',
    label: (
      <>
        <Thumb design="ornate" />
        مزخرفة
      </>
    ),
    spokenSuffix: '، بإطار، للمحادثات',
  },
  {
    value: 'status',
    label: (
      <>
        <Thumb design="status" />
        حالة
      </>
    ),
    spokenSuffix: '، طولية، للحالة والقصص',
  },
  {
    value: 'simple',
    label: (
      <>
        <Thumb design="simple" />
        بسيطة
      </>
    ),
    spokenSuffix: '، مربّعة، بلا زخرفة',
  },
];

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
 * «ختام المجلس»: what the sitting read, from where to where, when, how
 * long and who sat, ending on the supplication that closes a gathering.
 * «احفظ صورة» draws the same card as a picture, in the design chosen over
 * it (`design`, the device's own setting, changed through `onDesign` and
 * kept for the next sitting), and hands it to the share sheet or the
 * downloads; «تابعوا القراءة» («تابع» to one alone) goes back to the
 * sitting with nothing lost (so do Escape, «إغلاق» and a tap outside);
 * «إنهاء» ends it. Once closed, the card is gone: the app keeps no record
 * of past sittings (D2).
 *
 * Open while `closing` is set. The card keeps the last one through the
 * sheet's exit, which plays after the parent has let it go.
 */
export function CloseCard({
  closing,
  design,
  onDesign,
  onContinue,
  onEnd,
}: {
  closing: Closing | null;
  design: CardDesign;
  onDesign: (design: CardDesign) => void;
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
     this design and theme, and drawn again if any of them changes. */
  const picture = useRef<{
    of: Closing;
    design: CardDesign;
    theme: string | undefined;
    blob: Promise<Blob>;
  } | null>(null);
  const pictureOf = (c: Closing, d: CardDesign) => {
    const theme = document.documentElement.dataset.theme;
    const kept = picture.current;
    if (kept && kept.of === c && kept.design === d && kept.theme === theme)
      return kept.blob;
    const blob = cardImage(cardText(c.summary, c.endedAt), d);
    picture.current = { of: c, design: d, theme, blob };
    // A picture that failed is not kept: the next press tries afresh.
    blob.catch(() => {
      if (picture.current?.blob === blob) picture.current = null;
    });
    return blob;
  };
  const prepare = useEffectEvent((c: Closing, d: CardDesign) => {
    pictureOf(c, d).catch(() => {});
  });
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => prepare(closing, design), 400);
    return () => window.clearTimeout(timer);
  }, [closing, design]);

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
      const blob = await pictureOf(shown, design);
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
        <div className="close-face" data-design={design}>
          <div className="close-dates">
            <p className="close-day">{day}</p>
            {/* The Gregorian date and the time, on one line where the
                card is wide enough (close.css). */}
            <p className="close-when">
              {otherDays.map((d) => (
                <span key={d} className="close-day-other">
                  {d}
                </span>
              ))}
              <span className="close-day-other close-time">{text.time}</span>
            </p>
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
          <div className="close-designs">
            <Choice
              legend="تصميم الصورة"
              hideLegend
              variant="tiles"
              options={DESIGNS}
              value={design}
              onChange={onDesign}
            />
          </div>
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
              {shown.summary.members.length === 1
                ? 'تابع القراءة'
                : 'تابعوا القراءة'}
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
