import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { reciterById } from '@/data/reciters';
import {
  placeOf,
  type Action,
  type Config,
  type PageSize,
  type Prefs,
  type Session,
} from '@/halaqa/state';
import { Choice } from './Choice';
import { HalaqaForm, type ReciterRequest } from './HalaqaForm';
import { Maximize } from './icons';
import { AppearanceFields, SoundFields } from './Preferences';
import { ReciterPicker } from './ReciterPicker';
import { Sheet } from './Sheet';
import { SummaryRow } from './SummaryRow';

/** Where the menu is open: its own list, the circle's form, or the list
    of sheikhs opened from either. */
export type MenuPlace = 'menu' | 'halaqa';

/**
 * The reading screen's menu: the sitting (changing the circle, ending it),
 * how the screen looks, how it sounds, and about the app. Everything is
 * applied as it is chosen: there is no «حفظ», because a halaqa in progress
 * should not be one forgotten button away from ignoring what was just set.
 * Changing the shape of the circle carries on from the page being read,
 * with the same reader. The place is not here: it is the jump's, behind
 * the chip at the top.
 *
 * The circle's form and the list of sheikhs open in place of the menu,
 * with a way back, rather than as a sheet over a sheet. Opened from the
 * circle's «عدّل الحلقة», the menu opens straight on the form (`start`),
 * and its way back is to close.
 */
export function SettingsPanel({
  open,
  onOpenChange,
  start = 'menu',
  session,
  prefs,
  dispatch,
  onQuiet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where it opens. */
  start?: MenuPlace;
  session: Session;
  prefs: Prefs;
  dispatch: Dispatch<Action>;
  /** Hides the bars round the page. */
  onQuiet: () => void;
}) {
  // What was asked for, and the menu's own place under it. Both start
  // over each time the menu opens.
  const [place, setPlace] = useState<MenuPlace>(start);
  const [picking, setPicking] = useState<ReciterRequest | null>(null);
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setPlace(start);
      setPicking(null);
    }
  }
  const setPrefs = (p: Partial<Prefs>) => dispatch({ type: 'prefs', prefs: p });
  const configure = (config: Config) => dispatch({ type: 'configure', config });

  if (picking)
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
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

  if (place === 'halaqa')
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="عدّل الحلقة"
        description="من في الحلقة وكيف تقرأ. يُطبَّق كل تغيير فور اختياره، ويكمل صاحب الدور من موضعه."
        onBack={start === 'menu' ? () => setPlace('menu') : undefined}
      >
        <HalaqaSection
          config={session.config}
          from={placeOf(session)}
          onChange={configure}
          onPickReciter={setPicking}
        />
      </Sheet>
    );

  const listener = reciterById(session.config.reciter);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="القائمة"
      description="المجلس، والمظهر، والصوت. يُطبَّق كل اختيار فور اختياره."
    >
      <Section title="المجلس">
        <SummaryRow
          title="عدّل الحلقة"
          detail="من فيها، وترتيبهم، وكيف تقرأ"
          onClick={() => setPlace('halaqa')}
        />
        <EndSitting
          onEnd={() => {
            onOpenChange(false);
            dispatch({ type: 'end' });
          }}
        />
      </Section>
      <AppearanceSection
        prefs={prefs}
        onChange={setPrefs}
        onQuiet={() => {
          onOpenChange(false);
          onQuiet();
        }}
      />
      <SoundSection prefs={prefs} onChange={setPrefs}>
        <SummaryRow
          title="شيخ الاستماع"
          detail={listener.name}
          spokenSuffix="، غيّره"
          onClick={() =>
            setPicking({
              title: 'شيخ الاستماع',
              description:
                session.config.turnChange === 'reciter'
                  ? 'شيخ يُستمع إليه في الصفحة، وتُقاس بتلاوته مدة الدور.'
                  : 'شيخ يُستمع إليه في الصفحة.',
              value: session.config.reciter,
              apply: (reciter) => configure({ ...session.config, reciter }),
            })
          }
        />
      </SoundSection>
      <AboutSection />
      <KeysSection />
    </Sheet>
  );
}

/** A titled part of the menu. */
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
      className={`menu-section ${className}`.trim()}
      aria-labelledby={id}
    >
      <h3 id={id} className="menu-heading">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** «عدّل الحلقة»: who sits, in what order, and how turns pass. A goal set
    here is counted from where the circle is now. */
export function HalaqaSection({
  config,
  from,
  onChange,
  onPickReciter,
}: {
  config: Config;
  from: number;
  onChange: (config: Config) => void;
  onPickReciter: (request: ReciterRequest) => void;
}) {
  return (
    <HalaqaForm
      config={config}
      onChange={onChange}
      onPickReciter={onPickReciter}
      from={from}
    />
  );
}

/** How the screen looks: its colour, the sheikhs' photographs, the size
    of the page, and the bars hidden for a page alone. */
export function AppearanceSection({
  prefs,
  onChange,
  onQuiet,
}: {
  prefs: Prefs;
  onChange: (prefs: Partial<Prefs>) => void;
  onQuiet: () => void;
}) {
  return (
    <Section title="المظهر">
      <AppearanceFields prefs={prefs} onChange={onChange} />
      <div className="field">
        <Choice<PageSize>
          legend="حجم الصفحة"
          value={prefs.pageSize}
          onChange={(pageSize) => onChange({ pageSize })}
          options={[
            { value: 'fit', label: 'الصفحة كاملة' },
            { value: 'width', label: 'بعرض الشاشة' },
          ]}
        />
        <p className="field-note">
          بعرض الشاشة تكبر الصفحة، وتُقرأ بالتمرير إلى أسفل.
        </p>
      </div>
      <div className="field">
        <button
          type="button"
          className="button menu-action button-block"
          onClick={onQuiet}
        >
          <Maximize size={20} aria-hidden="true" />
          إخفاء الأزرار
        </button>
        <p className="field-note">
          تبقى الصفحة وحدها. تعود الأزرار بالزر الصغير في طرف الشاشة، أو بمفتاح
          Esc.
        </p>
      </div>
    </Section>
  );
}

/** How recitations sound, and the sheikh heard through «استمع». */
export function SoundSection({
  prefs,
  onChange,
  children,
}: {
  prefs: Prefs;
  onChange: (prefs: Partial<Prefs>) => void;
  children?: ReactNode;
}) {
  return (
    <Section title="الصوت">
      <SoundFields prefs={prefs} onChange={onChange} />
      {children}
    </Section>
  );
}

/** The reading screen's keys, as `useReadingKeys` takes them. Shown only
    where there is a keyboard to press them, guessed from a fine pointer
    that can hover (menu.css); hidden there from screen readers too, since
    it is hidden with `display`. */
export function KeysSection() {
  return (
    <Section title="لوحة المفاتيح" className="menu-keys">
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
        <div>
          <dt>
            <kbd>Esc</kbd>
          </dt>
          <dd>إظهار الأزرار بعد إخفائها</dd>
        </div>
      </dl>
    </Section>
  );
}

export function AboutSection() {
  const repo = repositoryUrl();
  return (
    <Section title="عن مجلس نور" className="menu-about">
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
        . صور المشايخ من ويكيميديا كومنز، ومصدر كل صورة وترخيصها في{' '}
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
    <div className="menu-confirm">
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
