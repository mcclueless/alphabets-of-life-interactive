// /llms-full.txt — full markdown concatenation of every chapter, suitable for
// ingestion by LLM retrieval pipelines.

import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

function stripMdx(s: string): string {
  return s
    .replace(/^---[\s\S]*?---/, "")                           // frontmatter
    .replace(/^import\s[^\n]*$/gm, "")                        // imports
    .replace(/<Figure[^>]*caption="([^"]*)"[^>]*\/>/g, "\n*Figure: $1*\n")
    .replace(/<TableImage[^>]*caption="([^"]*)"[^>]*\/>/g, "\n*Table: $1*\n")
    .replace(/<(?:Figure|TableImage)[^>]*\/>/g, "")           // remaining components
    .replace(/<Endnote[^>]*n=\{(\d+)\}[^>]*>(.*?)<\/Endnote>/gs, "[$1: $2]")
    .replace(/<sup>(\d+)<\/sup>/g, "[$1]")
    .replace(/<sub>([^<]+)<\/sub>/g, "_$1_")
    .replace(/<br\s*\/?>/g, "  \n")
    .replace(/<[^>]+>/g, "")                                  // anything else
    .replace(/\n{3,}/g, "\n\n")                               // collapse blank runs
    .trim();
}

export const GET: APIRoute = async () => {
  const chapters = (await getCollection("chapters")).sort(
    (a, b) => a.data.order - b.data.order,
  );

  const header = [
    "# Alphabets of Life",
    "",
    "**Author:** Kim H. Veltman",
    "**Edition:** General Edition",
    "**Publisher:** Twinscorp, Smolensk",
    "**Year:** 2014",
    "**Format:** Interactive web edition, plain-text export for LLM ingestion.",
    "**Source:** Generated from `word/document.xml` of the original docx.",
    "",
    "---",
    "",
  ];

  const body: string[] = [];
  for (const c of chapters) {
    const eyebrow = c.data.chapterNumber
      ? `Chapter ${c.data.chapterNumber}`
      : "Front matter";
    body.push("");
    body.push(`# ${c.data.title}`);
    body.push("");
    body.push(`*${eyebrow}*`);
    body.push("");
    body.push(stripMdx(c.body ?? ""));
    body.push("\n---\n");
  }

  const all = header.join("\n") + "\n" + body.join("\n");

  return new Response(all, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
