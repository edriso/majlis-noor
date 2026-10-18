import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Headphones,
  UserPlus,
  X,
} from './icons';
import { useEffect, useId, useRef, useState } from 'react';
import { arabic, seatsCount } from '@/data/arabic';
import { reciterById } from '@/data/reciters';
import {
  MAX_MEMBERS,
  memberName,
  newMember,
  type Allowance,
  type Config,
  type Member,
  type MemberKind,
  type ReciterMember,
  type TurnChange,
} from '@/halaqa/state';
import type { Mode } from '@/halaqa/schedule';
import { Choice } from './Choice';
import { MemberAvatar } from './MemberAvatar';
import { ReciterAvatar } from './ReciterAvatar';

/** What the reciter list is opened for, and what choosing one does. The
    form asks; the screen holding it shows the list (a sheet of its own on
    the start screen, a panel of the settings sheet in a halaqa). */
export type ReciterRequest = {
  title: string;
  description: string;
  value: string;
  apply: (reciter: string) => void;
};

/**
 * The shape of the circle: who sits in it and in what order, how the pages
 * pass between them, how much each reads, and what moves the turn on. The
 * same form on the start screen and in the settings, so a halaqa is set up
 * and changed in one vocabulary.
 */
export function HalaqaForm({
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
  const hasReciter = config.members.some((m) => m.kind === 'reciter');

  return (
    <div className="halaqa-form">
      <Members
        members={config.members}
        onChange={(members) => set({ members })}
        onPickReciter={onPickReciter}
      />

      {config.members.length > 1 && (
        <Choice<Mode>
          legend="طريقة القراءة"
          variant="cards"
          value={config.mode}
          onChange={(mode) => set({ mode })}
          options={[
            {
              value: 'continue',
              label: 'التتابع',
              hint: 'يقرأ كل واحد الصفحة التالية.',
            },
            {
              value: 'repeat',
              label: 'تكرار الصفحة',
              hint: hasReciter
                ? 'يتلوها الشيخ ويقرؤها الحاضرون، ثم ننتقل.'
                : 'يقرأ الجميع الصفحة نفسها ثم ننتقل.',
            },
          ]}
        />
      )}

      <Choice<number>
        legend="صفحات كل دور"
        value={config.pagesPerTurn}
        onChange={(pagesPerTurn) => set({ pagesPerTurn })}
        options={[1, 2, 3].map((n) => ({
          value: n,
          label: arabic(n),
          ariaLabel: ['صفحة واحدة', 'صفحتان', 'ثلاث صفحات'][n - 1],
        }))}
      />

      <div className="turn-change">
        <Choice<TurnChange>
          legend="الانتقال إلى القارئ التالي"
          variant="cards"
          value={config.turnChange}
          onChange={(turnChange) => set({ turnChange })}
          options={[
            {
              value: 'manual',
              label: 'يدوي',
              hint: 'يضغط القارئ «تمّ» حين ينتهي.',
            },
            {
              value: 'reciter',
              label: 'بتوقيت قارئ',
              hint: 'ينتقل الدور بعد مدة تلاوة القارئ للصفحة.',
            },
          ]}
        />
        {config.turnChange === 'reciter' ? (
          <div className="field">
            <Choice<Allowance>
              legend="مهلة الدور"
              value={config.allowance}
              onChange={(allowance) => set({ allowance })}
              options={[
                { value: 1, label: 'كتلاوته' },
                { value: 1.25, label: 'أطول بالربع' },
                { value: 1.5, label: 'أطول بالنصف' },
              ]}
            />
            <p className="field-note">
              يقرأ الناس أبطأ من القارئ المتقن، والصغار أبطأ منهم.
            </p>
          </div>
        ) : null}
        <button
          type="button"
          className="reciter-button"
          onClick={() =>
            onPickReciter({
              title: 'قارئ الاستماع والتوقيت',
              description:
                'قارئ يُستمع إليه في الصفحة، وتُقاس بتلاوته مدة الدور إن كان الانتقال بالتوقيت.',
              value: config.reciter,
              apply: (id) => set({ reciter: id }),
            })
          }
        >
          <ReciterAvatar reciter={reciter} size={40} />
          <span className="reciter-text">
            <span className="reciter-caption">
              {config.turnChange === 'reciter' ? 'التوقيت والاستماع' : 'الاستماع'}
            </span>
            <span className="reciter-name">{reciter.name}</span>
          </span>
          <ChevronLeft size={18} aria-hidden="true" />
          <span className="visually-hidden">، تغيير القارئ</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Who sits in the circle, in the order they read: people, who read from the
 * page themselves, and reciters, whose recordings recite their turns. Each
 * can be moved up or down, renamed or rechosen, and taken out; the list
 * keeps at least one member and at most four.
 *
 * Every change is said aloud in a live region, because a reordered list
 * otherwise changes under a screen reader without a word. Focus stays on
 * the button that moved a member, goes to the new name field when a reader
 * is added, and to the next row when one is taken out.
 */
function Members({
  members,
  onChange,
  onPickReciter,
}: {
  members: Member[];
  onChange: (members: Member[]) => void;
  onPickReciter: (request: ReciterRequest) => void;
}) {
  const id = useId();
  const [message, setMessage] = useState('');
  const focusNext = useRef<string | null>(null);
  const full = members.length >= MAX_MEMBERS;
  const n = members.length;

  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const add = (kind: MemberKind, reciter?: string) => {
    const member = newMember(members, kind, reciter);
    if (!member) return;
    onChange([...members, member]);
    setMessage(
      `أُضيف إلى الحلقة: ${memberName(member)}، في المقعد ${arabic(n + 1)}.`,
    );
    if (kind === 'person') focusNext.current = `${id}-${member.id}-name`;
  };

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= n) return;
    const next = [...members];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    // React moves one of the two rows by taking it out and putting it back,
    // and a row taken out loses focus; so the pressed button is focused
    // again, wherever its row now is.
    focusNext.current = `${id}-${members[i].id}-${by < 0 ? 'up' : 'down'}`;
    setMessage(
      `${memberName(members[i])}: المقعد ${arabic(j + 1)} من ${arabic(n)}.`,
    );
  };

  const remove = (i: number) => {
    if (n === 1) return;
    const next = members.filter((_, k) => k !== i);
    onChange(next);
    setMessage(`أُخرج من الحلقة: ${memberName(members[i])}.`);
    const neighbour = next[Math.min(i, next.length - 1)];
    focusNext.current = `${id}-${neighbour.id}-remove`;
  };

  const pick = (i: number, member: ReciterMember) =>
    onPickReciter({
      title: 'اختر الشيخ',
      description: 'من يتلو هذا الدور في الحلقة.',
      value: member.reciter,
      apply: (reciter) => {
        const next = [...members];
        next[i] = { ...member, reciter };
        onChange(next);
        setMessage(`يتلو هذا الدور: ${reciterById(reciter).name}.`);
      },
    });

  return (
    <fieldset className="members" aria-describedby={`${id}-note`}>
      <legend className="field-label">أهل الحلقة</legend>
      <p className="field-note members-note" id={`${id}-note`}>
        يقرؤون بهذا الترتيب، والأسماء اختيارية.
      </p>

      <ol className="member-list">
        {members.map((m, i) => {
          const name = memberName(m);
          return (
            <li className="member" key={m.id} data-kind={m.kind}>
              <MemberAvatar member={m} size={40} />
              {m.kind === 'person' ? (
                <input
                  id={`${id}-${m.id}-name`}
                  className="input member-name"
                  type="text"
                  autoComplete="off"
                  maxLength={40}
                  aria-label={`اسم القارئ في المقعد ${arabic(i + 1)}`}
                  placeholder={memberName({ ...m, name: '' })}
                  value={m.name}
                  onChange={(e) => {
                    const next = [...members];
                    next[i] = { ...m, name: e.target.value };
                    onChange(next);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="member-reciter"
                  onClick={() => pick(i, m)}
                  aria-label={`الشيخ في المقعد ${arabic(i + 1)}: ${reciterById(m.reciter).name}، تغيير`}
                >
                  <span className="member-reciter-name">
                    الشيخ {reciterById(m.reciter).short}
                  </span>
                  <span className="member-reciter-meta">
                    {reciterById(m.reciter).style} · تُسمَع تلاوته
                  </span>
                </button>
              )}
              <span className="member-actions">
                <button
                  type="button"
                  id={`${id}-${m.id}-up`}
                  className="member-action"
                  onClick={() => move(i, -1)}
                  aria-disabled={i === 0}
                  aria-label={`تقديم: ${name}`}
                  title="قدِّم"
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  id={`${id}-${m.id}-down`}
                  className="member-action"
                  onClick={() => move(i, 1)}
                  aria-disabled={i === n - 1}
                  aria-label={`تأخير: ${name}`}
                  title="أخِّر"
                >
                  <ArrowDown size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  id={`${id}-${m.id}-remove`}
                  className="member-action"
                  onClick={() => remove(i)}
                  aria-disabled={n === 1}
                  aria-label={`إخراج من الحلقة: ${name}`}
                  title="أخرِج من الحلقة"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="member-add">
        <button
          type="button"
          className="member-add-button"
          onClick={() => {
            if (full) return;
            onPickReciter({
              title: 'أضف شيخًا إلى الحلقة',
              description:
                'شيخ تُسمَع تلاوته في دوره، ثم ينتقل الدور إلى من بعده.',
              value: '',
              apply: (reciter) => add('reciter', reciter),
            });
          }}
          aria-disabled={full}
        >
          <Headphones size={20} aria-hidden="true" />
          <span className="member-add-text">
            <span className="member-add-label">أضف شيخًا</span>
            <span className="member-add-hint">تُسمَع تلاوته في دوره</span>
          </span>
        </button>
        <button
          type="button"
          className="member-add-button"
          onClick={() => add('person')}
          aria-disabled={full}
        >
          <UserPlus size={20} aria-hidden="true" />
          <span className="member-add-text">
            <span className="member-add-label">أضف قارئًا</span>
            <span className="member-add-hint">يقرأ بنفسه</span>
          </span>
        </button>
      </div>
      {full ? (
        <p className="field-note">اكتملت الحلقة: {seatsCount(MAX_MEMBERS)}.</p>
      ) : null}

      <output className="visually-hidden" aria-live="polite">
        {message}
      </output>
    </fieldset>
  );
}
