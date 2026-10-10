/**
 * Decorative backdrop for the landing hero: a fine engraved guilloche lattice, a slowly counter-turning
 * rosette and a large watch dial. Pure inline SVG on the theme tokens (gold lines at low opacity on the navy
 * or silver field), no image. The turning is CSS (`.landing-dial-turn`, `.landing-rosette-turn` in
 * globals.css) and is switched off under prefers-reduced-motion. Entirely aria-hidden.
 */

const CX = 500;

/** Rising motes: fixed positions, sizes and timings (no randomness, so server and client markup agree). */
const MOTES = [
  { left: "8%", size: 3, duration: "26s", delay: "0s" },
  { left: "17%", size: 2, duration: "32s", delay: "-9s" },
  { left: "29%", size: 4, duration: "29s", delay: "-4s" },
  { left: "41%", size: 2, duration: "35s", delay: "-17s" },
  { left: "53%", size: 3, duration: "27s", delay: "-12s" },
  { left: "64%", size: 2, duration: "31s", delay: "-21s" },
  { left: "76%", size: 4, duration: "28s", delay: "-7s" },
  { left: "88%", size: 3, duration: "34s", delay: "-15s" },
];

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
      {/* Slow gold light: two blurred washes that drift across the field. */}
      <div className="landing-aurora landing-aurora-a absolute -start-1/4 -top-1/4 h-[70%] w-[70%] rounded-full" />
      <div className="landing-aurora landing-aurora-b absolute -end-1/4 bottom-[-20%] h-[65%] w-[65%] rounded-full" />

      {/* Guilloche lattice: interlocking circles, faded out toward the edges. */}
      <svg className="landing-lattice-breathe absolute inset-0 size-full text-primary opacity-[0.12]" focusable="false">
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

      {/* A light sheen that sweeps the lattice now and then, like light moving over engraved metal. */}
      <div className="landing-sheen absolute inset-0" />

      {/* Gold dust: a few tiny motes rising slowly. */}
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="landing-mote absolute rounded-full bg-primary"
          style={{ left: m.left, bottom: "-4%", width: m.size, height: m.size, animationDuration: m.duration, animationDelay: m.delay }}
        />
      ))}

      {/* Dial and rosette, centred behind the whole hero (symmetric, so it reads the same in RTL). */}
      <div className="absolute left-1/2 top-1/2 aspect-square w-[170vw] max-w-[1500px] -translate-x-1/2 -translate-y-1/2 sm:w-[120vw]">
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
        {/* Sweeping seconds hand: one full turn a minute in 60 small steps, like a quartz movement. */}
        <svg viewBox="0 0 1000 1000" className="landing-seconds absolute inset-0 size-full text-primary opacity-[0.45]" focusable="false">
          <line x1={CX} y1={CX + 70} x2={CX} y2="48" stroke="currentColor" strokeWidth="1.4" />
          <circle cx={CX} cy={CX} r="9" fill="currentColor" />
          <circle cx={CX} cy={CX} r="3" fill="var(--background)" />
          <circle cx={CX} cy={CX - 360} r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </div>
    </div>
  );
}
