import { useId, useState } from 'react';
import { arabic, ayatCount, clock, digits, pagesCount } from '@/data/arabic';
import { PAGE_COUNT, pageOfAyah } from '@/data/mushaf';
import { reciterById } from '@/data/reciters';
import { goalNote, isTalqeen, rotations, talqeen } from '@/halaqa/circleLabels';
import type { Mode, Rotate, Unit } from '@/halaqa/schedule';
import {
  TURN_SIZES,
  type Allowance,
  type Config,
  type Goal,
  type TurnChange,
} from '@/halaqa/state';
import { Choice } from './Choice';
import { BookOpen, Check } from './icons';
import type { ReciterRequest } from './HalaqaForm';
import { ReciterAvatar } from './ReciterAvatar';
import { SummaryRow } from './SummaryRow';
import { Switch } from './Switch';

/**
 * How the circle reads, every part of it in one place: the teaching circle
 * in one press, continue or repeat, how much a turn holds, what moves the
 * turn on (and, when a sheikh's pace times it, which sheikh and how much
 * longer), where the sitting means to stop, who opens each page, and
 * reading from memory. The start screen shows it in a sheet behind its
 * summary row; the settings of a sitting show it under the circle.
 *
 * Each part appears only where it means something: a circle of one has no
 * mode, a circle of sheikhs alone no turn to time and nothing to read from
 * memory, and swapping who starts only what the model keeps. Everything
 * goes out through `onChange`, so whoever holds the circle saves it.
 */
export function CircleOptions({
  config,
  onChange,
  onPickReciter,
  from = config.start,
}: {
  config: Config;
  onChange: (config: Config) => void;
  onPickReciter: (request: ReciterRequest) => void;
  /** The ayah a goal is counted from: where the sitting starts, or, in a
      sitting, where the circle is. */
  from?: number;
}) {
  const set = (patch: Partial<Config>) => onChange({ ...config, ...patch });
  const many = config.members.length > 1;
  const people = config.members.some((m) => m.kind === 'person');
  const rotate = rotations(config);

  return (
    <div className="circle-options">
      <Talqeen config={config} onChange={onChange} />

      {many ? (
        <Choice<Mode>
          legend="طريقة القراءة"
          variant="cards"
          value={config.mode}
          onChange={(mode) => set({ mode })}
          options={[
            {
              value: 'continue',
              label: 'كلٌّ يُكمل',
              hint: 'يقرأ كل واحد ما بعد الذي قبله.',
            },
            {
              value: 'repeat',
              label: 'كلٌّ يكرّر',
              hint: 'يقرأ الجميع المقدار نفسه، ثم ينتقلون.',
            },
          ]}
        />
      ) : null}

      <TurnSize config={config} onChange={onChange} />

      {people ? (
        <TurnChangeField
          config={config}
          onChange={onChange}
          onPickReciter={onPickReciter}
        />
      ) : null}

      <GoalField
        goal={config.goal}
        from={from}
        alone={!many}
        onChange={(goal) => set({ goal })}
      />

      {rotate.length > 1 ? (
        <div className="field">
          <Choice<Rotate>
            legend="بدّل البادئ"
            value={config.rotate}
            onChange={(r) => set({ rotate: r })}
            options={rotate.map((r) => ({
              value: r,
              label:
                r === 'page'
                  ? 'مع كل صفحة'
                  : r === 'surah'
                    ? 'مع كل سورة'
                    : 'لا',
            }))}
          />
          <p className="field-note">
            {rotate.includes('page')
              ? 'يبدأ كلَّ صفحة قارئٌ غير الذي بدأ التي قبلها.'
              : 'يبدأ كلَّ سورة قارئٌ غير الذي بدأ التي قبلها.'}
          </p>
        </div>
      ) : null}

      {people ? (
        <Switch
          label="من الحفظ"
          hint="تُغطّى الصفحة في دور القارئ، ويكشفها إن احتاج."
          checked={config.fromMemory}
          onChange={(fromMemory) => set({ fromMemory })}
        />
      ) : null}
    </div>
  );
}

