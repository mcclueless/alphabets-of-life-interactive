import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGlyphSet,
  rng,
  smoothstep,
  useCanvasScene,
  type LoadedGlyph,
} from "./_shared/scene";

/**
 * Chapter 3 — Breathing and Life.
 * Glyphs arranged in a quasi-grid all pulse together on a single shared
 * breath cycle. Inhale: 4.5 s up + opacity in. Exhale: 4.5 s down. No drift.
 * Press space to anchor to the user's own breath.
 */
const COUNT = 96;
const CYCLE = 9.0; // seconds
const INHALE = 0.5; // fraction of cycle spent inhaling

export default function BreathPulse() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);
  const tOffset = useRef(0);
  const lastSpace = useRef(0);

  useEffect(() => {
    loadGlyphSet("07-breathing-and-life", COUNT).then(setGlyphs);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        lastSpace.current = performance.now() / 1000;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grid = useMemo(() => {
    const r = rng(11);
    return Array.from({ length: COUNT }).map((_, i) => ({
      i,
      x: (i % 12) / 11,
      y: Math.floor(i / 12) / 7,
      jx: (r() - 0.5) * 0.06,
      jy: (r() - 0.5) * 0.06,
      phase: r() * 0.4,         // 0..0.4 — slight desync so it doesn't feel mechanical
      size: 36 + r() * 12,
    }));
  }, []);

  useCanvasScene(ref, ({ ctx, width, height, t }) => {
    ctx.clearRect(0, 0, width, height);
    const userPhase = lastSpace.current > 0
      ? ((t - (lastSpace.current - performance.timeOrigin / 1000)) % CYCLE) / CYCLE
      : null;

    const pad = 40;
    const W = width - pad * 2;
    const H = height - pad * 2;

    for (const cell of grid) {
      const phase = userPhase != null ? userPhase : ((t + cell.phase * CYCLE) % CYCLE) / CYCLE;
      // 0..INHALE → inhale (0→1), INHALE..1 → exhale (1→0.35)
      let scale: number;
      let alpha: number;
      if (phase < INHALE) {
        const u = phase / INHALE;
        scale = 0.25 + 0.85 * smoothstep(u);
        alpha = 0.2 + 0.75 * smoothstep(u);
      } else {
        const u = (phase - INHALE) / (1 - INHALE);
        scale = 1.10 - 0.75 * smoothstep(u);
        alpha = 0.95 - 0.7 * smoothstep(u);
      }
      const x = pad + (cell.x + cell.jx) * W;
      const y = pad + (cell.y + cell.jy) * H;
      const g = glyphs[cell.i];
      const s = cell.size * scale;
      ctx.globalAlpha = alpha;
      if (g) {
        ctx.drawImage(g.img, x - s / 2, y - s / 2, s, s);
      } else {
        ctx.fillStyle = "#1a1816";
        ctx.beginPath();
        ctx.arc(x, y, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Subtle breath indicator at the top — a single line that thickens during inhale
    const phase = (t % CYCLE) / CYCLE;
    const inhaleStrength =
      phase < INHALE ? smoothstep(phase / INHALE) : 1 - smoothstep((phase - INHALE) / (1 - INHALE));
    const lineW = 60 + inhaleStrength * 260;
    ctx.fillStyle = "rgba(177, 74, 50, 0.55)";
    ctx.fillRect(width / 2 - lineW / 2, 18, lineW, 2);
  });

  return (
    <div className="scene" aria-label="Breath-driven pulsing glyph field">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 3 · Breath</p>
      <p className="scene__caption">
        Inhale, exhale. The glyphs breathe on a 9-second cycle. Press space to reset to your own breath.
      </p>
    </div>
  );
}
