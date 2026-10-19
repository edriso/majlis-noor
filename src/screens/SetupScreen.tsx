import { ArrowLeft, Settings } from '@/components/icons';
import { useEffect, useRef, useState } from 'react';
import { pageOfAyah } from '@/data/mushaf';
import {
  circleSummary,
  placeSummary,
  resumeLines,
} from '@/halaqa/circleLabels';
import {
  sanitizeConfig,
  type Config,
  type Prefs,
  type Session,
} from '@/halaqa/state';
import { CircleOptions } from '@/components/CircleOptions';
import { Members, type ReciterRequest } from '@/components/HalaqaForm';
import { LogoMark } from '@/components/Logo';
import { PlacePicker } from '@/components/PlacePicker';
import { AppearanceFields, SoundFields } from '@/components/Preferences';
import { ReciterPicker } from '@/components/ReciterPicker';
import { Section } from '@/components/SettingsPanel';
import { Sheet } from '@/components/Sheet';
import { SummaryRow } from '@/components/SummaryRow';
import { UpdateNotice } from '@/components/UpdateNotice';

/** What the one sheet of the start screen holds. The reciter list opened
    from the circle's sheet takes its place, with a way back to it. */
type Panel =
  | { kind: 'gear' }
  | { kind: 'place' }
  | { kind: 'circle' }
  | { kind: 'reciter'; request: ReciterRequest; fromCircle: boolean };

/**
 * The first screen, every time the app opens: the name, and the three
 * questions a halaqa needs answered, each with a default, so «ابدأ المجلس»
 * works on arrival. Where to start and how the circle reads are one row
 * each, showing what is chosen and opening where it is changed; who sits is
 * on the screen itself, since that is what changes from one sitting to the
 * next. «ابدأ المجلس» stays at the foot of the screen however long the
 * circle grows. On a phone, a first visit fits without scrolling.
 *
 * A halaqa left open (the page refreshed, the phone locked) is offered first,
 * as one card, because carrying on is what someone returning almost always
 * wants. Starting over is the quieter button under it.
 *
 * Every choice is saved as it is made (`onConfig`), through the model's
 * sanitiser, so what is shown is what will be kept.
 */
