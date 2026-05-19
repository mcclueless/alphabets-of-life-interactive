import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGlyphSet,
  rng,
  useCanvasScene,
  type LoadedGlyph,
} from "./_shared/scene";

/**
 * Chapter 4 — Movements and Matrices.
 * Glyphs are particles drifting through a curl-noise vector field — like ink
 * moving on paper. The field rotates slowly so the matrix is never static.
 * Pointer adds a local twist that bends the field around it.
 */
const COUNT = 80;
const GLYPHS = 40;

interface Particle {
  glyphIdx: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
}

// Cheap pseudo-curl-noise: two sine layers crossed. Good enough for visual flow.
function flow(x: number, y: number, t: number): [number, number] {
  const fx = Math.sin(x * 3.1 + t * 0.18) * Math.cos(y * 2.3 - t * 0.12);
  const fy = Math.cos(x * 2.4 - t * 0.08) * Math.sin(y * 3.0 + t * 0.15);
  return [fx, fy];
}

export default function InkFlow() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);
  useEffect(() => { loadGlyphSet("08-movements-and-matrices", GLYPHS).then(setGlyphs); }, []);

  const particles = useMemo<Particle[]>(() => {
    const r = rng(53);
    return Array.from({ length: COUNT }).map((_, i) => ({
      glyphIdx: i % GLYPHS,
      x: r(),
      y: r(),
      vx: 0,
      vy: 0,
      size: 26 + r() * 22,
      rot: r() * Math.PI * 2,
    }));
  }, []);

  useCanvasScene(ref, ({ ctx, width, height, t, dt, pointer }) => {
    // Subtle trail fade — preserves a hint of motion path
    ctx.fillStyle = "rgba(247, 242, 230, 0.12)";
    ctx.fillRect(0, 0, width, height);

    for (const p of particles) {
      // Sample the flow field at the particle's position
      const [fx, fy] = flow(p.x * Math.PI * 2, p.y * Math.PI * 2, t);
      let ax = fx * 0.0008;
      let ay = fy * 0.0008;

      // Pointer twist: nearby particles get a tangential force
      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy + 0.005;
        if (d2 < 0.12) {
          const k = 0.0015 / d2;
          ax += -dy * k;
          ay +=  dx * k;
        }
      }

      p.vx += ax;
      p.vy += ay;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += (p.vx + p.vy) * 6;

      // Wrap
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
      if (p.y < -0.05) p.y = 1.05;
      if (p.y > 1.05) p.y = -0.05;

      const x = p.x * width;
      const y = p.y * height;
      const g = glyphs[p.glyphIdx];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot * 0.05);
      ctx.globalAlpha = 0.78;
      if (g) {
        ctx.drawImage(g.img, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = "#1a1816";
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });

  return (
    <div className="scene" aria-label="Glyphs flow through an ink-like vector field">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 4 · Movements</p>
      <p className="scene__caption">
        Glyphs drift through a curl-noise field of letter-strokes. Move your pointer to twist the matrix locally.
      </p>
    </div>
  );
}