/**
 * «حلقة تلقين»: one press for the three choices that make a teaching
 * circle (see `talqeen`). The line under it says what it does, then that
 * it is done, and it is a live region, so a screen reader hears the change
 * the press made to the options below. In a full circle without the
 * teaching recording there is no seat for him, and the line says why the
 * press does nothing.
 */
function Talqeen({
  config,
  onChange,
}: {
  config: Config;
  onChange: (config: Config) => void;
}) {
  const id = useId();
  const next = talqeen(config);
  const done = isTalqeen(config);
  return (
    <div className="talqeen">
      <button
        type="button"
        className="talqeen-button"
        aria-describedby={`${id}-hint`}
        aria-disabled={!next || undefined}
        data-done={done || undefined}
        onClick={() => {
          if (next) onChange(next);
        }}
      >
        <BookOpen size={20} aria-hidden="true" />
        <span className="talqeen-label">حلقة تلقين</span>
        {done ? <Check size={18} aria-hidden="true" /> : null}
      </button>
      <p className="field-note" id={`${id}-hint`} aria-live="polite">
        {done
          ? 'حلقة تلقين الآن: يتلو الحصري (المعلّم)، ثم يقرأ الحاضرون.'
          : next
            ? 'يتلو الحصري (المعلّم) ثلاث آيات، ثم يقرؤها الحاضرون.'
            : 'اكتملت الحلقة، فلا مقعد للحصري (المعلّم). أخرِجوا أحدًا ليجلس.'}
      </p>
    </div>
  );
}

const UNITS: { value: Unit; label: string }[] = [
  { value: 'page', label: 'صفحة' },
  { value: 'ayah', label: 'آيات' },
  { value: 'rub', label: 'ربع حزب' },
  { value: 'surah', label: 'سورة' },
];

/**
 * How much a turn holds: the unit, then how many of it, from the model's
 * own table. Pages are written in words («صفحتان»), which fit. Ayat are
 * numerals, five to a row on a phone, each heard as its words («٣ آيات»)
 * after the numeral it shows, so the name still begins with what is seen.
 */
function TurnSize({
  config,
  onChange,
}: {
  config: Config;
  onChange: (config: Config) => void;
}) {
  const sizes = TURN_SIZES[config.unit];
  return (
    <div className="circle-size">
      <Choice<Unit>
        legend="مقدار كل دور"
        value={config.unit}
        onChange={(unit) =>
          onChange({
            ...config,
            unit,
            // A size the new unit also takes is kept; otherwise its first.
            size: TURN_SIZES[unit].includes(config.size)
              ? config.size
              : TURN_SIZES[unit][0],
          })
        }
        options={UNITS}
      />
      {sizes.length > 1 ? (
        <Choice<number>
          legend={
            config.unit === 'page'
              ? 'عدد الصفحات في كل دور'
              : 'عدد الآيات في كل دور'
          }
          hideLegend
          value={config.size}
          onChange={(size) => onChange({ ...config, size })}
          options={sizes.map((n) =>
            config.unit === 'page'
              ? { value: n, label: pagesCount(n) }
              : {
                  value: n,
                  label: arabic(n),
                  // «آية واحدة», «آيتان», «٣ آيات», without the numeral
                  // the label has just said.
                  spokenSuffix: ayatCount(n).replace(/^[٠-٩]+ /, ''),
                },
          )}
        />
      ) : null}
    </div>
  );
}

/**
 * What moves the turn on: the reader's «تمّ», or the time the sheikh takes
 * over the same ayat. Timed, the sheikh whose pace sets it is chosen right
 * there, with how much longer than him a reader is given.
 */
