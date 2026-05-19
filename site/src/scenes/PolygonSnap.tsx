import { useEffect, useRef, useState } from "react";
import { loadGlyphSet, useCanvasScene, type LoadedGlyph } from "./_shared/scene";

/**
 * Chapter 11 — Shapes and Numbers.
 * Click a number 3–12 and the glyphs tween smoothly into that polygon
 * arrangement (vertices + edges). Distinct from every other scene by its
 * stepped, click-driven layout transitions.
 */
const COUNT = 36;
const NUMBERS = [3, 4, 5, 6, 7, 8, 9, 10, 12];

interface Item {
  glyphIdx: number;
  x: number; y: number;   // current — offsets from center, units = minDim/2
  tx: number; ty: number; // target
}

function polygonTargets(n: number, sides: number, radius = 0.85): { x: number; y: number }[] {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    verts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * sides;
    const segI = Math.floor(t) % sides;
    const segL = t - Math.floor(t);
    const a = verts[segI];
    const b = verts[(segI + 1) % sides];
    out.push({ x: a.x + (b.x - a.x) * segL, y: a.y + (b.y - a.y) * segL });
  }
  return out;
}

export default function PolygonSnap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);
  const [sides, setSides] = useState(6);
  const itemsRef = useRef<Item[]>([]);

  useEffect(() => { loadGlyphSet("15-shapes-and-numbers", COUNT).then(setGlyphs); }, []);

  // Update targets whenever sides changes (post-hydration only).
  useEffect(() => {
    if (itemsRef.current.length !== COUNT) return; // initialized lazily in draw
    const targets = polygonTargets(COUNT, sides);
    itemsRef.current.forEach((it, i) => {
      it.tx = targets[i].x;
      it.ty = targets[i].y;
    });
  }, [sides]);

  useCanvasScene(ref, ({ ctx, width, height, dt }) => {
    // Lazy init the items array on the first frame — keeps the component
    // pure during render/SSR so React's hydration doesn't see a mismatch.
    if (itemsRef.current.length === 0) {
      const targets = polygonTargets(COUNT, sides);
      itemsRef.current = targets.map((t, i) => ({
        glyphIdx: i, x: 0, y: 0, tx: t.x, ty: t.y,
      }));
    }
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const half = Math.min(width, height) / 2 - 60;

    // Polygon outline
    ctx.strokeStyle = "rgba(177, 74, 50, 0.32)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * half * 0.85;
      const y = cy + Math.sin(a) * half * 0.85;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Vertex markers
    ctx.fillStyle = "rgba(177, 74, 50, 0.55)";
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * half * 0.85;
      const y = cy + Math.sin(a) * half * 0.85;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tween glyphs toward targets (critically-damped spring approx)
    const k = Math.min(1, dt * 4.5);
    for (const it of itemsRef.current) {
      it.x += (it.tx - it.x) * k;
      it.y += (it.ty - it.y) * k;
      const px = cx + it.x * half;
      const py = cy + it.y * half;
      const g = glyphs[it.glyphIdx];
      const size = 36;
      ctx.globalAlpha = 0.88;
      if (g) {
        ctx.drawImage(g.img, px - size / 2, py - size / 2, size, size);
      } else {
        ctx.fillStyle = "#1a1816";
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  });

  return (
    <div className="scene" aria-label="Glyphs arranged in polygons by number">
      <canvas ref={ref} />
      <div className="poly__controls" role="group" aria-label="Polygon side count">
        {NUMBERS.map((n) => (
          <button key={n} className={n === sides ? "active" : ""} onClick={() => setSides(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="scene__title">Chapter 11 · Shapes</p>
      <p className="scene__caption">
        Click a number — {COUNT} glyphs tween onto the edges of a regular polygon with that many sides.
      </p>
      <style>{`
        .poly__controls {
          position: absolute; top: 1.4rem; left: 50%;
          transform: translateX(-50%);
          display: flex; gap: 0.45rem;
          z-index: 2;
        }
        .poly__controls button {
          appearance: none;
          border: 1px solid var(--color-rule);
          background: rgba(250, 247, 240, 0.85);
          backdrop-filter: blur(4px);
          cursor: pointer;
          font-family: var(--font-ui);
          font-size: 0.86rem;
          font-feature-settings: "tnum";
          padding: 0.4rem 0.75rem;
          min-width: 2.2rem;
          color: var(--color-ink);
          border-radius: 2px;
          transition: all 0.18s;
        }
        .poly__controls button:hover { background: var(--color-paper-soft); }
        .poly__controls button.active {
          background: var(--color-accent);
          color: var(--color-paper);
          border-color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
