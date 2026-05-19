#!/usr/bin/env python3
"""
Alphabets of Life — extraction pipeline.

Reads the canonical docx and emits:
  site/src/content/chapters/{NN-slug}.mdx
  site/public/images/{filename}{.480,.960,.1920}.webp + original
  site/public/tables/ch{NN}-tbl-{NN}.svg
  tools/extract/build/figures.json
  tools/extract/build/extraction.log

Run from anywhere; paths are resolved relative to the repo root.
"""
from __future__ import annotations
import json
import re
import shutil
import subprocess
import sys
import zipfile
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET

try:
    from PIL import Image
except ImportError:
    print("error: Pillow not installed. Activate the venv and `pip install -r requirements.txt`.", file=sys.stderr)
    sys.exit(1)

# ------------------------------------------------------------------ paths
ROOT = Path(__file__).resolve().parents[2]
DOCX = ROOT / "Alphabets of Life General Edition.docx"
SITE = ROOT / "site"
PUBLIC_IMG = SITE / "public" / "images"
PUBLIC_TBL = SITE / "public" / "tables"
MDX_DIR = SITE / "src" / "content" / "chapters"
BUILD = Path(__file__).parent / "build"
LOG_PATH = BUILD / "extraction.log"

# ------------------------------------------------------------------ namespaces
NS = {
    "w":   "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r":   "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a":   "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "wp":  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "mc":  "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "v":   "urn:schemas-microsoft-com:vml",
    "o":   "urn:schemas-microsoft-com:office:office",
}
for k, v in NS.items():
    ET.register_namespace(k, v)
W   = "{" + NS["w"] + "}"
RNS = "{" + NS["r"] + "}"
ANS = "{" + NS["a"] + "}"
WP  = "{" + NS["wp"] + "}"
PIC = "{" + NS["pic"] + "}"
V   = "{" + NS["v"] + "}"

# ------------------------------------------------------------------ chapter map
# (slug, title, chapter_number_or_None, ordering, opening_title_regex)
CHAPTERS = [
    ("00-preface",                 "Preface",                      None,  re.compile(r"^Preface\s*$")),
    ("01-apology",                 "Apology to the Reader",        None,  re.compile(r"^Apology to the Reader\s*$")),
    ("02-synopsis",                "Synopsis",                     None,  re.compile(r"^Synopsis\s*$")),
    ("03-acknowledgements",        "Acknowledgements",             None,  re.compile(r"^Acknowledgements\s*$")),
    ("04-introduction",            "Introduction",                 None,  re.compile(r"^Introduction\s*$")),
    ("05-marks-signs-symbols",     "Marks, Signs, Symbols",        1,     re.compile(r"^Chapter\s+1[\.:]\s+Marks", re.I)),
    ("06-sanskrit-framework",      "Sanskrit Framework",           2,     re.compile(r"^Chapter\s+2[\.:]\s+Sanskrit", re.I)),
    ("07-breathing-and-life",      "Breathing and Life",           3,     re.compile(r"^Chapter\s+3[\.:]\s+Breathing", re.I)),
    ("08-movements-and-matrices",  "Movements and Matrices",       4,     re.compile(r"^Chapter\s+4[\.:]\s+Movements", re.I)),
    ("09-heavenly-models",         "Heavenly Models",              5,     re.compile(r"^Chapter\s+5[\.:]\s+Heavenly", re.I)),
    ("10-earthly-reflections",     "Earthly Reflections",          6,     re.compile(r"^Chapter\s+6[\.:]\s+Earthly", re.I)),
    ("11-eastwards",               "The Model Spreads Eastwards",  7,     re.compile(r"^Chapter\s+7[\.:]\s+The Model", re.I)),
    ("12-westwards",               "Westwards",                    8,     re.compile(r"^Chapter\s+8[\.:]\s+Westwards", re.I)),
    ("13-western-alphabets",       "Western Alphabets",            9,     re.compile(r"^Chapter\s+9[\.:]\s+Western", re.I)),
    ("14-classes-of-alphabets",    "Classes of Alphabets",        10,     re.compile(r"^Chapter\s+10[\.:]\s+Classes", re.I)),
    ("15-shapes-and-numbers",      "Shapes and Numbers",          11,     re.compile(r"^Chapter\s+11[\.:]\s+Shapes", re.I)),
    ("16-conclusions",             "Conclusions",                 12,     re.compile(r"^Chapter\s+12[\.:]\s+Conclusions", re.I)),
]

