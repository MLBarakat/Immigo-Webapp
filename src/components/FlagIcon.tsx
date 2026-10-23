interface FlagIconProps {
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "ES", "FR", "SA"). */
  code: string;
  /** Country name used for the accessible label. */
  label?: string;
  className?: string;
  size?: number;
}

/**
 * Renders a country flag as a detailed inline SVG.
 *
 * Inline SVGs are used instead of emoji flags because emoji support varies
 * across operating systems and device versions — on older Windows, Linux, and
 * Android builds flags may render as the two-letter country code or a blank
 * box. Inline SVGs render identically on every browser and device.
 *
 * Each flag is drawn inside a 16×16 viewBox using the official colors so the
 * flag remains recognisable even at the small sizes used in the language
 * selector.
 */
export function FlagIcon({
  code,
  label,
  className,
  size = 16,
}: FlagIconProps): JSX.Element {
  const upper = code.toUpperCase();
  const ariaLabel = label ?? upper;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      {upper === 'US' && (
        <g>
          {/* Base white field */}
          <rect width="16" height="16" fill="white" />
          {/* Seven horizontal stripes (simplified 13-stripe pattern):
              red-white-red-white-red-white-red */}
          <rect y={0} height={16 / 7} width="16" fill="#B22234" />
          <rect y={4.57} height={16 / 7} width="16" fill="#B22234" />
          <rect y={9.14} height={16 / 7} width="16" fill="#B22234" />
          <rect y={13.71} height={16 / 7} width="16" fill="#B22234" />
          {/* Blue canton (union) — top left */}
          <rect width="6.5" height="8.6" fill="#3C3B6E" />
          {/* White stars in the canton (representative grid of 11 stars) */}
          <circle cx="1.2" cy="1.3" r="0.5" fill="white" />
          <circle cx="2.6" cy="1.3" r="0.5" fill="white" />
          <circle cx="4.0" cy="1.3" r="0.5" fill="white" />
          <circle cx="5.4" cy="1.3" r="0.5" fill="white" />
          <circle cx="1.9" cy="2.6" r="0.5" fill="white" />
          <circle cx="3.3" cy="2.6" r="0.5" fill="white" />
          <circle cx="4.7" cy="2.6" r="0.5" fill="white" />
          <circle cx="1.2" cy="3.9" r="0.5" fill="white" />
          <circle cx="2.6" cy="3.9" r="0.5" fill="white" />
          <circle cx="4.0" cy="3.9" r="0.5" fill="white" />
          <circle cx="5.4" cy="3.9" r="0.5" fill="white" />
        </g>
      )}
      {upper === 'ES' && (
        <g>
          {/* Spain: red-yellow-red, yellow band is double the height of each red band */}
          <rect y="0" height="4" width="16" fill="#AA151B" />
          <rect y="4" height="8" width="16" fill="#F1BF00" />
          <rect y="12" height="4" width="16" fill="#AA151B" />
          {/* Simplified coat of arms on the yellow band, offset toward the hoist */}
          <rect x="5.6" y="7.2" width="1.6" height="1.6" fill="#742B67" rx="0.2" />
          <circle cx="6.4" cy="8" r="0.5" fill="#F1BF00" />
          <rect x="6.2" y="7.4" width="0.4" height="1.2" fill="#AA151B" />
        </g>
      )}
      {upper === 'FR' && (
        <g>
          {/* France: vertical tricolor — blue, white, red (equal thirds) */}
          <rect width={16 / 3} height="16" fill="#002D9E" />
          <rect x={16 / 3} width={16 / 3} height="16" fill="white" />
          <rect x={32 / 3} width={16 / 3} height="16" fill="#ED2939" />
        </g>
      )}
      {upper === 'SA' && (
        <g>
          {/* Saudi Arabia: green field */}
          <rect width="16" height="16" fill="#006C35" />
          {/* White shahada text marks above the sword */}
          <rect x="5" y="2.5" width="1.2" height="0.6" fill="white" />
          <rect x="6.6" y="2.5" width="1.2" height="0.6" fill="white" />
          <rect x="8.2" y="2.5" width="1.2" height="0.6" fill="white" />
          {/* White sword pointing toward the hoist (left) */}
          <path
            d="M 4.5 8 L 11.5 8 L 12 6.5 L 12 9.5 Z"
            fill="white"
          />
          <rect x="11.2" y="7.2" width="1.6" height="1.6" fill="white" />
        </g>
      )}
    </svg>
  );
}
