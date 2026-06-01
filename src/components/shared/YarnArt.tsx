interface Props { className?: string }

/**
 * A ball of yarn with a trailing strand — themed empty-state illustration
 * (a nod to the app name "Purl"). Uses `currentColor`, so colour it with text-* classes.
 */
export function YarnBall({ className }: Props) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <circle cx="24" cy="25" r="14" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.65">
        <path d="M11 21 Q24 15 37 23" />
        <path d="M10 28 Q24 22 38 30" />
        <path d="M13 34 Q24 30 34 35" />
        <path d="M18 13 Q29 25 20 37" />
        <path d="M30 13 Q21 25 31 36" />
      </g>
      {/* loose trailing strand */}
      <path d="M37 28 q7 3 4 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A slowly spinning ball of yarn — a themed loading indicator. */
export function YarnSpinner({ className }: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={`animate-spin ${className ?? ''}`}
      style={{ animationDuration: '1.5s' }}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="15" stroke="currentColor" strokeWidth="2" opacity="0.85" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
        <path d="M10 20 Q24 14 38 22" />
        <path d="M9 27 Q24 21 39 29" />
        <path d="M12 34 Q24 29 36 35" />
        <path d="M18 11 Q29 24 20 38" />
        <path d="M30 11 Q21 24 31 38" />
      </g>
    </svg>
  );
}