# TOC entries are short paragraphs ending in a page number / page range. Skip them.
TOC_TAIL_RE = re.compile(r"\s+\d+(\s*[-–]\s*\d+)?\s*$")

# Caption hints (preceding/following paragraphs)
CAPTION_RE = re.compile(r"^(Figure|Fig\.?|Plate|Image|Illustration|Table)\s*(\d+|[ivxIVX]+)[\.\):]?\s+", re.I)

# ------------------------------------------------------------------ utils
def log_setup():
    BUILD.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text("")

def log(msg: str):
    print(msg)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")

def slugify(s: str, max_len: int = 60) -> str:
    s = s.lower()
    s = re.sub(r"[^\w\s-]+", "", s, flags=re.U)
    s = re.sub(r"\s+", "-", s).strip("-")
    s = re.sub(r"-+", "-", s)
    return (s[:max_len].rstrip("-") or "untitled")

def text_of(elem) -> str:
    """All text inside an element, in document order."""
    parts = []
    for t in elem.iter(W + "t"):
        if t.text:
            parts.append(t.text)
    # collapse whitespace
    return re.sub(r"\s+", " ", "".join(parts)).strip()

# ------------------------------------------------------------------ docx open
def open_docx():
    if not DOCX.exists():
        sys.exit(f"docx not found at {DOCX}")
    z = zipfile.ZipFile(DOCX)

    rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    rel_map: dict[str, dict] = {}  # rId -> {target, type, mode}
    REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
    for rel in rels.findall(REL_NS + "Relationship"):
        rel_map[rel.get("Id")] = {
            "target": rel.get("Target"),
            "type":   rel.get("Type"),
            "mode":   rel.get("TargetMode", "Internal"),
        }

    # endnotes
    end_map: dict[str, str] = {}
    if "word/endnotes.xml" in z.namelist():
        en_root = ET.fromstring(z.read("word/endnotes.xml"))
        for en in en_root.findall(W + "endnote"):
            nid = en.get(W + "id")
            if nid is None: continue
            txt = text_of(en)
            # skip the synthetic separator / continuation entries (Word always emits ids -1 and 0)
            if int(nid) <= 0: continue
            end_map[nid] = txt

    # footnotes (likely empty here, but include for completeness)
    fn_map: dict[str, str] = {}
    if "word/footnotes.xml" in z.namelist():
        fn_root = ET.fromstring(z.read("word/footnotes.xml"))
        for fn in fn_root.findall(W + "footnote"):
            nid = fn.get(W + "id")
            if nid is None: continue
            if int(nid) <= 0: continue
            fn_map[nid] = text_of(fn)

    doc = ET.fromstring(z.read("word/document.xml"))
    return z, doc, rel_map, end_map, fn_map

