/**
 * The mark: three seats around a circle, and the page they gather on at its
 * centre. Drawn in `currentColor`, so it takes whatever gold the theme sets.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="logo-mark"
    >
      <circle
        cx="24"
        cy="24"
        r="17"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.55"
      />
      <circle cx="24" cy="7" r="3.6" fill="currentColor" />
      <circle cx="38.7" cy="32.5" r="3.6" fill="currentColor" />
      <circle cx="9.3" cy="32.5" r="3.6" fill="currentColor" />
      <path
        d="M24 18.5c-2.4-1.5-5-1.9-7.2-1.3v12.3c2.2-.6 4.8-.2 7.2 1.3 2.4-1.5 5-1.9 7.2-1.3V17.2c-2.2-.6-4.8-.2-7.2 1.3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M24 18.5v12.3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