function TurnChangeField({
  config,
  onChange,
  onPickReciter,
}: {
  config: Config;
  onChange: (config: Config) => void;
  onPickReciter: (request: ReciterRequest) => void;
}) {
  const set = (patch: Partial<Config>) => onChange({ ...config, ...patch });
  const reciter = reciterById(config.reciter);
  return (
    <div className="turn-change">
      <Choice<TurnChange>
        legend="الانتقال إلى التالي"
        variant="cards"
        value={config.turnChange}
        onChange={(turnChange) => set({ turnChange })}
        options={[
          {
            value: 'manual',
            label: 'بضغطة «تمّ»',
            hint: 'يضغط القارئ «تمّ» حين ينتهي.',
          },
          {
            value: 'reciter',
            label: 'بتوقيت الشيخ',
            hint: 'ينتقل الدور حين تنقضي مدة تلاوة الشيخ له.',
          },
        ]}
      />
      {config.turnChange === 'reciter' ? (
        <div className="turn-timed">
          <SummaryRow
            leading={<ReciterAvatar reciter={reciter} size={40} />}
            title={reciter.name}
            detail={`يوقّت الدور · نحو ${clock(reciter.secondsPerPage * 1000)} للصفحة`}
            spokenSuffix="، غيّر الشيخ"
            onClick={() =>
              onPickReciter({
                title: 'الشيخ الذي يوقّت الدور',
                description:
                  'تُقاس بتلاوته مدة كل دور، وهو الذي يُسمَع في «استمع».',
                value: config.reciter,
                apply: (id) => set({ reciter: id }),
              })
            }
          />
          <div className="field">
            <Choice<Allowance>
              legend="مهلة الدور"
              value={config.allowance}
              onChange={(allowance) => set({ allowance })}
              options={[
                { value: 1, label: '×١', spokenSuffix: 'كتلاوته' },
                { value: 1.25, label: '×١٫٢٥', spokenSuffix: 'أطول بالربع' },
                { value: 1.5, label: '×١٫٥', spokenSuffix: 'أطول بالنصف' },
              ]}
            />
            <p className="field-note">
              يقرأ الناس أبطأ من الشيخ المتقن، والصغار أبطأ منهم.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where the sitting means to stop, and under it what that comes to from
 * where it starts. A page is typed in either digits, never in a
 * `type="number"` field, which throws away ٢٤; a page that is not one
 * keeps the goal as it was and says what is wanted.
 */
function GoalField({
  goal,
  from,
  alone,
  onChange,
}: {
  goal: Goal;
  from: number;
  /** A circle of one, spoken to as one. */
  alone: boolean;
  onChange: (goal: Goal) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(
    goal.to === 'page' ? arabic(goal.page) : '',
  );
  const typed = Number(digits(draft));
  const valid = Number.isInteger(typed) && typed >= 1 && typed <= PAGE_COUNT;
  return (
    <div className="field circle-goal">
      <Choice<Goal['to']>
        legend="إلى أين؟"
        value={goal.to}
        onChange={(to) => {
          if (to !== 'page') return onChange({ to });
          // The page typed before, or the page the sitting starts on.
          const page = valid ? typed : pageOfAyah(from);
          setDraft(arabic(page));
          onChange({ to, page });
        }}
        options={[
          { value: 'none', label: 'بلا غاية' },
          { value: 'surah', label: 'إلى آخر السورة' },
          { value: 'juz', label: 'إلى آخر الجزء' },
          { value: 'page', label: 'إلى صفحة…' },
        ]}
      />
      {goal.to === 'page' ? (
        <div className="circle-goal-page">
          <label className="field-label" htmlFor={`${id}-page`}>
            آخر صفحة يقرؤها المجلس
          </label>
          <input
            id={`${id}-page`}
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby={`${id}-note`}
            aria-invalid={!valid || undefined}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const page = Number(digits(e.target.value));
              if (Number.isInteger(page) && page >= 1 && page <= PAGE_COUNT)
                onChange({ to: 'page', page });
            }}
          />
        </div>
      ) : null}
      <p className="field-note" id={`${id}-note`}>
        {goal.to === 'page' && !valid
          ? `اكتب رقمًا من ١ إلى ${arabic(PAGE_COUNT)}.`
          : goalNote(goal, from, alone)}
      </p>
    </div>
  );
}