# ------------------------------------------------------------------ inline run rendering
def render_run_segments(run, end_map, fn_map, rel_map, figures_state) -> list[dict]:
    """Return a list of segments from one <w:r>.
    Segment shape: {text, bold, italic, sup, sub, is_jsx}.
    Emphasis is NOT applied here — emit_segments handles cross-run merging."""
    rpr = run.find(W + "rPr")
    bold = italic = sup = sub = False
    if rpr is not None:
        if rpr.find(W + "b") is not None: bold = True
        if rpr.find(W + "i") is not None: italic = True
        va = rpr.find(W + "vertAlign")
        if va is not None:
            v = va.get(W + "val", "")
            if v == "superscript": sup = True
            elif v == "subscript": sub = True

    segs: list[dict] = []
    def add(text: str, is_jsx: bool = False, force_plain: bool = False):
        if not text: return
        segs.append({
            "text":   text,
            "bold":   False if force_plain else bold,
            "italic": False if force_plain else italic,
            "sup":    False if force_plain else sup,
            "sub":    False if force_plain else sub,
            "is_jsx": is_jsx,
        })

    for child in run:
        tag = child.tag
        if tag == W + "t":
            add(escape_mdx(child.text or ""))
        elif tag == W + "tab":
            add("   ")
        elif tag == W + "br":
            add("<br />", is_jsx=True, force_plain=True)
        elif tag == W + "endnoteReference":
            nid = child.get(W + "id")
            note_mdx = escape_mdx(end_map.get(nid, ""))
            add(f'<Endnote n={{{nid}}}>{note_mdx}</Endnote>', is_jsx=True, force_plain=True)
        elif tag == W + "footnoteReference":
            nid = child.get(W + "id")
            note_mdx = escape_mdx(fn_map.get(nid, ""))
            add(f'<Endnote n={{{nid}}} kind="footnote">{note_mdx}</Endnote>', is_jsx=True, force_plain=True)
        elif tag == W + "drawing":
            fig = handle_drawing(child, rel_map, figures_state)
            if fig: add(fig, is_jsx=True, force_plain=True)
        elif tag == W + "object" or tag == W + "pict":
            fig = handle_legacy_picture(child, rel_map, figures_state)
            if fig: add(fig, is_jsx=True, force_plain=True)
    return segs


def emit_segments(segments: list[dict]) -> str:
    """Walk segments and emit MDX with cross-run emphasis merging.

    Rules:
      - bold/italic markers stay open across consecutive segments sharing flags
      - whitespace-only segments are state-neutral (do not close emphasis)
      - JSX segments close any open emphasis (Markdown emphasis cannot span JSX)
      - sup/sub are per-segment HTML wraps (not merged across runs)
    """
    if not segments: return ""
    out: list[str] = []
    cur_bold = False
    cur_italic = False

    def set_state(new_bold: bool, new_italic: bool):
        nonlocal cur_bold, cur_italic
        if cur_italic and not new_italic:
            out.append("*"); cur_italic = False
        if cur_bold and not new_bold:
            out.append("**"); cur_bold = False
        if new_bold and not cur_bold:
            out.append("**"); cur_bold = True
        if new_italic and not cur_italic:
            out.append("*"); cur_italic = True

    for seg in segments:
        text = seg["text"]
        if not text: continue
        if seg["is_jsx"]:
            set_state(False, False)
            out.append(text)
            continue
        if text.strip() == "":
            out.append(text)
            continue
        wrapped = text
        if seg["sub"]: wrapped = f"<sub>{wrapped}</sub>"
        if seg["sup"]: wrapped = f"<sup>{wrapped}</sup>"
        set_state(seg["bold"], seg["italic"])
        out.append(wrapped)
    set_state(False, False)

    s = "".join(out)
    # The state machine never opens an emphasis without content, so we only need
    # to collapse repeated spaces. (Earlier versions had aggressive "empty italic"
    # regexes that incorrectly chewed up the inner ** of bold pairs.)
    s = re.sub(r"  +", " ", s)
    return s
    if sup: s = f"<sup>{s}</sup>"
    if sub: s = f"<sub>{s}</sub>"
    # Don't wrap markdown emphasis around runs that contain JSX — Markdown emphasis can't span JSX.
    has_jsx = "<Figure " in s or "<Endnote " in s or "<TableImage " in s or "<br />" in s
    if not has_jsx:
        if bold: s = f"**{s}**"
        if italic: s = f"*{s}*"
    return s

