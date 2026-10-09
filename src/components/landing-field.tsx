/**
 * Decorative backdrop for the landing hero: a fine engraved guilloche lattice, a slowly counter-turning
 * rosette and a large watch dial. Pure inline SVG on the theme tokens (gold lines at low opacity on the navy
 * or silver field), no image. The turning is CSS (`.landing-dial-turn`, `.landing-rosette-turn` in
 * globals.css) and is switched off under prefers-reduced-motion. Entirely aria-hidden.
 */

const CX = 500;

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CX + r * Math.sin(a)];
}

const f = (n: number) => n.toFixed(2);

/** 120 minute ticks (every third is longer, every fifth degree-block of 10 a baton) on the dial. */
const TICKS = Array.from({ length: 120 }, (_, i) => {
  const deg = i * 3;
  const major = i % 10 === 0;
  const mid = i % 2 === 0;
  const [x1, y1] = polar(470, deg);
  const [x2, y2] = polar(major ? 430 : mid ? 450 : 458, deg);
  return { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2), major, mid };
});

/** Twelve hour batons inside the minute track. */
const BATONS = Array.from({ length: 12 }, (_, i) => {
  const deg = i * 30;
  const [x1, y1] = polar(395, deg);
  const [x2, y2] = polar(345, deg);
  return { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2) };
});

/** Rosette: ellipses turned in 6-degree steps trace a spirograph-like engraved flower. */
const ROSETTE = Array.from({ length: 60 }, (_, i) => i * 6);

export function LandingField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Guilloche lattice: interlocking circles, faded out toward the edges. */}
      <svg className="absolute inset-0 size-full text-primary opacity-[0.12]" focusable="false">
        <defs>
          <pattern id="landing-lattice" width="36" height="36" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="36" cy="0" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="0" cy="36" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="36" cy="36" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="18" cy="18" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="landing-lattice-fade" cx="70%" cy="40%" r="75%">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
          </radialGradient>
          <mask id="landing-lattice-mask">
            <rect width="100%" height="100%" fill="url(#landing-lattice-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#landing-lattice)" mask="url(#landing-lattice-mask)" />
      </svg>

      {/* Dial and rosette, centred behind the whole hero (symmetric, so it reads the same in RTL). */}
      <div className="absolute left-1/2 top-1/2 aspect-square w-[170vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 sm:w-[110vw]">
        <svg viewBox="0 0 1000 1000" className="landing-rosette-turn absolute inset-0 size-full text-primary opacity-[0.18]" focusable="false">
          {ROSETTE.map((deg) => (
            <ellipse key={deg} cx={CX} cy={CX} rx="300" ry="86" transform={`rotate(${deg} ${CX} ${CX})`} fill="none" stroke="currentColor" strokeWidth="0.6" />
          ))}
        </svg>
        <svg viewBox="0 0 1000 1000" className="landing-dial-turn absolute inset-0 size-full text-primary opacity-[0.24]" focusable="false">
          <circle cx={CX} cy={CX} r="485" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx={CX} cy={CX} r="478" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx={CX} cy={CX} r="410" fill="none" stroke="currentColor" strokeWidth="0.6" />
          <circle cx={CX} cy={CX} r="250" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 6" />
          <circle cx={CX} cy={CX} r="120" fill="none" stroke="currentColor" strokeWidth="0.6" />
          {TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="currentColor" strokeWidth={t.major ? 2 : t.mid ? 0.9 : 0.5} />
          ))}
          {BATONS.map((b, i) => (
            <line key={i} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke="currentColor" strokeWidth="5" strokeLinecap="butt" />
          ))}
        </svg>
      </div>
    </div>
  );
}
