# CLAUDE.md — Alphabets of Life: Interactive Edition

## What we're building

An interactive, scrollytelling web experience adapted from Kim H. Veltman's *Alphabets of Life* (General Edition, Twinscorp Smolensk 2014). **Not a digital book.** A reading-grade narrative experience in the lineage of Pudding / NYT Interactive / Stripe Press: type-led, motion-as-explanation, with 3–5 bespoke interactive set-pieces anchoring the chapter list.

## Source material

- `./Alphabets of Life General Edition.docx` — 83.9 MB. The canonical source.
  - ~175 pages, 962K chars, 7,775 paragraphs
  - 1,626 unique images (817 jpeg, 422 gif, 364 png, 18 emf, 5 wmf)
  - 2,039 inline drawings (~25% reuse)
  - 31 tables — *all rendered as graphics per user decision*
  - 1,101 endnotes (Word `endnotes.xml`, not footnotes)
  - 1,010 hyperlinks
  - 5 `Heading1` styles only — chapter boundaries must be derived from the TOC, not paragraph styles.
- `./ALPHABETS/`, `./ALPHABETS-2/` — source-folder backups received from the user. **Mostly zero-byte stubs from a failed cloud sync — do not trust by filename.** Only the root-level docx is canonical. The valid PDF in `ALPHABETS/` is a usable reference.

## Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Shell / build | **Astro 5** | Islands architecture; MDX; built-in responsive image pipeline; ships ~0 JS on text routes |
| Interactive islands | **React 19** | Concurrent rendering for heavy scenes; broadest ecosystem |
| Scroll choreography | **GSAP + ScrollTrigger** | Industry standard; Apple/Stripe/Pudding all use it |
| Smooth scroll | **Lenis** | Buttery base layer for ScrollTrigger |
| 3D scenes | **Three.js + React Three Fiber + drei** | Declarative WebGL; saves weeks on cosmology/globe scenes |
| UI motion | **Framer Motion** | Component-level transitions, gesture |
| Audio | **Howler.js** | Opt-in only; breath loops, glyph pronunciation, ambient score |
| Styling | **Tailwind 4** + custom CSS for typography | Tokens + design system |
| Type | Variable fonts (body serif TBD; Recursive for UI; Slavic/Sanskrit/Greek subsets) | The book is *about* letterforms — type is content |
| Search | **Pagefind** | Static full-text index, no backend |
| Hosting | **AWS Amplify Hosting** | Static + CloudFront CDN; branch previews |
| Component design | **`frontend-design` plugin / skill** | Pushes past generic AI aesthetics on every screen |

## Repository layout

```
aol/
├── Alphabets of Life General Edition.docx   # canonical source — DO NOT commit
├── ALPHABETS/, ALPHABETS-2/                  # source backups — DO NOT commit
├── tools/
│   └── extract/                              # Python pipeline (idempotent)
│       ├── run_all.py
│       ├── extract_text.py
│       ├── extract_images.py
│       ├── render_tables.py
│       ├── caption_index.py
│       ├── to_mdx.py
│       └── requirements.txt
├── site/                                     # Astro project (committed)
│   ├── astro.config.mjs
│   ├── src/
│   │   ├── content/chapters/                 # MDX chapter files (extraction output)
│   │   ├── components/                       # Astro + React islands
│   │   ├── scenes/                           # heavy R3F islands, one per set-piece
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── styles/
│   ├── public/
│   │   ├── images/                           # optimized image variants
│   │   ├── tables/                           # rasterized tables (png + svg)
│   │   ├── audio/                            # opt-in audio assets
│   │   └── fonts/
│   └── package.json
├── amplify.yml                               # Amplify build config
├── .gitignore                                # excludes source docx, ALPHABETS/, node_modules, dist, .venv
└── CLAUDE.md
```

## Image filename convention

`ch{NN}-fig-{NNNN}-{slug-of-caption}.{ext}`

Caption is inferred in this priority order:

1. `<wp:docPr descr="…">` alt-text on the drawing element
2. Nearest preceding paragraph matching `/^(Fig\.?|Figure|Plate|Image|Illustration)\s*\d+/i`
3. Immediate following italic / `cb` / small-style paragraph (typical caption style in this doc)
4. Nearest paragraph within 80 chars containing a glyph reference (e.g., "letter Uk", "Cyrillic Az")
5. Fallback: `untitled` + first 8 chars of image-bytes BLAKE2b hash

Reused images keep their first-derived filename. `figures.json` is the authoritative cross-reference: `{ filename → [{ chapter, paragraphIdx, captionSource }] }`.