def escape_mdx(s: str) -> str:
    """Escape characters that have meaning in MDX/JSX text."""
    # Keep it conservative: escape backslashes, raw braces, and angle brackets
    s = s.replace("\\", "\\\\")
    s = s.replace("{", "\\{").replace("}", "\\}")
    s = s.replace("<", "\\<")
    # Underscores and asterisks inside words can trigger emphasis; escape them
    s = re.sub(r"(?<=\w)_(?=\w)", r"\\_", s)
    return s

# ------------------------------------------------------------------ figures
EXT_MAP = {  # PIL output -> filesystem extension
    "JPEG": "jpg", "PNG": "png", "GIF": "gif", "WEBP": "webp", "BMP": "bmp", "TIFF": "tiff",
}

def handle_drawing(drawing, rel_map, figures_state) -> str | None:
    """Process a <w:drawing> child. Return MDX <Figure /> string or None."""
    docPr = drawing.find(".//" + WP + "docPr")
    alt_text = ""
    if docPr is not None:
        alt_text = (docPr.get("descr") or docPr.get("title") or "").strip()

    blip = drawing.find(".//" + ANS + "blip")
    if blip is None:
        return None
    rid = blip.get(RNS + "embed") or blip.get(RNS + "link")
    if not rid or rid not in rel_map:
        return None
    target = rel_map[rid]["target"]
    media_name = Path(target).name
    return emit_figure(media_name, alt_text, figures_state)

def handle_legacy_picture(elem, rel_map, figures_state) -> str | None:
    """Legacy <w:pict> / VML image."""
    # Look for v:imagedata r:id
    for img in elem.iter(V + "imagedata"):
        rid = img.get(RNS + "id")
        if rid and rid in rel_map:
            target = rel_map[rid]["target"]
            return emit_figure(Path(target).name, "", figures_state)
    return None

def emit_figure(media_name: str, alt_text: str, figures_state) -> str:
    """Return MDX <Figure /> JSX for a media file."""
    fig_index = figures_state["next_index"]
    figures_state["next_index"] = fig_index + 1
    ch_num = figures_state["current_chapter_num"]

    # Process / copy the media once per unique source filename
    if media_name not in figures_state["processed"]:
        out_basename = make_figure_filename(media_name, ch_num, fig_index, alt_text, figures_state)
        process_media(media_name, out_basename, figures_state)
        # process_media may have written a converted-extension file (e.g. emf -> svg).
        # Don't overwrite its decision; only record if it didn't already.
        if media_name not in figures_state["processed"]:
            figures_state["processed"][media_name] = out_basename
    out_basename = figures_state["processed"][media_name]

    figures_state["index"].setdefault(out_basename, []).append({
        "chapter": figures_state["current_chapter_slug"],
        "fig_index": fig_index,
        "alt": alt_text,
    })

    # Caption is derived later (post-walk), but alt-text is what we have here. Use it as caption fallback.
    caption_attr = ""
    if alt_text:
        caption_attr = f' caption={json.dumps(alt_text)}'

    dim_attr = ""
    dims = figures_state["dimensions"].get(media_name)
    if dims:
        dim_attr = f' width={{{dims[0]}}} height={{{dims[1]}}}'

    src = f"/images/{out_basename}"
    return f'<Figure src="{src}" id="fig-{fig_index}"{dim_attr}{caption_attr} />'

def make_figure_filename(media_name: str, ch_num, fig_index: int, alt_text: str, figures_state) -> str:
    stem = Path(media_name).stem
    ext = Path(media_name).suffix.lstrip(".").lower() or "bin"
    if ext == "jpeg": ext = "jpg"
    # Use the 2-digit prefix from the chapter slug (e.g. "05-marks-..." -> "ch05")
    slug = figures_state.get("current_chapter_slug", "00-front")
    prefix_digits = slug.split("-", 1)[0]
    ch_prefix = f"ch{prefix_digits}"
    base = slugify(alt_text) if alt_text else slugify(stem)
    base = base or "image"
    return f"{ch_prefix}-fig-{fig_index:04d}-{base}.{ext}"

