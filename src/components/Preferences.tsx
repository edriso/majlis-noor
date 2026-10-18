import { chime, wakeChime } from '@/halaqa/chime';
import type { Cue, Photos, Prefs, Speed, Theme } from '@/halaqa/state';
import { THEMES as COLOURS } from '@/styles/themes';
import { Choice } from './Choice';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'green', label: 'أخضر' },
  { value: 'burgundy', label: 'عنّابي' },
  { value: 'blue', label: 'أزرق' },
  { value: 'sand', label: 'رملي' },
];

/**
 * How the app looks: its colour, and how the reciters' photographs appear.
 * The same fields in the settings of a halaqa and behind the gear on the
 * start screen, where the photographs are first seen.
 */
export function AppearanceFields({
  prefs,
  onChange,
}: {
  prefs: Prefs;
  onChange: (prefs: Partial<Prefs>) => void;
}) {
  return (
    <>
      <Choice<Theme>
        legend="اللون"
        value={prefs.theme}
        onChange={(theme) => onChange({ theme })}
        options={THEMES.map((t) => ({
          value: t.value,
          label: (
            <>
              <span
                className="swatch"
                style={{ background: COLOURS[t.value].swatch }}
                aria-hidden="true"
              />
              {t.label}
            </>
          ),
        }))}
      />
      <div className="field">
        <Choice<Photos>
          legend="صور القرّاء"
          value={prefs.photos}
          onChange={(photos) => onChange({ photos })}
          options={[
            { value: 'show', label: 'ظاهرة' },
            { value: 'blur', label: 'مموّهة' },
            { value: 'hide', label: 'مخفية' },
          ]}
        />
        <p className="field-note">
          إن مُوِّهت لم تُعرف الوجوه، وإن أُخفيت لم تُحمَّل أصلًا، ويظهر مكانها الحرف الأول
          من اسم القارئ.
        </p>
      </div>
    </>
  );
}

/**
 * How recitations sound: their speed, how many times «استمع» recites the
 * page, and the tone for a turn that passes on its own. Choosing the tone
 * plays it, so it is heard before it is kept.
 */
export function SoundFields({
  prefs,
  onChange,
}: {
  prefs: Prefs;
  onChange: (prefs: Partial<Prefs>) => void;
}) {
  return (
    <>
      <div className="field">
        <Choice<Speed>
          legend="سرعة التلاوة"
          value={prefs.speed}
          onChange={(speed) => onChange({ speed })}
          options={[
            { value: 0.75, label: 'متأنّية' },
            { value: 1, label: 'عادية' },
            { value: 1.25, label: 'أسرع' },
          ]}
        />
        <p className="field-note">
          للاستماع ولتلاوة الشيخ في دوره، والصوت بنبرته لا يتغيّر.
        </p>
      </div>
      <Choice<1 | 2 | 3>
        legend="تكرار الاستماع"
        value={prefs.listenRepeat}
        onChange={(listenRepeat) => onChange({ listenRepeat })}
        options={[
          { value: 1, label: 'مرة' },
          { value: 2, label: 'مرتين' },
          { value: 3, label: 'ثلاثًا' },
        ]}
      />
      <div className="field">
        <Choice<Cue>
          legend="تنبيه انتقال الدور"
          value={prefs.cue}
          onChange={(cue) => {
            onChange({ cue });
            if (cue === 'chime') {
              wakeChime();
              chime();
            }
          }}
          options={[
            { value: 'chime', label: 'نغمة خفيفة' },
            { value: 'none', label: 'بلا تنبيه' },
          ]}
        />
        <p className="field-note">
          حين ينتقل الدور وحده: بانتهاء التوقيت، أو بانتهاء تلاوة الشيخ.
        </p>
      </div>
    </>
  );
}
