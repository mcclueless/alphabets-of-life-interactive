# Deploying Alphabets of Life to AWS Amplify Hosting

This is the only doc you need to get the site live. Estimated time end-to-end: **15–25 minutes** (most of it is the first `git push` of the ~150 MB image bundle).

---

## What ships in the deploy

```
148 MB total
├── ~140 MB  site/public/images        (1,067 raster sources × 3 WebP variants + originals + 20 SVGs)
├── ~150 KB  site/public/tables        (30 SVG tables)
├── ~1.6 MB  site/src/content/chapters (17 MDX chapter files)
├── ~3 MB    Astro/Pagefind build output
└── few KB   configs (amplify.yml, customHttp.yml, .gitignore, CLAUDE.md, etc.)
```

The source `.docx` and `ALPHABETS/` folders are **excluded** by `.gitignore` — they're 80–215 MB each, copyright-bearing, and not needed for the build. Amplify builds from the committed MDX + image artefacts.

---

## 0. Pre-flight (run locally once)

```bash
# from repo root
cd site
npm ci
npm run build
```

Expected: `dist/` produced in <30 s, ending with `[build] 18 page(s) built` and Pagefind indexing 18 pages. If this fails locally it'll fail on Amplify too — fix before pushing.

Inspect the output:

```bash
du -sh dist            # ~194 MB
test -f dist/index.html dist/sitemap-index.xml dist/robots.txt dist/llms.txt
ls dist/pagefind | head
```

---

## 1. Push to a Git host

Amplify Hosting connects to GitHub, GitLab, Bitbucket, or AWS CodeCommit. Pick one. The instructions below use **GitHub**.

### 1a. Initialise the repo (already done if `.git/` exists)

```bash
cd /Users/bassadino/Documents/Repositories/leisure/aol
git status              # confirm we're in the repo root
```

If you haven't reviewed yet, run `git status` and `git diff --stat` to see what would be committed. Confirm that the source `.docx` and `ALPHABETS/` folders are **not** in the list — they should be excluded by `.gitignore`.

### 1b. First commit

```bash
git add .
git commit -m "Initial commit — Alphabets of Life interactive edition"
```

The commit will take ~10–30 s because of the 4,400-file image set.

### 1c. Create a GitHub repo and push

In the GitHub UI: New repository → name it (e.g. `alphabets-of-life`) → **private** unless you want it public → **don't** init with README/license (we already have CLAUDE.md).

Then locally:

```bash
git remote add origin git@github.com:<you>/alphabets-of-life.git
git push -u origin main
```

The initial push uploads ~148 MB (about 1–3 minutes on standard broadband). Subsequent pushes are tiny.

> **If push is rejected:** GitHub's per-file limit is 100 MB. None of our files exceed that, but if you ever embed a large media asset, switch to Git LFS — `brew install git-lfs && git lfs install && git lfs track "site/public/images/*.webp"` and commit `.gitattributes`. Not needed for the current image set.

---

## 2. Connect Amplify Hosting