def _read_cached_dimensions(path: Path, media_name: str, figures_state):
    """Read width/height from an on-disk image. Best-effort, silent on failure."""
    try:
        with Image.open(path) as im:
            figures_state["dimensions"][media_name] = im.size
    except Exception:
        pass

def process_media(media_name: str, out_basename: str, figures_state):
    """Copy original media to public/images/ and generate WebP variants. Skips work if already present."""
    z = figures_state["zip"]
    arcname = f"word/media/{media_name}"
    out_path = PUBLIC_IMG / out_basename

    # Cache: if a previously-generated output already exists, skip processing.
    stem = out_basename.rsplit(".", 1)[0]
    ext = out_basename.rsplit(".", 1)[-1].lower()
    if ext in ("emf", "wmf"):
        if (PUBLIC_IMG / f"{stem}.svg").exists():
            figures_state["processed"][media_name] = f"{stem}.svg"
            return
    elif ext in ("svg",):
        if out_path.exists(): return
    elif ext == "gif":
        if out_path.exists():
            _read_cached_dimensions(out_path, media_name, figures_state)
            return
    else:
        if (out_path.exists()
            and (PUBLIC_IMG / f"{stem}.480.webp").exists()
            and (PUBLIC_IMG / f"{stem}.960.webp").exists()
            and (PUBLIC_IMG / f"{stem}.1920.webp").exists()):
            _read_cached_dimensions(out_path, media_name, figures_state)
            return

    try:
        data = z.read(arcname)
    except KeyError:
        log(f"  WARN missing media: {arcname}")
        return
    ext = out_basename.rsplit(".", 1)[-1].lower()

    # EMF / WMF — convert to SVG with soffice
    if ext in ("emf", "wmf"):
        tmp_in = PUBLIC_IMG / f"_tmp_{media_name}"
        tmp_in.write_bytes(data)
        try:
            subprocess.run(
                ["soffice", "--headless", "--convert-to", "svg",
                 "--outdir", str(PUBLIC_IMG), str(tmp_in)],
                check=False, capture_output=True, timeout=60,
            )
            converted = PUBLIC_IMG / (tmp_in.stem + ".svg")
            if converted.exists():
                final = PUBLIC_IMG / (out_basename.rsplit(".",1)[0] + ".svg")
                converted.rename(final)
                figures_state["processed"][media_name] = final.name
            else:
                log(f"  WARN EMF/WMF conversion failed: {media_name}")
        finally:
            try: tmp_in.unlink()
            except FileNotFoundError: pass
        return

    # SVG — write as-is
    if ext == "svg":
        out_path.write_bytes(data)
        return

    # Raster — write original, then generate WebP variants
    out_path.write_bytes(data)
    if ext == "gif":
        # animated GIFs: still record dimensions but don't generate WebP variants
        try:
            with Image.open(BytesIO(data)) as g:
                figures_state["dimensions"][media_name] = g.size
        except Exception:
            pass
        return
    try:
        img = Image.open(BytesIO(data))
        img.load()
        w, h = img.size
        figures_state["dimensions"][media_name] = (w, h)
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        stem = out_basename.rsplit(".", 1)[0]
        # Always emit all three width variants so the <picture> srcset is reliable.
        # When source is smaller than the target, save at source size (no upscaling).
        for target_w in (480, 960, 1920):
            ratio = min(1.0, target_w / w) if w > target_w else 1.0
            if ratio < 1.0:
                new_size = (int(w * ratio), int(h * ratio))
                variant = img.resize(new_size, Image.LANCZOS)
            else:
                variant = img
            variant_path = PUBLIC_IMG / f"{stem}.{target_w}.webp"
            variant.save(variant_path, "WEBP", quality=82, method=6)
    except Exception as e:
        log(f"  WARN image variants failed for {media_name}: {e}")

