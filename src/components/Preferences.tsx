import { chime, wakeChime } from '@/halaqa/chime';
import type { Photos, Prefs, Speed, Theme } from '@/halaqa/state';
import { THEMES } from '@/styles/themes';
import { Choice } from './Choice';
import { Switch } from './Switch';

const THEME_CHOICES: { value: Theme; label: string }[] = [
  { value: 'green', label: 'أخضر' },
  { value: 'burgundy', label: 'عنّابي' },
  { value: 'blue', label: 'أزرق' },
  { value: 'sand', label: 'رملي' },
];

/**
 * How the app looks: its colour, and how the sheikhs' photographs appear.
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
      {/* Four colours, two to a row where four do not fit. */}
      <div className="theme-choice">
        <Choice<Theme>
          legend="اللون"
          value={prefs.theme}
          onChange={(theme) => onChange({ theme })}
          options={THEME_CHOICES.map((t) => ({
            value: t.value,
            label: (
              <>
                <span
                  className="swatch"
                  style={{ background: THEMES[t.value].swatch }}
                  aria-hidden="true"
                />
                {t.label}
              </>
            ),
          }))}
        />
      </div>
      <div className="field">
        <Choice<Photos>
          legend="صور المشايخ"
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
          من اسم الشيخ.
        </p>
      </div>
    </>
  );
}

/**
 * How recitations sound: their speed, how many times «استمع» recites the
 * page, and the tone for a turn that passes on its own, which is on or
 * off and so a switch. Turning the tone on plays it, so it is heard as it
 * is kept.
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
      <Switch
        label="تتبّع الكلمة"
        hint="حين يتلو الشيخ تُعلَّم الكلمة التي يقرؤها لا الآية كلها، حيث يُعرف توقيت كلماتها."
        checked={prefs.follow === 'word'}
        onChange={(on) => onChange({ follow: on ? 'word' : 'ayah' })}
      />
      <Switch
        label="نغمة عند انتقال الدور"
        hint="حين ينتقل الدور وحده: بانتهاء التوقيت، أو بانتهاء تلاوة الشيخ."
        checked={prefs.cue === 'chime'}
        onChange={(on) => {
          onChange({ cue: on ? 'chime' : 'none' });
          if (on) {
            wakeChime();
            chime();
          }
        }}
      />
    </>
  );
}
