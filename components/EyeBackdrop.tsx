// Large, faint "netra" (eye) behind every page: blinks and looks around (CSS only, honours reduced motion).
export default function EyeBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 400 220" className="w-[min(120vw,1100px)] text-brand opacity-[0.07] dark:opacity-[0.09]">
        <g className="nn-eye-lid">
          <path d="M10 110 C 90 10, 310 10, 390 110 C 310 210, 90 210, 10 110 Z" fill="none" stroke="currentColor" strokeWidth="6" />
          <clipPath id="nn-eye-clip"><path d="M10 110 C 90 10, 310 10, 390 110 C 310 210, 90 210, 10 110 Z" /></clipPath>
          <g clipPath="url(#nn-eye-clip)">
            <g className="nn-eye-iris">
              <circle cx="200" cy="110" r="62" fill="none" stroke="currentColor" strokeWidth="6" />
              <circle cx="200" cy="110" r="28" fill="currentColor" />
              <circle cx="214" cy="96" r="8" fill="var(--bg)" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
