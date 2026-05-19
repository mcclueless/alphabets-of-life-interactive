import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGlyphSet,
  rng,
  useCanvasScene,
  type LoadedGlyph,
} from "./_shared/scene";

/**
 * Chapter 5 — Heavenly Models.
 * Glyphs become stars in a 2D constellation graph. Each star is connected to
 * its three nearest neighbors with a faint line. Background dots twinkle. Hover
 * a star and its constellation lights up.
 */
const COUNT = 80;
const K = 3;

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
}

export default function Constellation() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);
  useEffect(() => { loadGlyphSet("09-heavenly-models", COUNT).then(setGlyphs); }, []);

  const stars = useMemo<Star[]>(() => {
    const r = rng(67);
    return Array.from({ length: COUNT }).map(() => ({
      x: r() * 0.92 + 0.04,
      y: r() * 0.88 + 0.06,
      size: 28 + r() * 30,
      twinkle: r() * Math.PI * 2,
    }));
  }, []);

  const neighbors = useMemo<number[][]>(() =>
    stars.map((s, i) => {
      const dists = stars.map((o, j) => ({ j, d: Math.hypot(s.x - o.x, s.y - o.y) }))
        .filter((x) => x.j !== i)
        .sort((a, b) => a.d - b.d);
      return dists.slice(0, K).map((d) => d.j);
    }),
  [stars]);

  const bgDots = useMemo(() => {
    const r = rng(42);
    return Array.from({ length: 80 }).map(() => ({
      x: r(), y: r(), r: 0.4 + r() * 0.9, phase: r() * Math.PI * 2,
    }));
  }, []);

  useCanvasScene(ref, ({ ctx, width, height, t, pointer }) => {
    ctx.clearRect(0, 0, width, height);

    // Background twinkles
    for (let i = 0; i < bgDots.length; i++) {
      const d = bgDots[i];
      const a = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.4 + d.phase));
      ctx.fillStyle = `rgba(181, 145, 91, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x * width, d.y * height, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Find hovered star (within radius)
    let hovered = -1;
    if (pointer.active) {
      let bestD = 0.08; // normalized distance threshold
      for (let i = 0; i < stars.length; i++) {
        const d = Math.hypot(stars[i].x - pointer.x, stars[i].y - pointer.y);
        if (d < bestD) { bestD = d; hovered = i; }
      }
    }
    const hoveredSet = new Set<number>();
    if (hovered >= 0) {
      hoveredSet.add(hovered);
      for (const n of neighbors[hovered]) hoveredSet.add(n);
    }

    // Constellation lines (paint once for the default, once for highlights)
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(181, 145, 91, 0.16)";
    for (let i = 0; i < stars.length; i++) {
      for (const j of neighbors[i]) {
        if (hoveredSet.size && (hoveredSet.has(i) && hoveredSet.has(j))) continue;
        ctx.beginPath();
        ctx.moveTo(stars[i].x * width, stars[i].y * height);
        ctx.lineTo(stars[j].x * width, stars[j].y * height);
        ctx.stroke();
      }
    }
    if (hoveredSet.size) {
      ctx.strokeStyle = "rgba(177, 74, 50, 0.7)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < stars.length; i++) {
        for (const j of neighbors[i]) {
          if (hoveredSet.has(i) && hoveredSet.has(j)) {
            ctx.beginPath();
            ctx.moveTo(stars[i].x * width, stars[i].y * height);
            ctx.lineTo(stars[j].x * width, stars[j].y * height);
            ctx.stroke();
          }
        }
      }
    }

    // Glyph nodes
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.85 + 0.15 * Math.sin(t * 1.6 + s.twinkle);
      const isH = hoveredSet.has(i);
      const size = s.size * (isH ? 1.5 : tw);
      const x = s.x * width;
      const y = s.y * height;
      const g = glyphs[i];
      ctx.globalAlpha = isH ? 1 : 0.78;
      if (g) {
        ctx.drawImage(g.img, x - size / 2, y - size / 2, size, size);
      } else {
        ctx.fillStyle = "#1a1816";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  });

  return (
    <div className="scene" aria-label="Constellation of alphabet glyphs">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 5 · Heavenly</p>
      <p className="scene__caption">
        Glyphs as stars, joined by nearest-neighbor links. Hover one to light its constellation.
      </p>
    </div>
  );
}
