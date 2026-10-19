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
  type Config,
  type Member,
  type MemberKind,
  type ReciterMember,
} from '@/halaqa/state';
import { CircleOptions } from './CircleOptions';
import { MemberAvatar } from './MemberAvatar';

/** What the reciter list is opened for, and what choosing one does. The
    form asks; the screen holding it shows the list (in place of the sheet
    that asked, with a way back, or a sheet of its own). */
export type ReciterRequest = {
  title: string;
  description: string;
  value: string;
  apply: (reciter: string) => void;
};

/**
 * The whole circle in one form: who sits in it and in what order, then how
 * it reads (`CircleOptions`). The settings of a sitting show it so; the
 * start screen shows the members on the screen and the rest in a sheet
 * behind one row, from the same two parts, so a halaqa is set up and
 * changed in one vocabulary.
 */
export function HalaqaForm({
  config,
  onChange,
  onPickReciter,
  from,
}: {
  config: Config;
  onChange: (config: Config) => void;
  onPickReciter: (request: ReciterRequest) => void;
  /** Where a goal is counted from, if not where the sitting starts. */
  from?: number;
}) {
  return (
    <div className="halaqa-form">
      <Members
        members={config.members}
        onChange={(members) => onChange({ ...config, members })}
        onPickReciter={onPickReciter}
      />
      <CircleOptions
        config={config}
        onChange={onChange}
        onPickReciter={onPickReciter}
        from={from}
      />
    </div>
  );
}

/**
 * Who sits in the circle, in the order they read: people, who read from the
 * page themselves, and sheikhs, whose recordings recite their turns. Each
 * row is a face, a name, and, once there are two to order, buttons to move
 * it up or down or take it out; a lone «أنت» has nothing to move. At most
 * eight; when the circle is full the add buttons say so under them.
 *
 * Every change is said aloud in a live region, because a reordered list
 * otherwise changes under a screen reader without a word. Focus stays on
 * the button that moved a member, goes to the new name field when a reader
 * is added, and to the next row when one is taken out (to the one left's
 * name, when the buttons go with the second-last).
 */
export function Members({
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
  const people = members.filter((m) => m.kind === 'person').length;

  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  /** The control a member's row always has: the name, or the sheikh. */
  const mainOf = (m: Member) =>
    `${id}-${m.id}-${m.kind === 'person' ? 'name' : 'pick'}`;

  const add = (kind: MemberKind, reciter?: string) => {
    const member = newMember(members, kind, reciter);
    if (!member) return;
    onChange([...members, member]);
    setMessage(
      `أُضيف إلى الحلقة: ${memberName(member)}، في المقعد ${arabic(n + 1)}.`,
    );
    if (kind === 'person') focusNext.current = mainOf(member);
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
    // One left has no buttons to land on.
    focusNext.current =
      next.length > 1 ? `${id}-${neighbour.id}-remove` : mainOf(neighbour);
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
    <fieldset
      className="members"
      aria-describedby={n > 1 ? `${id}-note` : undefined}
    >
      <legend className="section-heading">أهل الحلقة</legend>
      {n > 1 ? (
        <p className="section-note" id={`${id}-note`}>
          يقرؤون بهذا الترتيب.
        </p>
      ) : null}

      <ol className="member-list">
        {members.map((m, i) => {
          const name = memberName(m);
          return (
            <li className="member" key={m.id} data-kind={m.kind}>
              <MemberAvatar member={m} size={40} />
              {m.kind === 'person' ? (
                <input
                  id={mainOf(m)}
                  className="input member-name"
                  type="text"
                  autoComplete="off"
                  maxLength={40}
                  aria-label={`اسم القارئ في المقعد ${arabic(i + 1)}`}
                  // The one person present is the one holding the device.
                  placeholder={
                    people === 1 ? 'اسمك (اختياري)' : 'اسم القارئ (اختياري)'
                  }
                  value={m.name}
                  onChange={(e) => {
                    const next = [...members];
                    next[i] = { ...m, name: e.target.value };
                    onChange(next);
                  }}
                />
              ) : (
                <SheikhButton
                  id={mainOf(m)}
                  member={m}
                  seat={i + 1}
                  onClick={() => pick(i, m)}
                />
              )}
              {n > 1 ? (
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
                    aria-label={`إخراج من الحلقة: ${name}`}
                    title="أخرِج من الحلقة"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Above the add buttons it explains, where it is seen with them:
          under them it fell behind the start screen's held button. */}
      {full ? (
        <p className="field-note member-full" id={`${id}-full`}>
          اكتملت الحلقة: {seatsCount(MAX_MEMBERS)}.
        </p>
      ) : null}
      <div className="member-add">
        <button
          type="button"
          className="member-add-button"
          onClick={() => add('person')}
          aria-disabled={full || undefined}
          aria-describedby={full ? `${id}-full` : undefined}
        >
          <UserPlus size={20} aria-hidden="true" />
          <span className="member-add-text">
            <span className="member-add-label">أضف قارئًا</span>
            <span className="member-add-hint">من الحاضرين</span>
          </span>
        </button>
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
          aria-disabled={full || undefined}
          aria-describedby={full ? `${id}-full` : undefined}
        >
          <Headphones size={20} aria-hidden="true" />
          <span className="member-add-text">
            <span className="member-add-label">أضف شيخًا</span>
            <span className="member-add-hint">تلاوة مسجّلة</span>
          </span>
        </button>
      </div>

      <output className="visually-hidden" aria-live="polite">
        {message}
      </output>
    </fieldset>
  );
}

/** A sheikh's seat: his name and the style of his recording, pressed to
    choose another. Drawn as a row that opens, with the chevron the
    summary rows have, not as a field: there is nothing to type in it. Named by what it shows, then which seat it is and what
    a press does, so the words on it are the start of its name. */
function SheikhButton({
  id,
  member,
  seat,
  onClick,
}: {
  id: string;
  member: ReciterMember;
  seat: number;
  onClick: () => void;
}) {
  const reciter = reciterById(member.reciter);
  return (
    <button type="button" id={id} className="member-reciter" onClick={onClick}>
      <span className="member-reciter-text">
        <span className="member-reciter-name">الشيخ {reciter.short}</span>
        <span className="member-reciter-meta">{reciter.style}</span>
      </span>
      <span className="visually-hidden">، في المقعد {arabic(seat)}، غيّره</span>
      <ChevronLeft size={18} aria-hidden="true" />
    </button>
  );
}