1. Sign in to the **AWS Console** → Amplify (use the region closest to your audience; for Europe pick `eu-central-1` Frankfurt or `eu-west-1` Ireland).
2. **Create new app** → **Deploy your app** → **GitHub**.
3. Authorise Amplify to access your GitHub account, then pick the `alphabets-of-life` repo and the `main` branch.
4. Amplify auto-detects `amplify.yml` in the root — review the build settings page, no changes needed. Confirm:
   - **App root**: `site` (auto-detected from `appRoot` in amplify.yml)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. **Environment variables** — click **Advanced settings** → **Add environment variable**:
   - `SITE_URL` → `https://main.dXXXXXX.amplifyapp.com` (you'll replace this with the actual URL after the first deploy — see Step 4)
   - Optional: `NODE_VERSION` → `20` (Amplify defaults to 18; Astro 5 prefers 20)
6. **Review** → **Save and deploy**.

First deploy takes about **4–6 minutes**:
- Provision (~30 s)
- Build (~2 min — installs 555 npm packages, runs `astro build` + `pagefind`)
- Deploy + invalidate CloudFront (~1–2 min)

Watch the build log; the `postBuild` step prints `dist/ size: 194M` if everything's healthy.

---

## 3. Verify the deploy

Amplify gives you a URL like `https://main.d2a3b4c5d6e.amplifyapp.com`. Open it.

Quick smoke test (replace `<URL>`):

```bash
URL=https://main.d2a3b4c5d6e.amplifyapp.com
curl -sS -o /dev/null -w "%{http_code}  %{url_effective}\n" $URL/
curl -sS -o /dev/null -w "%{http_code}  %{url_effective}\n" $URL/chapters/05-marks-signs-symbols/
curl -sS -o /dev/null -w "%{http_code}  %{url_effective}\n" $URL/robots.txt
curl -sS -o /dev/null -w "%{http_code}  %{url_effective}\n" $URL/llms.txt
curl -sS -o /dev/null -w "%{http_code}  %{url_effective}\n" $URL/sitemap-index.xml
curl -sS -o /dev/null -w "%{http_code}  %{url_effective}\n" $URL/pagefind/pagefind.js
```

All six should return `200`.

In the browser:
- Homepage hero renders with serif typography.
- Click into chapter 5 — the GlyphField wow-scene appears above the body.
- Click any image — medium-zoom enlarges it with the warm-dark backdrop.
- View page source on a chapter — should see `<link rel="canonical">`, `<meta property="og:image">`, two `<script type="application/ld+json">` blocks (Article + BreadcrumbList), and 12 `<a target="_blank" rel="noopener noreferrer nofollow">` external links.

---

## 4. Update SITE_URL (one-time, post-first-deploy)

The first deploy used the placeholder fallback URL because we didn't know the Amplify URL yet. Now we do.

1. Amplify Console → your app → **App settings** → **Environment variables**.
2. Edit `SITE_URL` to the real value (e.g., `https://main.d2a3b4c5d6e.amplifyapp.com` or your custom domain).
3. **Redeploy** by triggering a build from the Amplify UI (or push a no-op commit).

After this redeploy, canonical URLs, `og:url`, the sitemap, and the `Sitemap:` line in `robots.txt` all point to the correct host.

---

## 5. Custom domain (optional)

Amplify Console → your app → **Domain management** → **Add domain**. Either:

- **Route 53 domain you already own** — Amplify auto-configures DNS and ACM cert.
- **External domain** — Amplify gives you CNAME records to add at your registrar. SSL cert via ACM provisions automatically in <1 hour.

After DNS propagates (5–30 min), update `SITE_URL` to the custom domain and redeploy once.

---

## 6. Ongoing development

| Change | What to do |
|---|---|
| Edit a chapter | Edit the `.mdx` directly, commit, push — Amplify auto-builds. |
| Re-extract from updated docx | `python tools/extract/extract.py && python tools/extract/post_process.py`, then commit the regenerated `site/src/content/chapters/*.mdx` + `site/public/images/*` + `site/public/tables/*`. |
| Add a new scene | Drop a new `src/scenes/XYZ.tsx`, wire it in `[...slug].astro`, commit, push. |
| Change colours / typography | Edit `src/styles/globals.css`, commit, push. |
| Rebuild glyph manifests after extraction | The Python pipeline regenerates them as side-effect; just commit the changed JSON files. |

Amplify builds on every push to the connected branch. PR previews (if you set up PRs) also build into their own preview URLs automatically.

---

## 7. Rolling back

Amplify keeps every successful deploy. To roll back: **Hosting environments** → click the previous green deploy → **Redeploy this version**. CloudFront invalidation runs automatically. <1 minute to roll back.

---

## 8. Cost expectations

For a static site of this size (148 MB committed, ~50 GB/month outbound on a modest-traffic launch):

- Build minutes: free tier covers 1,000 min/month — at ~3 min/build that's 333 builds/month.
- Storage: free tier covers 5 GB stored — we're at 148 MB committed (~3% of the cap).
- Bandwidth: free tier covers 15 GB/month, then $0.15/GB. CloudFront caching keeps the bandwidth bill predictable.

Expect **$0–$10/month** for a low-traffic launch. Heavy traffic on the image set is the main cost variable.

---

## Troubleshooting

**Build fails with `EACCES` on `tools/extract/.venv/`** — that path is in `.gitignore` so it shouldn't reach the build container; confirm with `git ls-files | grep .venv` (should return nothing).

**Images 404 on production but work locally** — Astro respects case-sensitive filenames; macOS HFS+ is case-insensitive. Check the Amplify build log for any filename casing fix-ups.

**Pagefind directory empty** — `npm run build` ran the `astro build` step but the `pagefind` step failed. Check the build log; common cause is `pagefind` not finding `dist/`. Fix by running `npm ci` cleanly.

**Long `og:image` cache** — we set `Cache-Control: public, max-age=86400` (24 h) on `/og-image.*`. To force social platforms to re-fetch, append `?v=2` to the URL in `Base.astro` after changing the image.

**External links open in same tab** — confirm `rehype-external-links` is loading: `grep rehype astro.config.mjs` should show the import.