# ------------------------------------------------------------------ paragraph rendering
def render_paragraph(p, end_map, fn_map, rel_map, figures_state) -> tuple[str, str]:
    """Return (mdx_string, style_hint) for a paragraph."""
    pPr = p.find(W + "pPr")
    style_id = ""
    if pPr is not None:
        ps = pPr.find(W + "pStyle")
        if ps is not None:
            style_id = ps.get(W + "val", "")

    # Collect segments from runs + hyperlinks, then emit MDX once so cross-run
    # bold/italic spans are merged correctly.
    segments: list[dict] = []
    for child in p:
        if child.tag == W + "r":
            segments.extend(render_run_segments(child, end_map, fn_map, rel_map, figures_state))
        elif child.tag == W + "hyperlink":
            inner_segs = []
            for r in child.findall(W + "r"):
                inner_segs.extend(render_run_segments(r, end_map, fn_map, rel_map, figures_state))
            inner = emit_segments(inner_segs).strip()
            if not inner: continue
            rid = child.get(RNS + "id")
            url = ""
            if rid and rid in rel_map:
                url = rel_map[rid]["target"]
            if not url:
                anchor = child.get(W + "anchor")
                if anchor: url = f"#{slugify(anchor)}"
            link_text = f"[{inner}]({url})" if url else inner
            # Emit hyperlink as a single JSX-like segment so emphasis won't try to span it.
            segments.append({"text": link_text, "bold": False, "italic": False,
                             "sup": False, "sub": False, "is_jsx": True})
    body = emit_segments(segments).strip()

    if style_id == "blockquote":
        return ("> " + body, style_id) if body else ("", style_id)
    if style_id == "ListParagraph":
        return ("- " + body, style_id) if body else ("", style_id)
    return (body, style_id)

