import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGlyphSet,
  rng,
  useCanvasScene,
  type LoadedGlyph,
} from "./_shared/scene";

/**
 * Chapter 6 — Earthly Reflections.
 * Glyphs sit on a horizon line at varying depths. The pointer X coordinate
 * scrolls the view horizontally; foreground glyphs scroll faster (parallax).
 * The effect: walking along an alphabet landscape.
 */
const COUNT = 70;

export default function HorizonWalk() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);
  const cam = useRef({ x: 0, target: 0 });

  useEffect(() => {
    loadGlyphSet("10-earthly-reflections", COUNT).then(setGlyphs);
  }, []);

  // World layout: random x in [0, 3], depth in [0,1] (0 = far, 1 = near)
  const world = useMemo(() => {
    const r = rng(23);
    return Array.from({ length: COUNT }).map((_, i) => ({
      i,
      x: r() * 3.0,           // 3 viewport-widths of world to walk through
      depth: 0.15 + r() * 0.85,
      yJitter: (r() - 0.5) * 0.08,
      sizeJitter: 0.85 + r() * 0.3,
    }));
  }, []);

  useCanvasScene(ref, ({ ctx, width, height, dt, pointer }) => {
    ctx.clearRect(0, 0, width, height);

    // Camera follows pointer X: full range = pan from x=0 to x=2 (world is 3 wide,
    // 1 of which is always visible).
    if (pointer.active) {
      cam.current.target = pointer.x * 2.0;
    }
    // Spring toward target for buttery motion
    cam.current.x += (cam.current.target - cam.current.x) * Math.min(1, dt * 4);

    // Background — distant haze
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "rgba(247, 242, 230, 0)");
    sky.addColorStop(1, "rgba(181, 145, 91, 0.18)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Horizon line
    const horizon = height * 0.78;
    ctx.strokeStyle = "rgba(177, 74, 50, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();

    // Sort by depth so near glyphs render on top
    const sorted = [...world].sort((a, b) => a.depth - b.depth);

    for (const w of sorted) {
      // Parallax: near glyphs (depth=1) move with full camera, far glyphs (depth=0.15) barely move
      const screenX = (w.x - cam.current.x * w.depth) * width;
      // Wrap into visible range
      const wrappedX = ((screenX % width) + width) % width;
      const size = (28 + w.depth * 64) * w.sizeJitter;
      const y = horizon - size * 0.45 + w.yJitter * 60 - (1 - w.depth) * 30;
      const g = glyphs[w.i];
      ctx.globalAlpha = 0.4 + w.depth * 0.55;
      if (g) {
        ctx.drawImage(g.img, wrappedX - size / 2, y - size / 2, size, size);
      } else {
        ctx.fillStyle = "#1a1816";
        ctx.fillRect(wrappedX - 2, y - size * 0.2, 4, size * 0.4);
      }
    }
    ctx.globalAlpha = 1;
  });

  return (
    <div className="scene" aria-label="Horizon walk through alphabet glyphs">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 6 · Earthly</p>
      <p className="scene__caption">
        Move your pointer left and right to walk along the horizon.
      </p>
    </div>
  );
}
