// Dynamic robots.txt — emits the sitemap URL from Astro.site, so it stays in
// sync with the SITE_URL env var on every deploy.

import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const sitemap = `${base}/sitemap-index.xml`;

  const text = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /download/",
    "",
    "# AI / LLM crawlers — explicitly welcome.",
    "# Remove any block below to opt out of a specific crawler.",
    "",
    "User-agent: GPTBot",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: anthropic-ai",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: CCBot",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: cohere-ai",
    "Allow: /",
    "Disallow: /download/",
    "",
    "User-agent: Bytespider",
    "Disallow: /",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
