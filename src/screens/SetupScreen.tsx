import { ArrowLeft, Settings } from '@/components/icons';
import { useState } from 'react';
import { arabic } from '@/data/arabic';
import { surahOfPage } from '@/data/mushaf';
import { readerOf } from '@/halaqa/schedule';
import {
  currentPage,
  isComplete,
  memberName,
  planOf,
  type Config,
  type Prefs,
  type Session,
} from '@/halaqa/state';
import { AppearanceFields, SoundFields } from '@/components/Preferences';
import { HalaqaForm, type ReciterRequest } from '@/components/HalaqaForm';
import { LogoMark } from '@/components/Logo';
import { ReciterPicker } from '@/components/ReciterPicker';
import { Sheet } from '@/components/Sheet';
import { StartPicker } from '@/components/StartPicker';

/**
 * The first screen, every time the app opens: the name, one line saying what
 * it is for, and the few choices a halaqa needs. Everything has a default, so
 * «ابدأ الحلقة» works on arrival.
 *
 * A halaqa left open (the page refreshed, the phone locked) is offered first,
 * as one card, because carrying on is what someone returning almost always
 * wants. Starting over is the quieter link under it.
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
  const [picking, setPicking] = useState<ReciterRequest | null>(null);
  const [looking, setLooking] = useState(false);
  const change = (next: Config) => {
    setConfig(next);
    onConfig(next);
  };

  return (
    <main className="setup" id="main">
      {/* How the app looks and sounds, before a halaqa starts: its
          colour, whether the reciters' faces are shown, blurred or hidden
          (which some would settle before the first photo appears), and the
          speed of recitations. */}
      <button
        type="button"
        className="icon-button setup-settings"
        aria-label="الإعدادات"
        onClick={() => setLooking(true)}
      >
        <Settings size={20} aria-hidden="true" />
      </button>
      <header className="setup-intro">
        <LogoMark size={64} />
        <h1 className="setup-title">
          <span className="setup-title-ar">مجلس نور</span>
        </h1>
        <p className="setup-tagline">حلقة قرآن، أينما كنتم.</p>
      </header>

      {saved && !showForm ? (
        <section className="resume" aria-labelledby="resume-title">
          <h2 id="resume-title" className="resume-title">
            تابع حلقتك
          </h2>
          <ResumeSummary session={saved} />
          <button
            type="button"
            className="button button-primary button-block"
            onClick={onResume}
          >
            متابعة
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setShowForm(true)}
          >
            ابدأ حلقة جديدة
          </button>
        </section>
      ) : (
        <form
          className="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            onStart(config);
          }}
        >
          <StartPicker
            page={config.startPage}
            onChange={(startPage) => change({ ...config, startPage })}
          />
          <HalaqaForm
            config={config}
            onChange={change}
            onPickReciter={setPicking}
          />
          <button
            type="submit"
            className="button button-primary button-block button-large"
          >
            ابدأ الحلقة
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          {saved ? (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setShowForm(false)}
            >
              العودة إلى الحلقة السابقة
            </button>
          ) : null}
        </form>
      )}

      <Sheet
        open={looking}
        onOpenChange={setLooking}
        title="الإعدادات"
        description="مظهر التطبيق وصوته. تُطبَّق فور اختيارها."
      >
        <section className="settings-section" aria-labelledby="setup-look">
          <h3 id="setup-look" className="settings-heading">
            المظهر
          </h3>
          <AppearanceFields prefs={prefs} onChange={onPrefs} />
        </section>
        <section className="settings-section" aria-labelledby="setup-sound">
          <h3 id="setup-sound" className="settings-heading">
            الصوت
          </h3>
          <SoundFields prefs={prefs} onChange={onPrefs} />
        </section>
      </Sheet>

      <Sheet
        open={picking !== null}
        onOpenChange={(open) => {
          if (!open) setPicking(null);
        }}
        title={picking?.title ?? ''}
        description={picking?.description}
      >
        {picking ? (
          <ReciterPicker
            value={picking.value}
            onChange={(reciter) => {
              picking.apply(reciter);
              setPicking(null);
            }}
          />
        ) : null}
      </Sheet>
    </main>
  );
}

function ResumeSummary({ session }: { session: Session }) {
  const page = currentPage(session);
  const { config } = session;
  const member = config.members[readerOf(planOf(config), session.turn)];
  return (
    <p className="resume-summary">
      <span className="resume-page">
        الصفحة {arabic(page)} · سورة {surahOfPage(page).name}
      </span>
      <span className="resume-reader">
        {isComplete(session)
          ? 'خُتم المصحف'
          : config.members.length > 1
            ? `الدور على: ${memberName(member)}`
            : member.kind === 'reciter'
              ? `استماع إلى ${memberName(member)}`
              : 'قراءة فردية'}
      </span>
    </p>
  );
}
