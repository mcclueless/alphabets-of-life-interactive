import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGlyphSet,
  rng,
  useCanvasScene,
  type LoadedGlyph,
} from "./_shared/scene";

/**
 * Chapter 8 — Westwards.
 * Glyphs drift right-to-left on a sinuous "river" — three undulating sine
 * waves at different frequencies. Eddies (slow rotational pockets) cause
 * occasional spinning. Visually distinct from Eastwards (which uses static
 * Bezier paths and a one-way flow).
 */
interface Drifter {
  glyphIdx: number;
  channel: 0 | 1 | 2;
  x: number;        // 0..1 (1 = right edge entry)
  yOffset: number;
  speed: number;
  spin: number;
  spinV: number;
}

const COUNT = 28;
const GLYPHS = 40;
const CHANNEL_FREQ = [1.6, 2.4, 1.0];
const CHANNEL_AMP = [0.06, 0.04, 0.08];
const CHANNEL_Y = [0.32, 0.58, 0.78];

export default function WestwardRiver() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glyphs, setGlyphs] = useState<LoadedGlyph[]>([]);
  useEffect(() => { loadGlyphSet("12-westwards", GLYPHS).then(setGlyphs); }, []);

  const drifters = useMemo<Drifter[]>(() => {
    const r = rng(91);
    return Array.from({ length: COUNT }).map((_, i) => ({
      glyphIdx: i % GLYPHS,
      channel: (i % 3) as 0 | 1 | 2,
      x: r() * 1.2,
      yOffset: (r() - 0.5) * 0.02,
      speed: 0.05 + r() * 0.05,
      spin: 0,
      spinV: (r() - 0.5) * 0.4,
    }));
  }, []);

  useCanvasScene(ref, ({ ctx, width, height, t, dt }) => {
    ctx.clearRect(0, 0, width, height);

    // Draw river — three soft sine wave lines under each channel
    for (let ch = 0; ch < 3; ch++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(181, 145, 91, ${ch === 1 ? 0.32 : 0.18})`;
      ctx.lineWidth = 1;
      const baseY = CHANNEL_Y[ch] * height;
      const amp = CHANNEL_AMP[ch] * height;
      const freq = CHANNEL_FREQ[ch];
      for (let xPix = 0; xPix <= width; xPix += 8) {
        const nx = xPix / width;
        const yWave = baseY + Math.sin(nx * Math.PI * 2 * freq + t * 0.6) * amp;
        if (xPix === 0) ctx.moveTo(xPix, yWave);
        else ctx.lineTo(xPix, yWave);
      }
      ctx.stroke();
    }

    // Advance drifters (right-to-left = decreasing x)
    for (const d of drifters) {
      d.x -= d.speed * dt;
      if (d.x < -0.1) { d.x = 1.1; d.spinV = (Math.random() - 0.5) * 0.5; }
      // Eddy near center: spin acceleration
      if (d.x > 0.4 && d.x < 0.6) {
        d.spinV += (Math.random() - 0.5) * 0.6 * dt;
      } else {
        d.spinV *= 0.96;
      }
      d.spin += d.spinV * dt;
    }

    // Draw glyphs on their sine-wave channel
    for (const d of drifters) {
      if (d.x < -0.05 || d.x > 1.05) continue;
      const baseY = CHANNEL_Y[d.channel] * height;
      const amp = CHANNEL_AMP[d.channel] * height;
      const freq = CHANNEL_FREQ[d.channel];
      const y = baseY + Math.sin(d.x * Math.PI * 2 * freq + t * 0.6) * amp + d.yOffset * height;
      const x = d.x * width;
      const size = 38;
      const fade = d.x < 0 ? Math.max(0, 1 + d.x * 5) : (d.x > 1 ? Math.max(0, 1 - (d.x - 1) * 5) : 1);
      const g = glyphs[d.glyphIdx];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.spin);
      ctx.globalAlpha = fade * 0.9;
      if (g) ctx.drawImage(g.img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Direction marker
    ctx.fillStyle = "rgba(177, 74, 50, 0.55)";
    ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("← WEST", 30, height - 30);
  });

  return (
    <div className="scene" aria-label="Glyphs drift westward along a river">
      <canvas ref={ref} />
      <p className="scene__title">Chapter 8 · Westwards</p>
      <p className="scene__caption">
        The model flows westward on three currents. Eddies catch glyphs near the middle.
      </p>
    </div>
  );
}
