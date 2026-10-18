import { useId, type ReactNode } from 'react';

export type Option<T extends string | number> = {
  value: T;
  /** What the option shows, and the start of its accessible name. Write
      the words where there is room («صفحتان», not «٢»). */
  label: ReactNode;
  /** A second line under the label, for choices that need a word of why.
      A screen reader hears it as the option's description. */
  hint?: ReactNode;
  /** Words a screen reader hears after the label, where the label alone
      is a numeral or a sign: «٣» heard as «٣ آيات». Only ever added after
      what is shown, never in its place, so the name a voice-control user
      reads off the screen is the name that works (WCAG 2.5.3). */
  spokenSuffix?: string;
};

/**
 * A set of mutually exclusive options, drawn as buttons and built from native
 * radio inputs, so arrow keys move between them and a screen reader announces
 * "1 of 3, selected" with nothing written to make it so.
 *
 * Each radio is named by its label alone and described by its hint, so a
 * card is heard as «التتابع» and then why, rather than as one long name.
 */
export function Choice<T extends string | number>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  variant = 'pills',
}: {
  legend: string;
  hideLegend?: boolean;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `pills` for short labels in a row, `cards` for options with a hint. */
  variant?: 'pills' | 'cards';
}) {
  const name = useId();
  return (
    <fieldset className={`choice choice-${variant}`}>
      <legend className={hideLegend ? 'visually-hidden' : 'field-label'}>
        {legend}
      </legend>
      <div className="choice-options">
        {options.map((o, i) => {
          const id = `${name}-${i}`;
          return (
            <label
              key={String(o.value)}
              className="choice-option"
              data-checked={o.value === value || undefined}
            >
              <input
                type="radio"
                name={name}
                value={String(o.value)}
                checked={o.value === value}
                onChange={() => onChange(o.value)}
                // Two references are read one after the other with a space
                // between, so the spoken words follow the label as words.
                aria-labelledby={
                  o.spokenSuffix ? `${id}-label ${id}-more` : `${id}-label`
                }
                aria-describedby={o.hint ? `${id}-hint` : undefined}
              />
              <span className="choice-label" id={`${id}-label`}>
                {o.label}
              </span>
              {o.spokenSuffix ? (
                <span className="visually-hidden" id={`${id}-more`}>
                  {o.spokenSuffix}
                </span>
              ) : null}
              {o.hint ? (
                <span className="choice-hint" id={`${id}-hint`}>
                  {o.hint}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
