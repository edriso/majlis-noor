import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  currentPage,
  type Action,
  type Config,
  type Prefs,
  type Session,
} from '@/halaqa/state';
import { AppearanceFields, SoundFields } from './Preferences';
import { HalaqaForm, type ReciterRequest } from './HalaqaForm';
import { ReciterPicker } from './ReciterPicker';
import { Sheet } from './Sheet';
import { StartPicker } from './StartPicker';

/**
 * Everything about the halaqa that can change while it runs, applied as it is
 * chosen: there is no «حفظ», because a halaqa in progress should not be one
 * forgotten button away from ignoring what was just set. Changing the shape
 * of the circle carries on from the page being read, with the same reader.
 *
 * Each part is a section of its own, taking only what it needs, so a menu
 * can hold them in another order or other sheets without their logic
 * moving: the circle, the place, how it looks, how it sounds, the keys,
 * about, and ending the sitting.
 */
export function SettingsPanel({
  open,
  onOpenChange,
  session,
  prefs,
  dispatch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session;
  prefs: Prefs;
  dispatch: Dispatch<Action>;
}) {
  // The reciter list opens in place of the settings, with a way back,
  // rather than as a sheet over a sheet.
  const [picking, setPicking] = useState<ReciterRequest | null>(null);
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setPicking(null);
  };
  const setPrefs = (p: Partial<Prefs>) => dispatch({ type: 'prefs', prefs: p });

  if (picking)
    return (
      <Sheet
        open={open}
        onOpenChange={close}
        title={picking.title}
        description={picking.description}
        onBack={() => setPicking(null)}
      >
        <ReciterPicker
          value={picking.value}
          onChange={(reciter) => {
            picking.apply(reciter);
            setPicking(null);
          }}
        />
      </Sheet>
    );

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title="الإعدادات"
      description="إعدادات الحلقة والمظهر. تُطبَّق فور اختيارها."
    >
      <HalaqaSection
        config={session.config}
        onChange={(config) => dispatch({ type: 'configure', config })}
        onPickReciter={setPicking}
      />
      <PlaceSection
        page={currentPage(session)}
        onGo={(page) => dispatch({ type: 'goToPage', page })}
      />
      <AppearanceSection prefs={prefs} onChange={setPrefs} />
      <SoundSection prefs={prefs} onChange={setPrefs} />
      <KeysSection />
      <AboutSection />
      <EndSitting
        onEnd={() => {
          close(false);
          dispatch({ type: 'end' });
        }}
      />
    </Sheet>
  );
}

