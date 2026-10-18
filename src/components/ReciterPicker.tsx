import { Check, Play, Square } from './icons';
import { useId } from 'react';
import { clock } from '@/data/arabic';
import { paceLabel, reciters, type Reciter } from '@/data/reciters';
import { useSample, useTimings } from '@/halaqa/useRecitation';
import { ReciterAvatar } from './ReciterAvatar';

/** The reciters in the bands `paceLabel` names, the most deliberate first,
    which is the order `reciters` already keeps. */
const paceBands = reciters.reduce<{ label: string; members: Reciter[] }[]>(
  (bands, reciter) => {
    const label = paceLabel(reciter.secondsPerPage);
    const last = bands.at(-1);
    if (last?.label === label) last.members.push(reciter);
    else bands.push({ label, members: [reciter] });
    return bands;
  },
  [],
);

/**
 * The sheikhs, grouped by how deliberately they recite, since that is what
 * decides how long a turn is and what a halaqa learning new pages chooses
 * between. Each shows his average page, «نحو ٤:١٤ للصفحة», and can be heard
 * before he is chosen. A sample that cannot be heard says so on his row,
 * and aloud, until it is pressed again.
 *
 * Each is a button that says whether it is the chosen one, rather than a
 * radio: arrowing through a radio group selects as it goes, and choosing
 * closes this list.
 */
export function ReciterPicker({
  value,
  onChange,
}: {
  /** The chosen reciter, or '' when adding one. */
  value: string;
  onChange: (id: string) => void;
}) {
  const { timings } = useTimings(reciters.map((r) => r.id));
  const sample = useSample(timings);
  const groups = useId();
  const failed = reciters.find((r) => sample.failed(r.id));

  return (
    <div className="reciter-picker">
      <p className="field-note">
        اضغط زرّ التشغيل بجانب الشيخ لتسمعه يتلو الفاتحة. والمدة تحت اسمه متوسط
        تلاوته للصفحة.
      </p>
      {paceBands.map((band, i) => (
        <section className="reciter-band" key={band.label}>
          <h3 className="reciter-band-label" id={`${groups}-${i}`}>
            أداء {band.label}
          </h3>
          <ul className="reciter-list" aria-labelledby={`${groups}-${i}`}>
            {band.members.map((r) => {
              const chosen = r.id === value;
              const phase = sample.phase(r.id);
              return (
                <li
                  key={r.id}
                  className="reciter-row"
                  data-chosen={chosen || undefined}
                >
                  <button
                    type="button"
                    className="reciter-choice"
                    aria-pressed={chosen}
                    onClick={() => onChange(r.id)}
                  >
                    <ReciterAvatar reciter={r} size={48} />
                    <span className="reciter-text">
                      <span className="reciter-name">{r.name}</span>
                      <span className="reciter-meta">
                        {r.style} · نحو {clock(r.secondsPerPage * 1000)} للصفحة
                      </span>
                      {failed === r ? (
                        <span className="reciter-failed">
                          تعذّر تشغيل الفاتحة
                        </span>
                      ) : null}
                    </span>
                    <span className="reciter-check" aria-hidden="true">
                      {chosen ? <Check size={18} /> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button reciter-sample"
                    aria-label={`استمع إلى ${r.name} (${r.style}) يتلو الفاتحة`}
                    aria-pressed={phase !== undefined}
                    data-phase={phase}
                    onClick={() => sample.toggle(r.id)}
                  >
                    {phase ? (
                      <Square size={15} aria-hidden="true" />
                    ) : (
                      <Play size={17} aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="visually-hidden" aria-live="polite">
        {failed ? `تعذّر تشغيل الفاتحة بصوت ${failed.name}.` : ''}
      </p>
    </div>
  );
}
