// Dynamic robots.txt — emits the sitemap URL from Astro.site, so it stays in
// sync with the SITE_URL env var on every deploy.

import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const sitemap = `${base}/sitemap-index.xml`;

  const text = [
    "User-agent: *",
    "Allow: /",
    "",
    "# AI / LLM crawlers — explicitly welcome.",
    "# Remove any block below to opt out of a specific crawler.",
    "",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: anthropic-ai",
    "Allow: /",
    "",
    "User-agent: CCBot",
    "Allow: /",
    "",
    "User-agent: cohere-ai",
    "Allow: /",
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