# ------------------------------------------------------------------ table rendering (as SVG)
def render_table_svg(tbl, chapter_slug, tbl_idx) -> tuple[str, str]:
    """Render a <w:tbl> as an SVG file. Return (path, caption_hint)."""
    rows = tbl.findall(W + "tr")
    if not rows:
        return "", ""

    # Extract cell text grid
    grid: list[list[str]] = []
    max_cols = 0
    for tr in rows:
        cells = []
        for tc in tr.findall(W + "tc"):
            cell_text = " ".join(text_of(p) for p in tc.findall(W + "p")).strip()
            cells.append(cell_text)
        grid.append(cells)
        max_cols = max(max_cols, len(cells))
    # pad rows
    for row in grid:
        while len(row) < max_cols:
            row.append("")

    # Compute column widths from longest content (in chars, capped)
    PAD_X, PAD_Y = 12, 8
    CHAR_W = 7.5
    LINE_H = 16
    MAX_CELL_W = 320

    def wrap(text: str, cell_w_px: int) -> list[str]:
        if not text: return [""]
        words = text.split(" ")
        lines, line = [], ""
        max_chars = max(8, int(cell_w_px / CHAR_W))
        for w in words:
            if len(line) + len(w) + 1 <= max_chars:
                line = (line + " " + w).strip()
            else:
                if line: lines.append(line)
                line = w
        if line: lines.append(line)
        return lines

    col_widths = []
    for c in range(max_cols):
        longest = max((len(row[c]) for row in grid), default=10)
        w = min(MAX_CELL_W, max(60, longest * CHAR_W + 2 * PAD_X))
        col_widths.append(int(w))

    # Now compute wrapped row heights
    wrapped: list[list[list[str]]] = []
    row_heights: list[int] = []
    for row in grid:
        wrows = []
        max_lines = 1
        for c, cell in enumerate(row):
            lines = wrap(cell, col_widths[c] - 2 * PAD_X)
            wrows.append(lines)
            max_lines = max(max_lines, len(lines))
        wrapped.append(wrows)
        row_heights.append(max_lines * LINE_H + 2 * PAD_Y)

    total_w = sum(col_widths)
    total_h = sum(row_heights)

    # Build SVG
    parts = []
    parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {total_h}" role="img" font-family="Georgia, serif" font-size="13" fill="#1a1a1a">')
    parts.append(f'<rect width="{total_w}" height="{total_h}" fill="#fbfaf6"/>')
    # vertical lines
    x = 0
    for cw in col_widths:
        parts.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{total_h}" stroke="#cfc8b8" stroke-width="1"/>')
        x += cw
    parts.append(f'<line x1="{total_w}" y1="0" x2="{total_w}" y2="{total_h}" stroke="#cfc8b8" stroke-width="1"/>')
    # horizontal lines + cell text
    y = 0
    for r_i, (row_lines, rh) in enumerate(zip(wrapped, row_heights)):
        is_header = r_i == 0
        if is_header:
            parts.append(f'<rect x="0" y="{y}" width="{total_w}" height="{rh}" fill="#f0eadd"/>')
        parts.append(f'<line x1="0" y1="{y}" x2="{total_w}" y2="{y}" stroke="#cfc8b8" stroke-width="1"/>')
        x = 0
        for c_i, lines in enumerate(row_lines):
            text_x = x + PAD_X
            text_y0 = y + PAD_Y + 12
            for li, ln in enumerate(lines):
                weight = ' font-weight="600"' if is_header else ''
                t = ln.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                parts.append(f'<text x="{text_x}" y="{text_y0 + li * LINE_H}"{weight}>{t}</text>')
            x += col_widths[c_i]
        y += rh
    parts.append(f'<line x1="0" y1="{total_h}" x2="{total_w}" y2="{total_h}" stroke="#cfc8b8" stroke-width="1"/>')
    parts.append("</svg>")

    prefix_digits = chapter_slug.split("-", 1)[0]
    filename = f"ch{prefix_digits}-tbl-{tbl_idx:02d}.svg"
    out = PUBLIC_TBL / filename
    out.write_text("".join(parts), encoding="utf-8")
    # Hint caption: take first non-empty cell as caption hint
    hint = next((c for row in grid for c in row if c), "")
    return f"/tables/{filename}", hint

