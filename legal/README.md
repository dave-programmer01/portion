# Portion — landing + legal site

Static marketing/legal site for Portion. **Pure HTML + CSS**, no framework, no
build step. Deployed to **Cloudflare Workers static assets** (free plan).

## Structure

```
legal/
├── public/            ← everything served to the browser
│   ├── index.html     ← landing page (cloned from the UI inspiration)
│   ├── privacy.html   ← Privacy Policy (placeholder copy — drop in final text)
│   ├── terms.html     ← Terms of Service (placeholder shell)
│   ├── 404.html       ← not-found page
│   ├── styles.css     ← all styles
│   └── assets/        ← app screenshots (hero.png, demo.png)
├── wrangler.jsonc     ← Cloudflare Workers config (assets-only, no Worker script)
├── package.json
└── README.md
```

## Preview locally

Just open the file — it's plain HTML:

```bash
open public/index.html
```

Or serve it exactly like Cloudflare will:

```bash
npm install
npm run dev        # wrangler dev → http://localhost:8787
```

## Deploy (free)

1. Install deps once: `npm install`
2. Log in: `npx wrangler login`
3. Ship it: `npm run deploy`

That publishes to `https://portion-legal.<your-subdomain>.workers.dev`. Add a
custom domain later in the Cloudflare dashboard (Workers → your worker → Domains).

> Assets-only Workers are free — there's no Worker script, Cloudflare just serves
> the `public/` folder from its edge.

## Notes

- The landing page clones the supplied UI inspiration but uses Portion's **green**
  accent so the light page ties into the dark, green-accented app screenshots.
- `privacy.html` and `terms.html` are **shells with placeholder copy** — the
  structure, table of contents, and styling are done; paste the final legal text
  into the marked `[...]` spots and set the "Last updated" dates.
- Store-badge links point to `#` — swap in the real App Store / Google Play URLs
  when they're live.
