import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGlyphSet,
  rng,
  useCanvasScene,
  type LoadedGlyph,
} from "./_shared/scene";

/**
 * Chapter 7 — Eastwards.
 * Glyphs travel along smooth Bezier arcs from left to right, as if drifting
 * along trade routes from India eastward. Multiple paths run in parallel.
 */
interface CurvePath {
  startY: number;
  endY: number;
  c1: { x: number; y: number };
  c2: { x: number; y: number };
}

interface Traveler {
  glyphIdx: number;
  pathIdx: number;
  t: number;
  speed: number;
  jitter: number;
}

const PATHS = 6;
const TRAVELERS = 34;
const GLYPHS = 40;

export default function EastwardArcs() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);
  useEffect(() => { loadGlyphSet("11-eastwards", GLYPHS).then(setGlyphs); }, []);

  const paths = useMemo<CurvePath[]>(() => {
    const r = rng(31);
    return Array.from({ length: PATHS }).map((_, i) => ({
      startY: 0.18 + i * (0.66 / (PATHS - 1)),
      endY: 0.2 + r() * 0.6,
      c1: { x: 0.35, y: 0.2 + r() * 0.6 },
      c2: { x: 0.65, y: 0.2 + r() * 0.6 },
    }));
  }, []);

  const travelers = useMemo<Traveler[]>(() => {
    const r = rng(13);
    return Array.from({ length: TRAVELERS }).map((_, i) => ({
      glyphIdx: i % GLYPHS,
      pathIdx: i % PATHS,
      t: r(),
      speed: 0.06 + r() * 0.05,
      jitter: r() * Math.PI * 2,
    }));
  }, []);

  function bz(t: number, p: CurvePath) {
    const x0 = -0.05, y0 = p.startY, x1 = 1.05, y1 = p.endY;
    const u = 1 - t;
    const x = u*u*u*x0 + 3*u*u*t*p.c1.x + 3*u*t*t*p.c2.x + t*t*t*x1;
    const y = u*u*u*y0 + 3*u*u*t*p.c1.y + 3*u*t*t*p.c2.y + t*t*t*y1;
    return { x, y };
  }

  useCanvasScene(ref, ({ ctx, width, height, t, dt }) => {
    ctx.clearRect(0, 0, width, height);

    // Faded paths
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(181, 145, 91, 0.22)";
    ctx.setLineDash([4, 6]);
    for (const p of paths) {
      const s = bz(0, p);
      ctx.beginPath();
      ctx.moveTo(s.x * width, s.y * height);
      for (let i = 1; i <= 60; i++) {
        const pt = bz(i / 60, p);
        ctx.lineTo(pt.x * width, pt.y * height);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Advance travelers
    for (const tr of travelers) {
      tr.t += tr.speed * dt;
      if (tr.t > 1.1) tr.t -= 1.2;
    }

    // Draw glyphs
    for (const tr of travelers) {
      if (tr.t < -0.05 || tr.t > 1.05) continue;
      const p = paths[tr.pathIdx];
      const pt = bz(tr.t, p);
      const wobble = Math.sin(t * 1.3 + tr.jitter) * 8;
      const x = pt.x * width;
      const y = pt.y * height + wobble;
      const size = 30 + Math.sin(tr.t * Math.PI) * 22;
      const fade = Math.max(0, Math.min(1, 1 - Math.abs(0.5 - tr.t) * 1.6 + 0.25));
      const g = glyphs[tr.glyphIdx];
      ctx.globalAlpha = fade * 0.95;
      if (g) {
        ctx.drawImage(g.img, x - size / 2, y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;

    // Direction marker
    ctx.fillStyle = "rgba(177, 74, 50, 0.55)";
    ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("EAST →", width - 30, height - 30);
    ctx.textAlign = "start";
  });

  return (
    <div className="scene" aria-label="Glyphs travel eastward along curved arcs">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 7 · Eastwards</p>
      <p className="scene__caption">
        The Sanskrit model drifts east along trade-route arcs.
      </p>
    </div>
  );
}
