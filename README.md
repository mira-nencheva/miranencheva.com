# miranencheva.com

Personal academic website for Mira Nencheva. Plain HTML and CSS, built by a
small Node script, deployed automatically by Cloudflare Pages.

**First time here?** Read [SETUP-GUIDE.md](SETUP-GUIDE.md) — it walks through
getting this online from scratch.

---

## Still to do

- [ ] Submit the site to Google Search Console (see SETUP-GUIDE.md §6a)
- [ ] Add the link to your Stanford profile page, Google Scholar homepage
      field, and lab pages — the single biggest thing for ranking
- [ ] Optional: add OSF / Bluesky / LinkedIn links in `src/site.json` → `profiles`

### Hidden publications

Your five under-review and in-preparation manuscripts are still in
`src/data/publications.json` but carry `"hidden": true`, so they don't appear on
the site. To bring one back, delete that line from its entry and push. The build
prints a reminder of how many are hidden each time it runs.

---

## How to change things

| I want to change… | Edit this |
|---|---|
| The text on a page | `src/pages/<name>.html` |
| Your publication list | `src/data/publications.json` |
| Your name, email, links, nav menu | `src/site.json` |
| Colours, fonts, spacing | `src/styles/main.css` |
| The shared header/footer or `<head>` | `src/layout.html` |
| Your photo | drop a new file into `src/images/` |
| Your CV PDF | replace `src/static/cv/Mira-Nencheva-CV.pdf` |

You should never need to touch `build.mjs`.

### Publishing a change

```bash
git add .
git commit -m "what you changed"
git push
```

Cloudflare rebuilds and publishes within about a minute.

### Previewing locally first

```bash
npm install        # once
npm run build      # writes dist/
npx serve dist     # then open http://localhost:3000
```

Or `npm run dev` to rebuild automatically as you edit.

---

## Adding a publication

Add an object to the array in `src/data/publications.json`. Order doesn't
matter — the build sorts by year. Minimum viable entry:

```json
{
  "type": "journal",
  "year": 2027,
  "title": "The title of the paper",
  "authors": ["Nencheva, M. L.", "Coauthor, A. B."],
  "venue": "Journal Name",
  "doi": "10.1234/example"
}
```

**Fields:**

| Field | Notes |
|---|---|
| `type` | `journal`, `proceedings`, or `inprep` — controls which section it lands in |
| `year` | Number. Used for sorting. |
| `authors` | Array of strings. Anything starting `Nencheva` is bolded automatically. |
| `venue`, `volume`, `issue`, `pages` | Optional, formatted for you |
| `doi` | Makes the title a link and generates structured data for Google |
| `pdf`, `osf`, `preprint` | Optional extra links |
| `status` | Short label like `"In press."` or `"Under review."` Shown under the citation. |
| `highlight` | `true` puts it in the "Recent papers" list on the homepage |
| `hidden` | `true` keeps the entry in this file but leaves it off the site |

The `note` field is worth using on your best papers — it's readable text that
both humans and search engines can understand, unlike a bare citation.

---

## Adding a whole new page

1. Copy an existing file in `src/pages/` (say `teaching.html`) to `talks.html`
2. Change the front-matter block at the top:

   ```html
   <!--
   {
     "slug": "talks",
     "title": "Talks — Mira Nencheva",
     "navTitle": "Talks",
     "description": "One or two sentences, under 160 characters. This is what shows in Google results.",
     "priority": 0.6
   }
   -->
   ```

3. Add it to the `nav` array in `src/site.json` if you want it in the menu
4. Commit and push

It's automatically added to `sitemap.xml` with correct canonical URLs and
structured data.

---

## What's been done for search ranking

The goal is ranking first for "Mira Nencheva" and appearing for
"Nencheva emotion development", "Nencheva Stanford", and similar.

**Speed** — Google uses page speed as a ranking factor, and slow pages lose
readers regardless.

- No JavaScript, no frameworks, no cookie banners, no analytics by default
- CSS is inlined at build time, so a page renders in one request
- System fonts only: zero font downloads, no invisible-text flash
- Images served as AVIF → WebP → JPEG, at three widths, with `srcset` so phones
  download a 400px file instead of a 1200px one
- `width`/`height` on every image so the layout never jumps while loading
- Aggressive cache headers on assets, revalidation on HTML

The whole site is under 500 KB including your CV PDF. A page loads in roughly
20 KB.

**Structured data** — every page carries a schema.org `Person` record naming
you, your job title, employer, alma maters, research topics, and `sameAs` links
to your other scholarly profiles. The publications page additionally emits a
`ScholarlyArticle` record per paper. This is how Google builds an "entity" for
you rather than treating your name as an arbitrary string — it's what makes a
knowledge panel possible.

**On-page basics** — one `<h1>` per page, descriptive `<title>` and
`<meta description>` per page, canonical URLs, semantic HTML (`article`,
`section`, `nav`, `figure`), meaningful `alt` text, breadcrumb structured data.

**Crawlability** — auto-generated `sitemap.xml` and `robots.txt`; 301 redirects
from old WordPress URLs so any existing inbound links keep their value.

**What still matters most, and isn't in this repo:** links to your site from
pages Google already trusts — your Stanford profile, Google Scholar, ORCID, lab
pages. See Step 6c in the setup guide.

---

## How the build works

`build.mjs` is about 400 commented lines. In order, it:

1. Reads `src/site.json` and `src/data/publications.json`
2. Converts each image in `src/images/` to AVIF/WebP/JPEG at 400, 800, 1200px
3. Reads each `src/pages/*.html`, parses its front-matter, expands `{{tokens}}`,
   and wraps it in `src/layout.html`
4. Inlines the minified CSS into every page
5. Generates JSON-LD structured data
6. Copies `src/static/` through verbatim (CV, favicon, `_headers`, `_redirects`)
7. Writes `sitemap.xml` and `robots.txt`
8. Minifies the HTML into `dist/`

`dist/` is generated output and is not committed — Cloudflare builds it fresh
on every push.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request. It builds the
site, then checks that all expected files exist, that the JSON-LD on every page
is valid JSON, and that no internal link is broken. It does **not** deploy —
Cloudflare Pages does that directly from GitHub. Its job is to give you a red X
before a mistake reaches the live site.

---

## Structure

```
├── build.mjs              the build script
├── src/
│   ├── site.json          name, email, links, nav
│   ├── layout.html        shared <head>, header, footer
│   ├── pages/             one file per page
│   ├── data/
│   │   └── publications.json
│   ├── styles/main.css    the entire stylesheet
│   ├── images/            source photos (any size)
│   └── static/            copied as-is: CV, favicon, _headers, _redirects
├── .github/workflows/     CI checks
└── dist/                  build output (gitignored)
```
