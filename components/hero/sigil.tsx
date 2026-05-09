"use client";

import { motion } from "framer-motion";

/**
 * Sigil — two rings on slow Lissajous orbits intersect at the center, where
 * a third "pact mark" emerges and breathes. Pure SVG, no canvas. Reads as a
 * legal seal / signet rather than a forensic terminal.
 */
export function Sigil() {
  const ease = [0.32, 0.72, 0, 1] as const;

  return (
    <div className="relative aspect-square w-full max-w-[560px]">
      {/* Soft halo behind */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(closest-side at 50% 50%, rgba(231, 197, 154, 0.10), rgba(231, 197, 154, 0) 60%)",
        }}
      />
      {/* Subtle outer ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-6 rounded-full border border-polar-white/[0.05]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-16 rounded-full border border-polar-white/[0.04]"
      />

      <svg
        viewBox="0 0 560 560"
        role="img"
        aria-label="Pacta sigil — two parties forming a pact"
        className="block h-full w-full"
      >
        <defs>
          <radialGradient id="pact-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E7C59A" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#E7C59A" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#E7C59A" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="pact-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F3F3F3" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F3F3F3" stopOpacity="0.25" />
          </linearGradient>

          <linearGradient id="aria-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E7C59A" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#E7C59A" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* Center halo */}
        <circle cx="280" cy="280" r="240" fill="url(#pact-glow)" />

        {/* Concentric guide rings */}
        <circle
          cx="280"
          cy="280"
          r="220"
          fill="none"
          stroke="rgba(243,243,243,0.04)"
          strokeWidth="0.75"
          strokeDasharray="2 6"
        />

        {/* Aria ring (warm) */}
        <motion.circle
          cx="280"
          cy="280"
          r="150"
          fill="none"
          stroke="url(#aria-stroke)"
          strokeWidth="1.4"
          initial={{ x: -54 }}
          animate={{ x: [-54, -36, -54] }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease,
          }}
        />

        {/* Atlas ring (polar) */}
        <motion.circle
          cx="280"
          cy="280"
          r="150"
          fill="none"
          stroke="url(#pact-stroke)"
          strokeWidth="1.4"
          initial={{ x: 54 }}
          animate={{ x: [54, 36, 54] }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease,
          }}
        />

        {/* Latin etched along the inner border */}
        <defs>
          <path
            id="pact-text-path"
            d="M 280 80 a 200 200 0 1 1 -0.001 0 z"
          />
        </defs>
        <text
          fill="rgba(195,195,195,0.45)"
          style={{ fontFamily: "var(--font-input)", fontSize: 9, letterSpacing: 5 }}
        >
          <textPath href="#pact-text-path" startOffset="0">
            PACTA · SUNT · SERVANDA · — · TWO · PARTIES · ONE · WORD ·
          </textPath>
        </text>

        {/* The Pact mark — emerges in the intersection */}
        <motion.g
          initial={{ scale: 0.92, opacity: 0.9 }}
          animate={{ scale: [0.92, 1.06, 0.92], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 4.5, repeat: Infinity, ease }}
          style={{ transformOrigin: "280px 280px" }}
        >
          <circle cx="280" cy="280" r="42" fill="rgba(231, 197, 154, 0.06)" />
          <circle
            cx="280"
            cy="280"
            r="22"
            fill="none"
            stroke="#E7C59A"
            strokeWidth="1.4"
          />
          <circle cx="280" cy="280" r="6" fill="#E7C59A" />
        </motion.g>

        {/* Sealed micro-ticks at cardinal points */}
        {[0, 90, 180, 270].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 280 280)`}>
            <line
              x1="280"
              y1="48"
              x2="280"
              y2="62"
              stroke="rgba(195, 195, 195, 0.45)"
              strokeWidth="1"
            />
          </g>
        ))}

        {/* Drifting particles */}
        {[
          { cx: 380, cy: 160, r: 1.2, delay: 0 },
          { cx: 200, cy: 130, r: 1, delay: 1.4 },
          { cx: 150, cy: 380, r: 1.5, delay: 0.8 },
          { cx: 410, cy: 410, r: 1, delay: 2.2 },
          { cx: 330, cy: 470, r: 1.2, delay: 3 },
        ].map((p, i) => (
          <motion.circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill="#F3F3F3"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 0.7, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, delay: p.delay, ease }}
          />
        ))}
      </svg>

      <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-3 text-[12px] italic text-ash-gray/55">
        <span className="h-px w-6 bg-ash-gray/30" />
        <span>signum pacti</span>
        <span className="h-px w-6 bg-ash-gray/30" />
      </div>
    </div>
  );
}
