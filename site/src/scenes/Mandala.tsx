import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvasScene, loadGlyphSet, type LoadedGlyph } from "./_shared/scene";

/**
 * Chapter 2 — Sanskrit Framework.
 * Concentric rings of glyphs that rotate at different speeds.
 * Pointer X offsets the rotation, creating a "tuning" gesture.
 */
const RING_COUNTS = [6, 12, 18, 24];
const TOTAL = RING_COUNTS.reduce((a, b) => a + b, 0);

export default function Mandala() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);

  useEffect(() => {
    loadGlyphSet("06-sanskrit-framework", TOTAL).then(setGlyphs);
  }, []);

  const layout = useMemo(() => {
    const items: { ringIdx: number; angleOffset: number; size: number }[] = [];
    for (let ri = 0; ri < RING_COUNTS.length; ri++) {
      const count = RING_COUNTS[ri];
      for (let i = 0; i < count; i++) {
        items.push({
          ringIdx: ri,
          angleOffset: (i / count) * Math.PI * 2,
          size: 44 - ri * 4,
        });
      }
    }
    return items;
  }, []);

  useCanvasScene(ref, ({ ctx, width, height, t, pointer }) => {
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const baseR = Math.min(width, height) * 0.11;

    // Soft center glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 2);
    grad.addColorStop(0, "rgba(181, 145, 91, 0.55)");
    grad.addColorStop(1, "rgba(181, 145, 91, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 2, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing accent dot at the bindu
    const pulse = baseR * 0.35 * (0.85 + 0.15 * Math.sin(t * 1.2));
    ctx.fillStyle = "#b14a32";
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fill();

    // Subtle dashed ring guides
    ctx.strokeStyle = "rgba(216, 209, 191, 0.5)";
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    for (let ri = 0; ri < RING_COUNTS.length; ri++) {
      const r = baseR * (1.7 + ri * 0.85);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const offset = pointer.active ? (pointer.x - 0.5) * 1.4 : 0;
    const speeds = [0.10, -0.07, 0.05, -0.04];

    // Glyphs on rings
    for (let i = 0; i < layout.length; i++) {
      const item = layout[i];
      const r = baseR * (1.7 + item.ringIdx * 0.85);
      const speed = speeds[item.ringIdx] + offset * 0.12;
      const angle = item.angleOffset + t * speed;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      const g = glyphs[i];
      if (g) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(g.img, -item.size / 2, -item.size / 2, item.size, item.size);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(26, 24, 22, 0.35)";
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  return (
    <div className="scene" aria-label="Sanskrit mandala of concentric glyph rings">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 2 · Sanskrit</p>
      <p className="scene__caption">
        Concentric rings rotate at distinct speeds. Move your pointer to deflect them.
      </p>
    </div>
  );
}
