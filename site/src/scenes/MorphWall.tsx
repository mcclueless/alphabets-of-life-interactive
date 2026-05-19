import { useEffect, useRef, useState } from "react";
import { loadGlyphSet, type LoadedGlyph } from "./_shared/scene";

/**
 * Chapter 9 — Western Alphabets.
 * Timeline scrubber: drag horizontally to crossfade through 6 real alphabet
 * plates from this chapter, revealing the evolution of Western letterforms.
 * Distinct from every other scene: no canvas, no particles — a single image
 * stack with HTML drag interaction.
 */
const STAGES = 6;

export default function MorphWall() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stages, setStages] = useState<LoadedGlyph[]>([]);
  const [progress, setProgress] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    loadGlyphSet("13-western-alphabets", STAGES).then(setStages);
  }, []);

  function setFromClient(clientX: number) {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    setProgress(Math.max(0, Math.min(1, x)));
  }

  const stageF = stages.length > 1 ? progress * (stages.length - 1) : 0;
  const stageA = Math.floor(stageF);
  const stageB = Math.min(Math.max(0, stages.length - 1), stageA + 1);
  const blend = stageF - stageA;
  const stationCount = Math.max(stages.length, 2);

  return (
    <div
      ref={wrapRef}
      className="scene"
      aria-label="Timeline scrubber: evolution of Western alphabets"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setFromClient(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) setFromClient(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <div className="morph__plates">
        {stages.map((s, i) => {
          let alpha = 0;
          if (i === stageA) alpha = 1 - blend;
          if (i === stageB && stageB !== stageA) alpha = blend;
          return (
            <img
              key={i}
              src={s.src}
              alt={`Alphabet plate ${i + 1}`}
              style={{ opacity: alpha }}
            />
          );
        })}
      </div>

      <div className="morph__scrubber">
        <div className="morph__track" />
        {Array.from({ length: stationCount }).map((_, i) => (
          <span
            key={i}
            className="morph__station"
            style={{ left: `${(i / (stationCount - 1)) * 100}%` }}
          />
        ))}
        <div className="morph__thumb" style={{ left: `${progress * 100}%` }} />
      </div>

      <p className="scene__title">Chapter 9 · Western</p>
      <p className="scene__caption">
        Drag the timeline to scrub through {stages.length || STAGES} stages in the evolution of Western letterforms.
      </p>

      <style>{`
        .morph__plates {
          position: absolute;
          inset: 2rem;
          bottom: 9rem;
          display: grid;
          place-items: center;
        }
        .morph__plates img {
          position: absolute;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          background: rgba(255,255,255,0.4);
          padding: 4px;
          transition: opacity 80ms linear;
        }
        .morph__scrubber {
          position: absolute;
          inset: auto 2.5rem 4rem 2.5rem;
          height: 2.5rem;
        }
        .morph__track {
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: var(--color-rule);
          transform: translateY(-50%);
        }
        .morph__station {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 7px;
          height: 7px;
          background: var(--color-paper);
          border: 1px solid var(--color-rule);
          border-radius: 50%;
          pointer-events: none;
        }
        .morph__thumb {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 22px;
          height: 22px;
          background: var(--color-accent);
          border-radius: 50%;
          box-shadow: 0 6px 16px -4px rgba(0,0,0,0.35);
          pointer-events: none;
          transition: transform 60ms ease;
        }
      `}</style>
    </div>
  );
}
