import { useState, type Dispatch } from 'react';
import {
  currentPage,
  type Action,
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
  const configure = (config: Session['config']) =>
    dispatch({ type: 'configure', config });
  const repo = repositoryUrl();

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
      <section className="settings-section" aria-labelledby="settings-halaqa">
        <h3 id="settings-halaqa" className="settings-heading">
          الحلقة
        </h3>
        <HalaqaForm
          config={session.config}
          onChange={configure}
          onPickReciter={setPicking}
        />
      </section>

      <section className="settings-section" aria-labelledby="settings-jump">
        <h3 id="settings-jump" className="settings-heading">
          الموضع
        </h3>
        <StartPicker
          legend="الانتقال حسب"
          page={currentPage(session)}
          onChange={(page) => dispatch({ type: 'goToPage', page })}
        />
      </section>

      <section className="settings-section" aria-labelledby="settings-look">
        <h3 id="settings-look" className="settings-heading">
          المظهر
        </h3>
        <AppearanceFields
          prefs={prefs}
          onChange={(p) => dispatch({ type: 'prefs', prefs: p })}
        />
      </section>

      <section className="settings-section" aria-labelledby="settings-sound">
        <h3 id="settings-sound" className="settings-heading">
          الصوت
        </h3>
        <SoundFields
          prefs={prefs}
          onChange={(p) => dispatch({ type: 'prefs', prefs: p })}
        />
      </section>

      <section className="settings-section" aria-labelledby="settings-keys">
        <h3 id="settings-keys" className="settings-heading">
          لوحة المفاتيح
        </h3>
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
      </section>

      <section
        className="settings-section settings-about"
        aria-labelledby="settings-about"
      >
        <h3 id="settings-about" className="settings-heading">
          عن مجلس نور
        </h3>
        <p>
          صفحات مصحف المدينة النبوية برواية حفص، طبعة مجمع الملك فهد لطباعة
          المصحف الشريف، بخطوطه وبيانات صفحاته عن{' '}
          <a href="https://quran.com" target="_blank" rel="noreferrer">
            Quran.com
          </a>
          . التلاوات عن{' '}
          <a href="https://quranicaudio.com" target="_blank" rel="noreferrer">
            QuranicAudio
          </a>
          . صور القرّاء من ويكيميديا كومنز، ومصدر كل صورة وترخيصها في{' '}
          {repo ? (
            <a
              href={`${repo}/blob/HEAD/NOTICE`}
              target="_blank"
              rel="noreferrer"
            >
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
      </section>

      <button
        type="button"
        className="button button-danger button-block"
        onClick={() => {
          close(false);
          dispatch({ type: 'end' });
        }}
      >
        إنهاء الحلقة
      </button>
    </Sheet>
  );
}

/** The repository's address, as the workflow that built the site passed
    it. A local build has none, and an address that is not https is not
    trusted, so the links that need it are left out rather than wrong. */
function repositoryUrl() {
  const url = import.meta.env.VITE_REPO_URL?.trim().replace(/\/+$/, '');
  return url?.startsWith('https://') ? url : null;
}
