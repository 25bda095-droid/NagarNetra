// NagarNetra mark: a small eye.
export default function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M5 16c3-5 7-7.5 11-7.5S24 11 27 16c-3 5-7 7.5-11 7.5S8 21 5 16Z" fill="none" stroke="var(--brand-ink)" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill="var(--brand-ink)" />
    </svg>
  );
}
