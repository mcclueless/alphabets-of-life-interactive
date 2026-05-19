import { useEffect, useRef, type RefObject } from "react";

export interface ScenePointer {
  /** Normalized 0..1 within the canvas. */
  x: number;
  y: number;
  /** Per-frame normalized velocity. */
  vx: number;
  vy: number;
  /** Pixel coords within the canvas. */
  px: number;
  py: number;
  down: boolean;
  active: boolean;
}

export interface SceneCtx {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  /** CSS pixel width/height. */
  width: number;
  height: number;
  /** Seconds since mount. */
  t: number;
  /** Seconds since last frame (clamped to <0.1s to keep animations sane on tab-switch). */
  dt: number;
  pointer: ScenePointer;
}

/**
 * Mount a canvas-based scene. The draw callback runs every animation frame
 * with a fully-set-up 2D context (DPR-corrected) and pointer state.
 * Pass the canvas ref and your draw function.
 */
export function useCanvasScene(
  ref: RefObject<HTMLCanvasElement | null>,
  draw: (c: SceneCtx) => void,
) {
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const pointer: ScenePointer = {
      x: 0.5, y: 0.5, vx: 0, vy: 0, px: 0, py: 0, down: false, active: false,
    };
    let lastNx = 0.5, lastNy = 0.5;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      pointer.vx = nx - lastNx;
      pointer.vy = ny - lastNy;
      pointer.x = nx;
      pointer.y = ny;
      pointer.px = (e.clientX - r.left);
      pointer.py = (e.clientY - r.top);
      lastNx = nx; lastNy = ny;
      pointer.active = true;
    };
    const onDown = () => { pointer.down = true; };
    const onUp = () => { pointer.down = false; };
    const onLeave = () => { pointer.active = false; pointer.down = false; };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    const mountTime = performance.now();
    let last = mountTime;
    let raf = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      const t = (now - mountTime) / 1000;
      last = now;
      drawRef.current({
        ctx, canvas,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        t, dt, pointer,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [ref]);
}

/**
 * Load a per-chapter glyph list from /glyphs-{slug}.json and decode the
 * images. Returns an array of (HTMLImageElement, src) tuples for successfully
 * loaded images only.
 */
export interface LoadedGlyph {
  img: HTMLImageElement;
  src: string;
}

export async function loadGlyphSet(slug: string, max = 120): Promise<LoadedGlyph[]> {
  let paths: string[] = [];
  try {
    const r = await fetch(`/glyphs-${slug}.json`);
    if (!r.ok) return [];
    paths = await r.json();
  } catch {
    return [];
  }
  const picked = paths.slice(0, max);
  const loaded = await Promise.all(
    picked.map(
      (src) =>
        new Promise<LoadedGlyph | null>((res) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => res({ img, src });
          img.onerror = () => res(null);
          img.src = src;
        }),
    ),
  );
  return loaded.filter((x): x is LoadedGlyph => !!x);
}

/** Lerp a 1D value. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Smoothstep easing 0..1 → 0..1 (cubic Hermite). */
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
/** Hash-style cheap pseudo-random number from an integer seed. */
export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