export function SetupScreen({
  initial,
  saved,
  prefs,
  onPrefs,
  onConfig,
  onStart,
  onResume,
}: {
  initial: Config;
  saved: Session | null;
  prefs: Prefs;
  onPrefs: (prefs: Partial<Prefs>) => void;
  onConfig: (config: Config) => void;
  onStart: (config: Config) => void;
  onResume: () => void;
}) {
  const [config, setConfig] = useState<Config>(initial);
  const [showForm, setShowForm] = useState(!saved);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [open, setOpen] = useState(false);
  // Where the focus goes once a panel has changed in place.
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    if (!focusNext.current) return;
    document.querySelector<HTMLElement>(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const change = (next: Config) => {
    const clean = sanitizeConfig(next);
    setConfig(clean);
    onConfig(clean);
  };
  // The panel stays as it was while the sheet slides out, so it does not
  // empty on its way.
  const show = (p: Panel) => {
    setPanel(p);
    setOpen(true);
  };
  const pickReciter = (fromCircle: boolean) => (request: ReciterRequest) =>
    show({ kind: 'reciter', request, fromCircle });
  // The sheet gives the focus back to the row that opened the list.
  const backToCircle = () => setPanel({ kind: 'circle' });

  const place = placeSummary(config.start, config.unit);
  const circle = circleSummary(config);

  return (
    <main className="setup" id="main">
      <header className="setup-header">
        <LogoMark size={32} />
        <h1 className="setup-title">مجلس نور</h1>
        {/* How the app looks and sounds, before a halaqa starts: its
            colour, whether the sheikhs' faces are shown, blurred or hidden
            (which some would settle before the first photo appears), and
            the speed of recitations. */}
        <button
          type="button"
          className="icon-button"
          aria-label="الإعدادات"
          aria-haspopup="dialog"
          onClick={() => show({ kind: 'gear' })}
        >
          <Settings size={20} aria-hidden="true" />
        </button>
      </header>

      {/* A new version is offered here and never while reading, since
          switching to it reloads the page. */}
      <UpdateNotice />

      {saved && !showForm ? (
        <Resume
          session={saved}
          onResume={onResume}
          onNew={() => {
            setShowForm(true);
            // The card and the button pressed are gone; the focus starts
            // the form, at its first question.
            focusNext.current = '.setup-body .summary-row';
          }}
        />
      ) : (
        <form
          className="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            onStart(config);
          }}
        >
          <div className="setup-body">
            <section className="setup-section" aria-labelledby="setup-place">
              <h2 id="setup-place" className="section-heading">
                من أين نبدأ؟
              </h2>
              <SummaryRow
                title={place.title}
                detail={place.detail}
                spokenSuffix="، غيّر موضع البدء"
                opensDialog
                onClick={() => show({ kind: 'place' })}
              />
            </section>

            <Members
              members={config.members}
              onChange={(members) => change({ ...config, members })}
              onPickReciter={pickReciter(false)}
            />

            <section className="setup-section" aria-labelledby="setup-circle">
              <h2 id="setup-circle" className="section-heading">
                طريقة الحلقة
              </h2>
              <SummaryRow
                title={circle.title}
                detail={circle.detail || undefined}
                spokenSuffix="، غيّر طريقة الحلقة"
                opensDialog
                onClick={() => show({ kind: 'circle' })}
              />
            </section>

            {saved ? (
              <button
                type="button"
                className="button button-quiet setup-back"
                onClick={() => {
                  setShowForm(false);
                  focusNext.current = '.resume .button-primary';
                }}
              >
                العودة إلى المجلس المفتوح
              </button>
            ) : null}
          </div>

          <div className="setup-start">
            <button
              type="submit"
              className="button button-primary button-block button-large"
            >
              ابدأ المجلس
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {/* One sheet for all of them, outside the form: a form inside a
          sheet (the page field of the place picker) would otherwise submit
          this one too, since React passes events up through a portal. */}
      {panel ? (
        <Sheet
          open={open}
          onOpenChange={setOpen}
          variant="dialog"
          {...sheetOf(panel)}
          onBack={
            panel.kind === 'reciter' && panel.fromCircle
              ? backToCircle
              : undefined
          }
        >
          {panel.kind === 'gear' ? (
            <>
              <Section title="المظهر">
                <AppearanceFields prefs={prefs} onChange={onPrefs} />
              </Section>
              <Section title="الصوت">
                <SoundFields prefs={prefs} onChange={onPrefs} />
              </Section>
            </>
          ) : panel.kind === 'place' ? (
            <PlacePicker
              current={{ ayah: config.start, page: pageOfAyah(config.start) }}
              onChoose={(p) => {
                change({ ...config, start: p.ayah });
                setOpen(false);
              }}
            />
          ) : panel.kind === 'circle' ? (
            <CircleOptions
              config={config}
              onChange={change}
              onPickReciter={pickReciter(true)}
            />
          ) : (
            <ReciterPicker
              value={panel.request.value}
              onChange={(reciter) => {
                panel.request.apply(reciter);
                if (panel.fromCircle) backToCircle();
                else setOpen(false);
              }}
            />
          )}
        </Sheet>
      ) : null}
    </main>
  );
}

/** Each panel's title, and the sentence a screen reader hears with it. */
function sheetOf(panel: Panel): { title: string; description: string } {
  switch (panel.kind) {
    case 'gear':
      return {
        title: 'الإعدادات',
        description: 'مظهر التطبيق وصوته. تُطبَّق فور اختيارها.',
      };
    case 'place':
      return {
        title: 'من أين نبدأ؟',
        description: 'سورة أو جزء أو صفحة يبدأ منها المجلس.',
      };
    case 'circle':
      return {
        title: 'طريقة الحلقة',
        description: 'كيف تدور القراءة في الحلقة. تُحفظ فور اختيارها.',
      };
    case 'reciter':
      return {
        title: panel.request.title,
        description: panel.request.description,
      };
  }
}

/** The sitting left open: where it is and whose turn, «متابعة», and the
    quieter way to a new one. */
function Resume({
  session,
  onResume,
  onNew,
}: {
  session: Session;
  onResume: () => void;
  onNew: () => void;
}) {
  const { place, turn } = resumeLines(session);
  return (
    <section className="resume" aria-labelledby="resume-title">
      <h2 id="resume-title" className="resume-title">
        تابع مجلسك
      </h2>
      <p className="resume-summary">
        <span className="resume-page">{place}</span>
        <span className="resume-reader">{turn}</span>
      </p>
      <button
        type="button"
        className="button button-primary button-block button-large"
        onClick={onResume}
      >
        متابعة
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <button type="button" className="button button-quiet" onClick={onNew}>
        ابدأ مجلسًا جديدًا
      </button>
    </section>
  );
}
