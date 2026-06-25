export function ReqlyLogo() {
  return (
    <div className="flex items-center gap-2.5 shrink-0 select-none">
      {/* Icon mark: rounded square with stylised send arrow */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Background */}
        <rect width="22" height="22" rx="6" fill="#3b82f6" />

        {/* Horizontal arrow shaft */}
        <line x1="5.5" y1="11" x2="13.5" y2="11" stroke="white" strokeWidth="1.75" strokeLinecap="round" />

        {/* Arrowhead */}
        <polyline
          points="10.5,7.5 14.5,11 10.5,14.5"
          fill="none"
          stroke="white"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Small dot at the tail - represents a "from" endpoint */}
        <circle cx="5.5" cy="11" r="1.25" fill="rgba(255,255,255,0.55)" />
      </svg>

      {/* Wordmark */}
      <span
        style={{
          fontWeight: 700,
          fontSize: '0.9375rem',
          letterSpacing: '-0.03em',
          color: '#e4e4e7',
          lineHeight: 1,
        }}
      >
        Req<span style={{ color: '#3b82f6' }}>ly</span>
      </span>
    </div>
  );
}