/** A titled part of the settings. */
function Section({
  title,
  className = '',
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      className={`settings-section ${className}`.trim()}
      aria-labelledby={id}
    >
      <h3 id={id} className="settings-heading">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** «عدّل الحلقة»: who sits, in what order, and how turns pass. */
export function HalaqaSection({
  config,
  onChange,
  onPickReciter,
}: {
  config: Config;
  onChange: (config: Config) => void;
  onPickReciter: (request: ReciterRequest) => void;
}) {
  return (
    <Section title="الحلقة">
      <HalaqaForm
        config={config}
        onChange={onChange}
        onPickReciter={onPickReciter}
      />
    </Section>
  );
}

/** Where to read from; the jump in the top bar does the same. */
export function PlaceSection({
  page,
  onGo,
}: {
  page: number;
  onGo: (page: number) => void;
}) {
  return (
    <Section title="الموضع">
      <StartPicker legend="الانتقال حسب" page={page} onChange={onGo} />
    </Section>
  );
}

export function AppearanceSection({
  prefs,
  onChange,
}: {
  prefs: Prefs;
  onChange: (prefs: Partial<Prefs>) => void;
}) {
  return (
    <Section title="المظهر">
      <AppearanceFields prefs={prefs} onChange={onChange} />
    </Section>
  );
}

export function SoundSection({
  prefs,
  onChange,
}: {
  prefs: Prefs;
  onChange: (prefs: Partial<Prefs>) => void;
}) {
  return (
    <Section title="الصوت">
      <SoundFields prefs={prefs} onChange={onChange} />
    </Section>
  );
}

/** The reading screen's keys, as `useReadingKeys` takes them. */
export function KeysSection() {
  return (
    <Section title="لوحة المفاتيح">
      <dl className="shortcuts">
        <div>
          <dt>
            <kbd>←</kbd>
          </dt>
          <dd>
            تمّ، القارئ التالي (أو الصفحة التالية في الدور)، وتخطّي تلاوة الشيخ
          </dd>
        </div>
        <div>
          <dt>
            <kbd>→</kbd>
          </dt>
          <dd>رجوع إلى الصفحة أو القارئ السابق</dd>
        </div>
        <div>
          <dt>
            <kbd>مسافة</kbd>
          </dt>
          <dd>إيقاف تلاوة الشيخ أو التوقيت أو الاستماع مؤقتًا، واستئنافها</dd>
        </div>
      </dl>
    </Section>
  );
}

export function AboutSection() {
  const repo = repositoryUrl();
  return (
    <Section title="عن مجلس نور" className="settings-about">
      <p>
        صفحات مصحف المدينة النبوية برواية حفص، طبعة مجمع الملك فهد لطباعة المصحف
        الشريف، بخطوطه وبيانات صفحاته عن{' '}
        <a href="https://quran.com" target="_blank" rel="noreferrer">
          Quran.com
        </a>
        . التلاوات عن{' '}
        <a href="https://quranicaudio.com" target="_blank" rel="noreferrer">
          QuranicAudio
        </a>
        . صور القرّاء من ويكيميديا كومنز، ومصدر كل صورة وترخيصها في{' '}
        {repo ? (
          <a href={`${repo}/blob/HEAD/NOTICE`} target="_blank" rel="noreferrer">
            ملف المصادر
          </a>
        ) : (
          'ملف المصادر'
        )}
        .
      </p>
      <p>يُحفظ كل شيء على جهازك وحده، ولا يُرسل إلى أحد.</p>
      {repo ? (
        <p>
          <a href={repo} target="_blank" rel="noreferrer">
            الشيفرة المصدرية
          </a>
        </p>
      ) : null}
    </Section>
  );
}

/**
 * «إنهاء المجلس», asked once: a slip of the finger in a sheet full of
 * buttons should not end a sitting. The focus goes to «تراجع», which a
 * screen reader hears with the question, so a second press of Enter keeps
 * the sitting rather than ending it; going back returns the focus to the
 * button that asked.
 */
export function EndSitting({ onEnd }: { onEnd: () => void }) {
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const question = useId();

  useEffect(() => {
    if (asking) cancel.current?.focus();
    else if (asked) button.current?.focus();
  }, [asking, asked]);

  if (!asking)
    return (
      <button
        ref={button}
        type="button"
        className="button button-danger button-block"
        onClick={() => {
          setAsking(true);
          setAsked(true);
        }}
      >
        إنهاء المجلس
      </button>
    );
  return (
    <div className="settings-section settings-about">
      <p id={question}>
        أتنهون المجلس؟ يُحفظ الموضع الذي بلغتموه، لتبدؤوا منه في المرة القادمة.
      </p>
      <button
        type="button"
        className="button button-danger button-block"
        onClick={onEnd}
        aria-describedby={question}
      >
        نعم، أنهوا المجلس
      </button>
      <button
        ref={cancel}
        type="button"
        className="button button-quiet button-block"
        onClick={() => setAsking(false)}
        aria-describedby={question}
      >
        تراجع
      </button>
    </div>
  );
}

/** The repository's address, as the workflow that built the site passed
    it. A local build has none, and an address that is not https is not
    trusted, so the links that need it are left out rather than wrong. */
function repositoryUrl() {
  const url = import.meta.env.VITE_REPO_URL?.trim().replace(/\/+$/, '');
  return url?.startsWith('https://') ? url : null;
}
