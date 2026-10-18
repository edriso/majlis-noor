import { useId, type ReactNode } from 'react';

/**
 * Something that is on or off, such as reading from memory. A real
 * checkbox with the switch role, so a screen reader says «on» and «off»
 * rather than «checked», and Space turns it as it turns any checkbox. The
 * whole row, words and all, is the target, at least 44px tall.
 *
 * Named by its label alone and described by its hint, so the hint is heard
 * after the state rather than inside the name.
 */
export function Switch({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  /** A line under the label saying what turning it on does. */
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="switch" data-checked={checked || undefined}>
      <span className="switch-text">
        <span className="switch-label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? (
          <span className="switch-hint" id={`${id}-hint`}>
            {hint}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch-input"
        checked={checked}
        // The same state the checkbox carries, for the switch role, which
        // asks for it of every element it is given to.
        aria-checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </label>
  );
}
