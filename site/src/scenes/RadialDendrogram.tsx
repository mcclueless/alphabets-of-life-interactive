import { useMemo, useState } from "react";

/**
 * Chapter 10 — Classes of Alphabets.
 * Hard-coded taxonomy of writing systems rendered as a radial dendrogram.
 * Hover a category to highlight its branches. No glyph imagery — pure SVG.
 */

interface Cat {
  name: string;
  desc: string;
  leaves: string[];
}

const CATEGORIES: Cat[] = [
  { name: "Abjads",        desc: "Consonant-only", leaves: ["Phoenician", "Hebrew", "Arabic", "Aramaic"] },
  { name: "Abugidas",      desc: "Consonant + inherent vowel", leaves: ["Sanskrit", "Tibetan", "Thai", "Ethiopic", "Khmer"] },
  { name: "Alphabets",     desc: "Letters with vowels", leaves: ["Greek", "Latin", "Cyrillic", "Glagolitic", "Runic", "Coptic"] },
  { name: "Syllabaries",   desc: "One symbol per syllable", leaves: ["Japanese Kana", "Cherokee", "Cypriot"] },
  { name: "Logographic",   desc: "One symbol per concept", leaves: ["Chinese", "Egyptian Hieroglyphs", "Mayan"] },
];

export default function RadialDendrogram() {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const cats = CATEGORIES;
    const totalLeaves = cats.reduce((a, c) => a + c.leaves.length, 0);
    // Allocate angular slice per category proportional to leaf count
    let cursor = -Math.PI / 2;
    const out: {
      cat: Cat;
      catX: number; catY: number;
      slice: { start: number; end: number };
      leaves: { name: string; x: number; y: number; angle: number }[];
    }[] = [];
    for (const cat of cats) {
      const slice = (cat.leaves.length / totalLeaves) * Math.PI * 2;
      const slStart = cursor;
      const slEnd = cursor + slice;
      const catAngle = (slStart + slEnd) / 2;
      const catX = Math.cos(catAngle) * 0.34;
      const catY = Math.sin(catAngle) * 0.34;
      const leaves = cat.leaves.map((name, j) => {
        const t = cat.leaves.length === 1 ? 0.5 : j / (cat.leaves.length - 1);
        const angle = slStart + 0.08 + t * (slice - 0.16);
        return { name, x: Math.cos(angle) * 0.78, y: Math.sin(angle) * 0.78, angle };
      });
      out.push({ cat, catX, catY, slice: { start: slStart, end: slEnd }, leaves });
      cursor = slEnd;
    }
    return out;
  }, []);

  return (
    <div className="scene" aria-label="Radial taxonomy of writing systems">
      <svg className="full" viewBox="-1.05 -1.05 2.1 2.1" preserveAspectRatio="xMidYMid meet">
        {/* lines */}
        {layout.map((row) => {
          const highlighted = hover === row.cat.name;
          return (
            <g key={row.cat.name}>
              {/* root → cat */}
              <line
                x1={0} y1={0} x2={row.catX} y2={row.catY}
                stroke={highlighted ? "#b14a32" : "#cfc8b8"}
                strokeWidth={highlighted ? 0.006 : 0.003}
              />
              {/* cat → leaves */}
              {row.leaves.map((leaf) => (
                <line
                  key={leaf.name}
                  x1={row.catX} y1={row.catY} x2={leaf.x} y2={leaf.y}
                  stroke={highlighted ? "#b14a32" : "#cfc8b8"}
                  strokeWidth={highlighted ? 0.005 : 0.0025}
                />
              ))}
            </g>
          );
        })}

        {/* root node */}
        <circle cx={0} cy={0} r={0.06} fill="#b14a32" />
        <text x={0} y={0.005} textAnchor="middle" dominantBaseline="middle"
              fontSize={0.045} fontWeight={600} fill="#faf7f0"
              style={{ fontFamily: "ui-sans-serif, system-ui" }}>
          ALL
        </text>

        {/* category nodes */}
        {layout.map((row) => {
          const highlighted = hover === row.cat.name;
          return (
            <g
              key={"cat-" + row.cat.name}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(row.cat.name)}
              onMouseLeave={() => setHover(null)}
            >
              <circle cx={row.catX} cy={row.catY} r={highlighted ? 0.07 : 0.055}
                      fill={highlighted ? "#b14a32" : "#1a1816"} />
              <text
                x={row.catX * 1.18} y={row.catY * 1.18}
                textAnchor={row.catX > 0.05 ? "start" : row.catX < -0.05 ? "end" : "middle"}
                dominantBaseline="middle"
                fontSize={0.05} fontWeight={600}
                fill={highlighted ? "#b14a32" : "#1a1816"}
                style={{ fontFamily: "Fraunces, Spectral, serif" }}
              >
                {row.cat.name}
              </text>
            </g>
          );
        })}

        {/* leaf nodes */}
        {layout.map((row) => {
          const highlighted = hover === row.cat.name;
          return row.leaves.map((leaf) => (
            <g key={"l-" + leaf.name}>
              <circle cx={leaf.x} cy={leaf.y} r={0.018}
                      fill={highlighted ? "#b14a32" : "#6e6963"} />
              <text
                x={leaf.x * 1.06} y={leaf.y * 1.06}
                textAnchor={leaf.x > 0.05 ? "start" : leaf.x < -0.05 ? "end" : "middle"}
                dominantBaseline="middle"
                fontSize={0.035}
                fill={highlighted ? "#1a1816" : "#3b3631"}
                opacity={hover && !highlighted ? 0.35 : 1}
                style={{ fontFamily: "Spectral, serif" }}
              >
                {leaf.name}
              </text>
            </g>
          ));
        })}
      </svg>
      <p className="scene__title">Chapter 10 · Classes</p>
      <p className="scene__caption">
        Five classes of writing systems. {hover ? <strong>{hover}</strong> : "Hover a class"} to light its descendants.
      </p>
    </div>
  );
}
