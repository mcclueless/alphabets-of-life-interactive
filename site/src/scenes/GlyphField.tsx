import { useEffect, useRef, useState } from "react";

/**
 * Glyph Field — proof-of-concept set piece for "Marks, Signs, Symbols."
 * Renders a field of ~120 randomly-sampled glyph images from the book as a
 * canvas of soft, drifting nodes. Pointer attracts; hover focuses.
 *
 * This is the wow opener that sits above the chapter body — it demonstrates
 * the visual material the chapter is about before a single word is read.
 */
const GLYPH_COUNT = 120;

// Curated set of source filenames known to be glyph-shaped (figure indices < 200, jpg/png).
// We deliberately don't hand-pick — we use a hash to deterministically sample from a range.
function buildGlyphs(): string[] {
  // The first 200 figures in the doc sit in Preface→Marks/Signs/Symbols and are mostly
  // alphabet glyphs, marks, and symbols. We sample by figure index from /figures.json
  // at runtime (fetched once), or fall back to a known-good range.
  return Array.from({ length: GLYPH_COUNT }).map(
    (_, i) => `/images/_glyphs/glyph-${i.toString().padStart(3, "0")}.webp`,
  );
}

interface Node {
  src: string;
  img: HTMLImageElement | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  alpha: number;
  loaded: boolean;
}

export default function GlyphField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });
  const nodesRef = useRef<Node[]>([]);
  const rafRef = useRef<number>(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Try to fetch a curated glyph list from /glyphs.json; otherwise enumerate
    // the first N images of the chapter directly.
    fetch("/glyphs.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() => null)
      .then((list: string[] | null) => {
        if (cancelled) return;
        const candidates =
          list && list.length
            ? list
            : Array.from({ length: 300 }, (_, i) =>
                `/images/ch05-fig-${String(i + 30).padStart(4, "0")}-image${i + 30}.jpg`,
              );
        const picked = candidates.slice(0, GLYPH_COUNT);
        nodesRef.current = picked.map((src) => ({
          src,
          img: null,
          x: Math.random(),
          y: Math.random(),
          vx: (Math.random() - 0.5) * 0.00015,
          vy: (Math.random() - 0.5) * 0.00015,
          size: 36 + Math.random() * 36,
          rot: (Math.random() - 0.5) * 0.4,
          alpha: 0,
          loaded: false,
        }));
        // preload images
        nodesRef.current.forEach((n) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            n.img = img;
            n.loaded = true;
          };
          img.onerror = () => {
            n.loaded = false;
          };
          img.src = n.src;
        });
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function onPointer(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current.x = (e.clientX - rect.left) / rect.width;
      pointerRef.current.y = (e.clientY - rect.top) / rect.height;
      pointerRef.current.active = true;
    }
    function onLeave() {
      pointerRef.current.active = false;
    }
    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerleave", onLeave);

    function tick() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const p = pointerRef.current;
      let nearest: Node | null = null;
      let nearestDist = Infinity;
      for (const n of nodesRef.current) {
        // gentle drift
        n.x += n.vx;
        n.y += n.vy;
        // soft attraction toward pointer
        if (p.active) {
          const dx = p.x - n.x;
          const dy = p.y - n.y;
          const d2 = dx * dx + dy * dy + 0.001;
          const f = 0.0005 / d2;
          n.vx += dx * f;
          n.vy += dy * f;
        }
        // damp
        n.vx *= 0.985;
        n.vy *= 0.985;
        // wrap edges
        if (n.x < -0.05) n.x = 1.05;
        if (n.x > 1.05) n.x = -0.05;
        if (n.y < -0.05) n.y = 1.05;
        if (n.y > 1.05) n.y = -0.05;

        n.alpha = Math.min(1, n.alpha + 0.01);
        const px = n.x * w;
        const py = n.y * h;
        const sz = n.size;

        // distance to pointer for focus
        const pdx = (p.x - n.x) * w;
        const pdy = (p.y - n.y) * h;
        const pd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (p.active && pd < nearestDist) {
          nearestDist = pd;
          nearest = n;
        }
        const focusBoost = p.active ? Math.max(0, 1 - pd / 90) : 0;
        const scale = 1 + focusBoost * 0.6;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(n.rot + focusBoost * 0.1);
        ctx.scale(scale, scale);
        ctx.globalAlpha = n.alpha * (0.55 + focusBoost * 0.4);
        if (n.loaded && n.img) {
          ctx.drawImage(n.img, -sz / 2, -sz / 2, sz, sz);
        } else {
          // fallback: a soft mark
          ctx.fillStyle = "#1a1816";
          ctx.beginPath();
          ctx.arc(0, 0, sz * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // update hovered label
      if (nearest && nearestDist < 70) {
        if (hovered !== nearest.src) setHovered(nearest.src);
      } else if (hovered !== null) {
        setHovered(null);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [ready, hovered]);

  return (
    <div ref={containerRef} className="glyph-field" aria-label="Field of glyphs from the book">
      <canvas ref={canvasRef} />
      <div className="glyph-field__overlay">
        <p className="glyph-field__caption">
          A field of <strong>{GLYPH_COUNT}</strong> glyphs drawn from this chapter.
          Move your pointer to gather them.
        </p>
      </div>
      <style>{`
        .glyph-field {
          position: relative;
          height: clamp(420px, 80vh, 720px);
          margin: 1rem auto 4rem;
          max-width: min(100%, 90rem);
          background:
            radial-gradient(ellipse at 30% 20%, rgba(181, 145, 91, 0.10), transparent 60%),
            radial-gradient(ellipse at 70% 80%, rgba(177, 74, 50, 0.08), transparent 70%),
            #f7f2e6;
          border: 1px solid var(--color-rule);
          overflow: hidden;
        }
        .glyph-field canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .glyph-field__overlay {
          position: absolute;
          inset: auto 0 0 0;
          padding: 1.25rem 2rem;
          pointer-events: none;
          text-align: center;
        }
        .glyph-field__caption {
          font-family: var(--font-ui);
          font-size: 0.86rem;
          letter-spacing: 0.02em;
          color: var(--color-ink-faint);
          margin: 0;
        }
      `}</style>
    </div>
  );
}