## Set-piece chapters (the "wow" moments)

| Chapter | Scene | Tech |
|---|---|---|
| Intro: Marks, Signs, Symbols | 2D field of ~200 glyphs; hover-to-focus, scroll-to-zoom | GSAP + canvas |
| Sanskrit Framework | Breath-driven mandala; spacebar syncs to user's breath | GSAP + SVG + Howler |
| Breathing and Life | Scroll-jacked inhale/exhale; optional mic-driven mode | Web Audio API + GSAP |
| Heavenly Models | 3D star-map of alphabets; click → that alphabet's glyphs orbit | R3F + drei |
| Eastwards / Westwards | Globe with diffusion-route arcs animating with scroll | R3F + d3-geo |
| Western Alphabets | Morph-wall scrubber: A → 𐤀 → α → А → Α | GSAP MorphSVG |

All other chapters: type-led scrolly-reading with animated figure reveals, popover endnotes, and inline `<Pullquote>` / `<Blockquote>` callouts.

## Custom components

- `<Endnote n={1}>note text</Endnote>` — superscript; hover/click popover; deep-linked to chapter-end list
- `<Figure src caption credit zoom={true}>` — responsive `<picture>`; lightbox; alt = caption
- `<TableImage src altText sourceHtml>` — table-as-graphic with a11y description (sourceHtml retained for screen readers and future text fallback)
- `<Scene name="constellation" />` — lazy-loaded R3F island; only ships JS on intersection
- `<Pullquote>`, `<Blockquote>`, `<Breath />` (audio + visual), `<GlyphCompare a={…} b={…}>`

## Extraction pipeline (`tools/extract/`)

Idempotent. Re-runs must produce byte-identical output for an unchanged source.

| Step | Script | Output |
|---|---|---|
| 1 | `extract_text.py` | `chapters.json` — paragraphs, runs with styling, endnote refs, hyperlink targets |
| 2 | `extract_images.py` | `public/images/` with AVIF/WebP/JPEG variants at 480/960/1920w; EMF/WMF → SVG via `soffice --convert-to svg` |
| 3 | `render_tables.py` | `public/tables/{id}.{png,svg}` via headless Chromium; raw HTML kept as `tables/{id}.source.html` |
| 4 | `caption_index.py` | `figures.json` — filename ↔ chapter/paragraph map |
| 5 | `to_mdx.py` | `src/content/chapters/{NN-slug}.mdx` with components wired |
| 0 | `run_all.py` | Orchestrator |

## Commands

```bash
# extraction (one-time per source update)
cd tools/extract
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 run_all.py

# site
cd site
npm install
npm run dev      # localhost:4321
npm run build    # → dist/
npm run preview
```

## Performance budget

- LCP < 2.5s on 4G for any chapter page
- Initial JS payload per route < 100 KB gzipped (excludes the chapter's specific scene island)
- Heavy R3F scenes load only on intersection
- Image total per chapter < 8 MB (responsive variants, lazy-loaded below the fold)
- Lighthouse: ≥ 95 perf, 100 a11y, 100 best practices on text-only chapter routes

## Design principles

1. **Type leads.** Pages feel like the book's voice, not a tech demo.
2. **Motion explains, never decorates.** Every animation answers a "what does this mean?" implied by the surrounding text.
3. **Reading must remain possible.** `Esc` always exits an interactive scene to a plain-text version of the chapter.
4. **Mobile is first-class.** Where a desktop interaction can't translate to touch, design a different mobile version of that moment, never a downgrade.
5. **No fake serendipity.** Particles, gradients, parallax for their own sake are out. Every glyph on screen is a glyph from the book.

## Outstanding decisions

- Body serif (candidates: Spectral, Source Serif 4, EB Garamond, Cardo)
- Sanskrit / Slavic / Greek glyph fonts — pick before extraction so we can substitute the docx's bitmap glyphs with proper Unicode where text matches
- Pronunciation audio source: external library, recorded, or TTS?
- Offer a downloadable PDF of the original alongside, yes/no?

## Working agreements

- Use the `frontend-design` plugin for component design work; never default to generic styling.
- Use the `Plan` agent for any non-trivial implementation step before writing code.
- Use the `Explore` agent for cross-file investigations once the codebase grows.
- Don't add a feature, abstraction, or nice-to-have that wasn't in the agreed plan without checking first.
- Source docx is not committed — Amplify builds run extraction off a developer-provisioned source, *or* we commit the extracted artefacts and run the site build only. Decide before first deploy.