# ------------------------------------------------------------------ main walk
def main():
    log_setup()
    log("=== Alphabets of Life extraction ===")
    PUBLIC_IMG.mkdir(parents=True, exist_ok=True)
    PUBLIC_TBL.mkdir(parents=True, exist_ok=True)
    MDX_DIR.mkdir(parents=True, exist_ok=True)
    # Only clear MDX (images are cached). Pass --clean to wipe everything.
    full_clean = "--clean" in sys.argv
    if full_clean:
        for p in PUBLIC_IMG.glob("*"):
            if p.is_file(): p.unlink()
        for p in PUBLIC_TBL.glob("*"):
            if p.is_file(): p.unlink()
    for p in MDX_DIR.glob("*.mdx"):
        p.unlink()

    z, doc, rel_map, end_map, fn_map = open_docx()
    log(f"  rels={len(rel_map)}  endnotes={len(end_map)}  footnotes={len(fn_map)}")

    body = doc.find(W + "body")
    if body is None:
        sys.exit("no <w:body> in document.xml")

    # Flatten top-level children: paragraphs + tables in document order
    top = [c for c in body if c.tag in (W + "p", W + "tbl")]

    figures_state = {
        "zip": z,
        "processed": {},          # media_name -> out_basename
        "dimensions": {},         # media_name -> (width, height)
        "index": {},              # out_basename -> [{chapter, fig_index, alt}]
        "next_index": 1,
        "current_chapter_num": None,
        "current_chapter_slug": "00-front",
    }

    # Pre-scan paragraph plaintexts to locate chapter boundaries
    paragraph_texts = []
    for el in top:
        if el.tag == W + "p":
            paragraph_texts.append(text_of(el))
        else:
            paragraph_texts.append("__TABLE__")

    # Find first-occurrence index of each chapter pattern, skipping TOC region
    starts: dict[str, int] = {}
    SKIP_TOC = 65
    for slug, title, num, pat in CHAPTERS:
        for i in range(SKIP_TOC, len(paragraph_texts)):
            t = paragraph_texts[i]
            if pat.match(t):
                starts[slug] = i
                break

    log("Chapter starts (top-level element index):")
    for slug, title, num, _ in CHAPTERS:
        log(f"  {slug:32s} -> {starts.get(slug, '???')}  ({title})")

    # Compute end of each chapter
    ordered = sorted(((starts[s], s, t, n) for s, t, n, _ in CHAPTERS if s in starts), key=lambda x: x[0])
    if not ordered:
        sys.exit("no chapter boundaries found — aborting")

    chunks = []
    for i, (start_idx, slug, title, num) in enumerate(ordered):
        end_idx = ordered[i+1][0] if i+1 < len(ordered) else len(top)
        chunks.append((slug, title, num, start_idx, end_idx))

    # Emit MDX per chapter
    for slug, title, num, start_idx, end_idx in chunks:
        figures_state["current_chapter_num"] = num if num is not None else 0
        figures_state["current_chapter_slug"] = slug
        order = next(idx for idx, (s, *_) in enumerate(CHAPTERS) if s == slug)

        mdx_lines = []
        mdx_lines.append("---")
        mdx_lines.append(f'title: "{title}"')
        mdx_lines.append(f"slug: {slug}")
        mdx_lines.append(f"order: {order}")
        if num is not None: mdx_lines.append(f"chapterNumber: {num}")
        mdx_lines.append("---")
        mdx_lines.append("")
        mdx_lines.append('import Figure from "../../components/Figure.astro";')
        mdx_lines.append('import Endnote from "../../components/Endnote.astro";')
        mdx_lines.append('import TableImage from "../../components/TableImage.astro";')
        mdx_lines.append('import Pullquote from "../../components/Pullquote.astro";')
        mdx_lines.append("")

        tbl_idx = 0
        in_list = False
        for i in range(start_idx, end_idx):
            el = top[i]
            if el.tag == W + "tbl":
                tbl_idx += 1
                src, hint = render_table_svg(el, slug, tbl_idx)
                if src:
                    cap = json.dumps(hint[:140]) if hint else '""'
                    mdx_lines.append(f"")
                    mdx_lines.append(f'<TableImage src="{src}" caption={cap} />')
                    mdx_lines.append("")
                continue

            body_str, style = render_paragraph(el, end_map, fn_map, rel_map, figures_state)
            # Skip empty paragraphs but preserve at most a single blank line of spacing
            if not body_str:
                if mdx_lines and mdx_lines[-1] != "":
                    mdx_lines.append("")
                in_list = False
                continue
            # Skip lines that are just the chapter title (we've already emitted it)
            if i == start_idx and re.fullmatch(rf"\s*#?\s*{re.escape(title)}\s*", body_str, re.I):
                continue
            if style == "ListParagraph":
                mdx_lines.append(body_str)
                in_list = True
                continue
            if in_list:
                mdx_lines.append("")
                in_list = False
            mdx_lines.append(body_str)
            mdx_lines.append("")

        mdx_path = MDX_DIR / f"{slug}.mdx"
        mdx_path.write_text("\n".join(mdx_lines).rstrip() + "\n", encoding="utf-8")
        log(f"  wrote {mdx_path.relative_to(ROOT)}  ({end_idx - start_idx} elements)")

    # figures.json
    (BUILD / "figures.json").write_text(json.dumps(figures_state["index"], indent=2), encoding="utf-8")
    log(f"\nfigures.json: {len(figures_state['index'])} unique image filenames")
    log(f"total figure refs emitted: {figures_state['next_index'] - 1}")
    log("=== done ===")

if __name__ == "__main__":
    main()
