interface FlagIconProps {
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "ES", "FR", "SA"). */
  code: string;
  className?: string;
  size?: number;
}

/**
 * Renders a country flag as an inline SVG.
 *
 * Inline SVGs are used instead of emoji flags because emoji support varies
 * across operating systems and device versions — on older Windows, Linux, and
 * Android builds flags may render as the two-letter country code or a blank
 * box. Inline SVGs render identically on every browser and device.
 *
 * Only the four supported app languages are included; any unknown code
 * renders a neutral blank flag so the layout never breaks.
 */
export function FlagIcon({ code, className, size = 16 }: FlagIconProps): JSX.Element {
  const upper = code.toUpperCase();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={upper}
      className={className}
    >
      {upper === 'US' && (
        <>
          <rect width="16" height="16" fill="white" />
          <rect y="0" height="2" width="16" fill="#B22234" />
          <rect y="4" height="2" width="16" fill="#B22234" />
          <rect y="8" height="2" width="16" fill="#B22234" />
          <rect y="12" height="2" width="16" fill="#B22234" />
          <rect width="6" height="6" fill="#3C3B6E" />
        </>
      )}
      {upper === 'ES' && (
        <>
          <rect width="16" height="16" fill="white" />
          <rect y="4" height="4" width="16" fill="#F1BF00" />
          <rect y="2" height="2" width="16" fill="#AA151B" />
          <rect y="10" height="2" width="16" fill="#AA151B" />
        </>
      )}
      {upper === 'FR' && (
        <>
          <rect width="16" height="16" fill="white" />
          <rect width="4" height="16" fill="#002D9E" />
          <rect x="12" width="4" height="16" fill="#ED2939" />
        </>
      )}
      {upper === 'SA' && (
        <rect width="16" height="16" fill="#006C35" />
      )}
    </svg>
  );
}
