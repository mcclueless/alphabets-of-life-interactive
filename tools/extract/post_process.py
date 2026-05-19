#!/usr/bin/env python3
"""
Post-process MDX chapter files after extraction.

Three passes:
  1. Strip useless `caption="..."` attrs from <Figure> tags (Windows paths, junk-short strings).
  2. Fold caption-shaped paragraphs ("Figure N. ...", "Fig. 1 ...", "Table N. ...") into the
     preceding <Figure> / <TableImage>'s caption attribute, and drop them from body text.
  3. Drop a stray bold-only repeat of the chapter title near the top of each file.

Idempotent — running twice produces the same output as running once.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MDX_DIR = ROOT / "site" / "src" / "content" / "chapters"

FIGURE_RE   = re.compile(r'^<(Figure|TableImage)\s+(.*?)\s*/>\s*$')
ATTR_CAP_RE = re.compile(r'\s*caption=("(?:[^"\\]|\\.)*"|\{[^}]*\})')
CAPTION_PARA_RE = re.compile(
    r'^\s*\**\s*(Figure|Fig\.?|Plate|Image|Illustration|Table)\s*([ivxlcdmIVXLCDM\d]+)\s*[.\):]?\s+.+',
    re.I,
)
WIN_PATH_RE = re.compile(r'^[A-Za-z]:[\\/]')

# Bold-only short paragraphs that look like numbered sub-section headings:
#   **9.4. Alphabet Structures and Systems **        →  ##  9.4. Alphabet Structures and Systems
#   **10.3.3. 50 – 99 Letters**                       →  ###
# Heading level = (depth of dotted numbering, max h4).
NUMBERED_HEADING_RE = re.compile(
    r'^\*\*\s*(\d+(?:\.\d+){0,3})\.?\s+([A-Z][^*\n]{1,90}?)\s*\*\*\s*$',
)

FRONTMATTER_END = "---"
TITLE_LINE_RE = re.compile(r'^#\s+(.+?)\s*$')

def is_useless_caption(cap: str) -> bool:
    """cap is the inside of a JSON-encoded string, with escapes intact."""
    try:
        unescaped = json.loads(cap)
    except Exception:
        return True
    s = unescaped.strip()
    if not s: return True
    if WIN_PATH_RE.match(s): return True
    if "\\" in s and len(s) > 6: return True
    if len(s) < 5: return True
    # 100% punctuation / digits
    if re.fullmatch(r'[\d\s\W_]+', s): return True
    return False

def strip_useless_captions(line: str) -> str:
    m = FIGURE_RE.match(line)
    if not m: return line
    tag, attrs = m.group(1), m.group(2)
    am = ATTR_CAP_RE.search(attrs)
    if not am: return line
    cap_value = am.group(1)
    if cap_value.startswith('{') or not is_useless_caption(cap_value):
        return line
    new_attrs = (attrs[:am.start()] + attrs[am.end():]).strip()
    return f"<{tag} {new_attrs} />\n" if new_attrs else f"<{tag} />\n"

def attach_caption(figure_line: str, caption_text: str) -> str:
    """Add or replace caption attr on a Figure/TableImage line."""
    m = FIGURE_RE.match(figure_line)
    if not m: return figure_line
    tag, attrs = m.group(1), m.group(2)
    # remove any existing caption attr
    attrs = ATTR_CAP_RE.sub('', attrs).strip()
    cap_attr = f' caption={json.dumps(caption_text)}'
    return f"<{tag} {attrs}{cap_attr} />\n"

def is_caption_paragraph(line: str) -> tuple[bool, str]:
    s = line.strip()
    if not s: return False, ""
    bare = re.sub(r'^\**\s*|\s*\**$', '', s).strip()
    if not CAPTION_PARA_RE.match(bare): return False, ""
    # Reject if the paragraph also contains JSX tags or markdown links — folding it
    # into a caption attribute would corrupt JSX or lose hyperlink info.
    if re.search(r'<(Figure|TableImage|Endnote|sup|sub|br)\b', bare): return False, ""
    if "<" in bare or "{" in bare or "}" in bare or "[" in bare: return False, ""
    # Cap caption length to a reasonable size; anything > 240 chars is more likely a body para.
    if len(bare) > 240: return False, ""
    return True, bare

def process_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    # Pre-pass: split lines that hold more than one <Figure /> / <TableImage />
    text = re.sub(
        r'(<(?:Figure|TableImage)\s[^>]*?/>)\s*(?=<(?:Figure|TableImage)\s)',
        r'\1\n\n',
        text,
    )
    lines = text.splitlines(keepends=True)

    # locate end of frontmatter to know where body starts
    body_start = 0
    fm_count = 0
    for i, ln in enumerate(lines):
        if ln.strip() == FRONTMATTER_END:
            fm_count += 1
            if fm_count == 2:
                body_start = i + 1
                break

    # extract chapter title from frontmatter (H1 may not exist; we strip it from MDX)
    title = ""
    for i in range(body_start):
        m = re.match(r'^\s*title:\s*"([^"]+)"\s*$', lines[i])
        if m:
            title = m.group(1).strip()
            break
    # legacy H1 detection (kept for the older pass-3 path)
    h1_idx = -1
    for i in range(body_start, min(body_start + 30, len(lines))):
        m = TITLE_LINE_RE.match(lines[i])
        if m:
            h1_idx = i
            if not title: title = m.group(1).strip()
            break

    # Pass 1: strip useless captions
    out = []
    stats = {"useless_caption_stripped": 0, "caption_folded": 0, "title_dup_removed": 0, "headings_upgraded": 0}
    for ln in lines:
        new_ln = strip_useless_captions(ln)
        if new_ln != ln:
            stats["useless_caption_stripped"] += 1
        out.append(new_ln)

    # Pass 1b: upgrade bold-only numbered subsection paragraphs to MDX headings.
    #   **9.4. Alphabet Structures and Systems **   → ## 9.4. Alphabet Structures and Systems
    #   **10.3.3. 50 – 99 Letters**                 → ### 10.3.3. 50 – 99 Letters
    upgraded = []
    for ln in out:
        m = NUMBERED_HEADING_RE.match(ln.rstrip("\n").rstrip())
        if m:
            num, htitle = m.group(1), m.group(2).strip().rstrip(".").strip()
            internal_dots = num.count(".")
            level = max(2, min(internal_dots + 1, 4))  # 0 dots→h2, 1→h2, 2→h3, 3→h4
            upgraded.append("#" * level + f" {num}. {htitle}\n")
            stats["headings_upgraded"] += 1
        else:
            upgraded.append(ln)
    out = upgraded

    # Pass 2: fold caption-shaped paragraphs into preceding Figure/TableImage
    folded = []
    i = 0
    while i < len(out):
        ln = out[i]
        m = FIGURE_RE.match(ln)
        if m:
            # look at upcoming lines (skipping blanks) for a caption-shaped paragraph
            j = i + 1
            while j < len(out) and out[j].strip() == "":
                j += 1
            if j < len(out):
                hit, cap_text = is_caption_paragraph(out[j])
                if hit:
                    folded.append(attach_caption(ln, cap_text))
                    # preserve one blank line, skip the caption paragraph
                    folded.append("\n")
                    stats["caption_folded"] += 1
                    i = j + 1
                    continue
        folded.append(ln)
        i += 1
    out = folded

    # Pass 3: drop stray bold-only title duplicates right after the H1
    if h1_idx >= 0 and title:
        cleaned = []
        skip_dup_phase = True
        bold_title_re = re.compile(r'^\**\s*' + re.escape(title) + r'\s*\**\s*$', re.I)
        chap_pat = re.compile(r'^\**\s*Chapter\s+\d+\s*[\.:]\s*' + re.escape(title) + r'\s*\**\s*$', re.I)
        for i, ln in enumerate(out):
            if skip_dup_phase and i > h1_idx and i <= h1_idx + 6:
                if bold_title_re.match(ln) or chap_pat.match(ln):
                    stats["title_dup_removed"] += 1
                    continue
                if ln.strip() == "":
                    cleaned.append(ln)
                    continue
                skip_dup_phase = False
            cleaned.append(ln)
        out = cleaned

    # Collapse runs of >2 blank lines into 1
    final = []
    blanks = 0
    for ln in out:
        if ln.strip() == "":
            blanks += 1
            if blanks <= 1:
                final.append("\n")
        else:
            blanks = 0
            final.append(ln)

    # Final content-wide regex sweep — catches inline figures and figures with trailing text
    content = "".join(final)
    # Windows file paths
    before = content
    content = re.sub(r'\s+caption="[A-Za-z]:[\\/][^"]*"', '', content)
    stats["useless_caption_stripped"] += before.count('caption="') - content.count('caption="')
    # Path-shaped values (any extension after a backslash)
    before = content
    content = re.sub(r'\s+caption="[^"]*\\\\[^"]*"', '', content)
    stats["useless_caption_stripped"] += before.count('caption="') - content.count('caption="')
    # URL-only captions (provenance from source docx, not real captions)
    before = content
    content = re.sub(r'\s+caption="https?://[^"]*"', '', content)
    stats["useless_caption_stripped"] += before.count('caption="') - content.count('caption="')
    # Empty captions
    content = re.sub(r'\s+caption=""', '', content)
    # Single-word slug-shaped captions (e.g., "viewer", "image123") that survived
    content = re.sub(r'\s+caption="[A-Za-z][\w]{0,8}"', '', content)

    # Title-dup sweep — Word's run fragmentation produces things like
    #   **Apology to the Re****a****der**       (bold split into segments)
    #   Chapter 4**. Movements and Matrices**   (number outside, rest bold)
    #   <br />**Chapter 8: ****Westwards**
    # So we normalize line → plain text, then compare to the title.
    if title:
        def normalize(line: str) -> str:
            s = line.strip()
            s = re.sub(r'<br\s*/?>', '', s)        # strip <br/>
            s = re.sub(r'<[^>]+>', '', s)          # strip any other inline HTML/JSX
            s = re.sub(r'\*+', '', s)              # strip bold/italic markers
            s = re.sub(r'^[-•*]\s+', '', s)        # strip leading list markers
            s = re.sub(r'^>+\s*', '', s)           # strip leading blockquote
            s = re.sub(r'\\([_*])', r'\1', s)      # unescape \_ \*
            s = re.sub(r'^\s*Chapter\s+\d+\s*[\.:]\s*', '', s, flags=re.I)  # strip "Chapter N."
            s = re.sub(r'[“”‘’"\'`]', '', s)  # strip quote chars
            s = re.sub(r'\s+', ' ', s).strip()
            return s.lower()

        title_norm = normalize(title)
        lines2 = content.splitlines(keepends=True)

        # Find body start: first non-blank line after the second '---' (frontmatter end) that
        # isn't an import statement.
        in_fm, fm_seen = True, 0
        body_pos = -1
        for i, ln in enumerate(lines2):
            stripped = ln.strip()
            if in_fm:
                if stripped == "---":
                    fm_seen += 1
                    if fm_seen == 2: in_fm = False
                continue
            if not stripped: continue
            if stripped.startswith("import "): continue
            body_pos = i
            break

        if body_pos >= 0:
            scanned = 0
            cleaned_lines: list[str] = []
            for i, ln in enumerate(lines2):
                if i >= body_pos and scanned < 15:
                    stripped = ln.strip()
                    if stripped:
                        scanned += 1
                        if normalize(ln) == title_norm:
                            stats["title_dup_removed"] += 1
                            continue
                cleaned_lines.append(ln)
            content = "".join(cleaned_lines)

    path.write_text(content, encoding="utf-8")
    return stats

def main():
    files = sorted(MDX_DIR.glob("*.mdx"))
    print(f"post-processing {len(files)} MDX files...")
    total = {"useless_caption_stripped": 0, "caption_folded": 0, "title_dup_removed": 0}
    for p in files:
        s = process_file(p)
        for k in total: total[k] += s[k]
        print(f"  {p.name:38s}  stripped={s['useless_caption_stripped']:4d}  folded={s['caption_folded']:4d}  title_dup={s['title_dup_removed']}")
    print(f"\ntotals: {total}")

if __name__ == "__main__":
    main()
