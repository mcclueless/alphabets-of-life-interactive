import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import rehypeExternalLinks from "rehype-external-links";
import smartypants from "remark-smartypants";

// Site URL.  Override via the SITE_URL env var (Amplify console → App settings →
// Environment variables).  Falls back to a placeholder so dev/build still works.
const SITE_URL = process.env.SITE_URL ?? "https://alphabets-of-life.example.com";

export default defineConfig({
  site: SITE_URL,
  output: "static",
  trailingSlash: "ignore",
  integrations: [
    mdx({
      remarkPlugins: [smartypants],
      rehypePlugins: [
        [
          rehypeExternalLinks,
          {
            target: "_blank",
            rel: ["noopener", "noreferrer", "nofollow"],
            // Don't apply to anchors / same-host links
            test: (node) => {
              const href = (node.properties?.href ?? "") + "";
              return /^https?:\/\//i.test(href);
            },
          },
        ],
      ],
    }),
    react(),
    sitemap({
      filter: (page) => !page.includes("/download/"),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      assetsInlineLimit: 4096,
    },
  },
  build: {
    inlineStylesheets: "auto",
  },
  image: {
    service: { entrypoint: "astro/assets/services/sharp" },
  },
});
