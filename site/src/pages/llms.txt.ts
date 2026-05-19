// /llms.txt — Howard 2024 convention. Markdown index of the site for LLM crawlers.
// See https://llmstxt.org/

import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

function deriveSummary(body: string, maxLen = 160): string {
  const s = body
    .replace(/^---[\s\S]*?---/, "")
    .replace(/^import\s[^\n]*$/gm, "")
    .replace(/<(?:Figure|TableImage|Endnote|Pullquote)[^>]*\/>/g, "")
    .replace(/<Endnote[^>]*>.*?<\/Endnote>/gs, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

export const GET: APIRoute = async ({ site }) => {
  const chapters = (await getCollection("chapters")).sort(
    (a, b) => a.data.order - b.data.order,
  );
  const base = (site?.toString() ?? "").replace(/\/$/, "");

  const lines = [
    "# Alphabets of Life",
    "",
    "> A comparative scholarly study of how runes and alphabets begin as *alphabets of life* — *alpha vitae* — reflecting body, mind and cosmos. By Kim H. Veltman, General Edition, published by Twinscorp Smolensk in 2014. This is an interactive web edition.",
    "",
    "## About",
    "",
    "- **Author**: Kim H. Veltman (1948–2020), Canadian scholar of art, science, and the history of perspective and writing systems. [Wikipedia](https://en.wikipedia.org/wiki/Kim_H._Veltman)",
    "- **Publisher**: Twinscorp, Smolensk, Russia",
    "- **Year**: 2014",
    "- **Language**: English",
    "- **Scope**: 12 chapters tracing writing systems from marks and breath through Sanskrit, Slavic, Phoenician, and Western alphabets. ~175 pages with ~1,500 illustrations.",
    "- **Web edition home**: " + (base || "/"),
    "",
    "## Chapters",
    "",
    ...chapters.map((c) => {
      const url = `${base}/chapters/${c.data.slug}/`;
      const summary = deriveSummary(c.body ?? "");
      return `- [${c.data.title}](${url}): ${summary}`;
    }),
    "",
    "## Full text",
    "",
    `- [Complete markdown of every chapter](${base}/llms-full.txt) — ~1 MB plain text, suitable for ingestion by retrieval pipelines.`,
    "",
    "## Citation",
    "",
    "Veltman, Kim H. *Alphabets of Life — General Edition*. Smolensk: Twinscorp, 2014.",
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
