import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGlyphSet,
  rng,
  useCanvasScene,
  type LoadedGlyph,
} from "./_shared/scene";

/**
 * Chapter 12 — Conclusions.
 * Glyphs gravitate toward a center, hold, then explode outward in a pulse.
 * Cyclic. The pointer (if active) pushes glyphs away — the reader can resist
 * the gathering.
 */
const COUNT = 90;
const CYCLE = 11; // s

interface Node {
  i: number;
  x: number; y: number;       // current
  bx: number; by: number;     // base resting (explode target)
  vx: number; vy: number;
  size: number;
}

export default function GravityPulse() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);

  useEffect(() => {
    loadGlyphSet("16-conclusions", COUNT).then(setGlyphs);
  }, []);

  const nodes = useMemo<Node[]>(() => {
    const r = rng(99);
    return Array.from({ length: COUNT }).map((_, i) => {
      // Random initial positions on a wide ring
      const angle = r() * Math.PI * 2;
      const dist = 0.3 + r() * 0.7;
      return {
        i,
        x: 0.5 + Math.cos(angle) * dist,
        y: 0.5 + Math.sin(angle) * dist,
        bx: 0.5 + Math.cos(angle) * dist,
        by: 0.5 + Math.sin(angle) * dist,
        vx: 0, vy: 0,
        size: 32 + r() * 24,
      };
    });
  }, []);

  useCanvasScene(ref, ({ ctx, width, height, t, dt, pointer }) => {
    ctx.clearRect(0, 0, width, height);

    // Cycle: 0..0.4 = gather; 0.4..0.5 = hold; 0.5..0.6 = explode; 0.6..1.0 = recover
    const phase = (t % CYCLE) / CYCLE;
    let centerPull: number;
    if (phase < 0.4) {
      centerPull = phase / 0.4;            // ramp up
    } else if (phase < 0.5) {
      centerPull = 1;                       // hold
    } else if (phase < 0.6) {
      centerPull = -2.0;                    // strong outward
    } else {
      centerPull = (phase - 0.6) / 0.4 - 0.6;  // -0.6 → 0.4 recover
    }

    for (const n of nodes) {
      const dx = 0.5 - n.x;
      const dy = 0.5 - n.y;
      const dist = Math.hypot(dx, dy) + 0.001;
      // Center force
      const f = centerPull * 0.6;
      n.vx += (dx / dist) * f * dt;
      n.vy += (dy / dist) * f * dt;
      // Spring back toward base (only when not in explode)
      if (centerPull >= 0) {
        n.vx += (n.bx - n.x) * 0.05 * dt;
        n.vy += (n.by - n.y) * 0.05 * dt;
      }
      // Pointer push
      if (pointer.active) {
        const pdx = n.x - pointer.x;
        const pdy = n.y - pointer.y;
        const pd2 = pdx * pdx + pdy * pdy + 0.001;
        const pf = 0.018 / pd2;
        n.vx += pdx * pf;
        n.vy += pdy * pf;
      }
      // Damp
      n.vx *= 0.92;
      n.vy *= 0.92;
      n.x += n.vx;
      n.y += n.vy;
    }

    // Render glyphs (closer to center first)
    const sorted = [...nodes].sort((a, b) => {
      const da = Math.hypot(a.x - 0.5, a.y - 0.5);
      const db = Math.hypot(b.x - 0.5, b.y - 0.5);
      return db - da;
    });
    const cx = width / 2;
    const cy = height / 2;
    for (const n of sorted) {
      const x = n.x * width;
      const y = n.y * height;
      const distFromCenter = Math.hypot(x - cx, y - cy) / Math.min(width, height);
      const alpha = 0.55 + (1 - Math.min(1, distFromCenter * 1.6)) * 0.4;
      const g = glyphs[n.i];
      ctx.globalAlpha = alpha;
      if (g) {
        ctx.drawImage(g.img, x - n.size / 2, y - n.size / 2, n.size, n.size);
      } else {
        ctx.fillStyle = "#1a1816";
        ctx.beginPath();
        ctx.arc(x, y, n.size * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Gravity well marker
    const wellR = 6 + Math.max(0, centerPull) * 14;
    ctx.fillStyle = "rgba(177, 74, 50, 0.45)";
    ctx.beginPath();
    ctx.arc(cx, cy, wellR, 0, Math.PI * 2);
    ctx.fill();
  });

  return (
    <div className="scene" aria-label="Glyphs converging and dispersing around a center">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 12 · Conclusions</p>
      <p className="scene__caption">
        The book&rsquo;s glyphs gather, hold, and disperse. Pointer pushes against the pull.
      </p>
    </div>
  );
}
