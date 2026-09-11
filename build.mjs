/**
 * build.mjs — tiny static site generator for miranencheva.com
 *
 * What it does, in order:
 *   1. Reads site-wide settings from src/site.json
 *   2. Wraps each page in src/pages/*.html with src/layout.html
 *   3. Expands {{tokens}} (including the auto-generated publication list)
 *   4. Converts every photo in src/images/ to AVIF + WebP at several widths
 *   5. Inlines the CSS so the page renders with zero extra network requests
 *   6. Emits sitemap.xml, robots.txt and JSON-LD structured data for Google
 *   7. Minifies the HTML and writes everything to dist/
 *
 * You should not need to edit this file to update your website.
 * Edit src/pages/*.html, src/data/publications.json, and src/site.json instead.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

// sharp does the image conversion. It ships platform-specific binaries, so a
// node_modules folder installed on one OS will not load on another. If it
// fails to load we say so loudly — a silent skip produces a site with no
// photo at all, which is easy to miss.
let sharp = null;
try {
  ({ default: sharp } = await import('sharp'));
} catch (err) {
  console.error(`
┌─────────────────────────────────────────────────────────────────────┐
│  WARNING: image processing is OFF                                   │
│                                                                     │
│  'sharp' could not be loaded, so no AVIF/WebP versions will be made  │
│  and NO PHOTO WILL APPEAR on the site.                              │
│                                                                     │
│  Fix it by reinstalling for this machine:                           │
│                                                                     │
│      rm -rf node_modules package-lock.json                          │
│      npm install                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

  Reason: ${err.message.split('\n')[0]}
`);
}

const log = (...a) => console.log('  ', ...a);

/* ------------------------------------------------------------------ *
 * 1. Load configuration and content
 * ------------------------------------------------------------------ */

const site = JSON.parse(await fs.readFile(path.join(SRC, 'site.json'), 'utf8'));
const publications = JSON.parse(
  await fs.readFile(path.join(SRC, 'data', 'publications.json'), 'utf8')
);
const layout = await fs.readFile(path.join(SRC, 'layout.html'), 'utf8');

const BUILD_DATE = new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ *
 * 2. Small helpers
 * ------------------------------------------------------------------ */

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Strip HTML tags, used to build meta descriptions from page copy.
const stripTags = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const mkDir = (p) => fs.mkdir(p, { recursive: true });

/**
 * Empty the output directory before rebuilding.
 *
 * Cloud-synced folders (Google Drive, Dropbox, iCloud) sometimes refuse to
 * unlink a file that the sync client has open, which would abort the whole
 * build. Every file is overwritten anyway, so a failed delete is not fatal —
 * we log it once and carry on.
 */
async function cleanOutput(p) {
  if (!existsSync(p)) return;
  let blocked = 0;
  for (const entry of await fs.readdir(p, { withFileTypes: true })) {
    try {
      await fs.rm(path.join(p, entry.name), { recursive: true, force: true });
    } catch {
      blocked++;
    }
  }
  if (blocked) {
    log(`note   ${blocked} old file(s) could not be deleted (cloud sync lock) — they will be overwritten`);
  }
}

async function copyDir(from, to) {
  if (!existsSync(from)) return;
  await mkDir(to);
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
      continue;
    }
    try {
      await fs.copyFile(s, d);
    } catch (err) {
      // A cloud-sync client (Google Drive, Dropbox) can hold a lock on the
      // existing destination file, making the overwrite fail. Remove it and
      // retry once; if that also fails, warn rather than abort the build —
      // the previous copy of the file is still in place.
      try {
        await fs.rm(d, { force: true });
        await fs.copyFile(s, d);
      } catch {
        log(`warn   could not refresh ${path.relative(OUT, d)} (${err.code}) — kept the existing copy`);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3. Publications → HTML + structured data
 * ------------------------------------------------------------------ */

/** Render one author list, bolding Mira so her name is scannable. */
function renderAuthors(authors) {
  return authors
    .map((a) =>
      /^Nencheva/.test(a) ? `<strong class="me">${esc(a)}</strong>` : esc(a)
    )
    .join(', ');
}

function renderVenue(pub) {
  if (!pub.venue) return '';
  let out = `<em>${esc(pub.venue)}</em>`;
  if (pub.volume) out += `, ${esc(pub.volume)}`;
  if (pub.issue) out += `(${esc(pub.issue)})`;
  if (pub.pages) out += `, ${esc(pub.pages)}`;
  return out + '.';
}

function renderLinks(pub) {
  const links = [];
  if (pub.doi)
    links.push(
      `<a href="https://doi.org/${esc(pub.doi)}" rel="noopener">Journal</a>`
    );
  if (pub.pdf) links.push(`<a href="${esc(pub.pdf)}" rel="noopener">PDF</a>`);
  if (pub.osf) links.push(`<a href="${esc(pub.osf)}" rel="noopener">Data &amp; materials</a>`);
  if (pub.preprint)
    links.push(`<a href="${esc(pub.preprint)}" rel="noopener">Preprint</a>`);
  if (!links.length) return '';
  return `<span class="pub-links">${links.join('<span class="sep">·</span>')}</span>`;
}

function renderPub(pub) {
  const title = pub.doi
    ? `<a class="pub-title" href="https://doi.org/${esc(pub.doi)}" rel="noopener">${esc(pub.title)}</a>`
    : `<span class="pub-title">${esc(pub.title)}</span>`;

  return `<li class="pub"${pub.highlight ? ' data-highlight="true"' : ''}>
  <p class="pub-cite">${renderAuthors(pub.authors)} (${esc(pub.year)}). ${title}. ${renderVenue(pub)}</p>
  ${pub.status ? `<p class="pub-note">${esc(pub.status)}</p>` : ''}
  ${renderLinks(pub)}
</li>`;
}

/** Group publications by section, newest first within each group. */
function renderPublicationList(list) {
  const sections = [
    ['journal', 'Journal articles'],
    ['proceedings', 'Peer-reviewed conference proceedings'],
    ['inprep', 'Manuscripts under review and in preparation'],
  ];

  return sections
    .map(([key, heading]) => {
      const items = list
        .filter((p) => p.type === key)
        .sort((a, b) => b.year - a.year); // newest first, regardless of file order
      if (!items.length) return '';
      const id = key === 'inprep' ? 'in-progress' : key;
      return `<section class="pub-group" aria-labelledby="h-${id}">
  <h2 id="h-${id}">${heading}</h2>
  <ol class="pub-list" reversed>
${items.map(renderPub).join('\n')}
  </ol>
</section>`;
    })
    .filter(Boolean)
    .join('\n');
}

/** A short "selected work" list for the home page. */
function renderSelected(list) {
  const items = list
    .filter((p) => p.highlight)
    .sort((a, b) => b.year - a.year)
    .slice(0, 5);
  return `<ol class="pub-list pub-list--compact">
${items.map(renderPub).join('\n')}
</ol>`;
}

/**
 * Google understands scholarly articles. Emitting them as structured data
 * gives each paper its own machine-readable record tied to Mira's name,
 * which reinforces the "Mira Nencheva = this researcher" entity signal.
 */
function publicationJsonLd(list) {
  return list
    .filter((p) => p.type === 'journal' && p.doi)
    .map((p) => ({
      '@type': 'ScholarlyArticle',
      headline: p.title,
      name: p.title,
      datePublished: String(p.year),
      author: p.authors.map((a) => ({ '@type': 'Person', name: a })),
      isPartOf: p.venue ? { '@type': 'Periodical', name: p.venue } : undefined,
      identifier: `https://doi.org/${p.doi}`,
      url: `https://doi.org/${p.doi}`,
    }));
}

/* ------------------------------------------------------------------ *
 * 4. Images → AVIF / WebP at multiple widths
 * ------------------------------------------------------------------ */

const WIDTHS = [400, 800, 1200];
const imageManifest = new Map(); // basename -> { width, height, sources }

async function processImages() {
  const dir = path.join(SRC, 'images');
  if (!existsSync(dir)) return;
  const outDir = path.join(OUT, 'assets', 'img');
  await mkDir(outDir);

  for (const file of await fs.readdir(dir)) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    const from = path.join(dir, file);

    // Vector and animated formats pass straight through.
    if (!['.jpg', '.jpeg', '.png'].includes(ext) || !sharp) {
      await fs.copyFile(from, path.join(outDir, file));
      continue;
    }

    const img = sharp(from);
    const meta = await img.metadata();
    const variants = { avif: [], webp: [], jpg: [] };

    for (const w of WIDTHS) {
      if (w > meta.width * 1.2) continue; // never upscale
      const resized = sharp(from).resize({ width: w, withoutEnlargement: true });

      await resized.clone().avif({ quality: 55, effort: 6 })
        .toFile(path.join(outDir, `${base}-${w}.avif`));
      variants.avif.push(`/assets/img/${base}-${w}.avif ${w}w`);

      await resized.clone().webp({ quality: 78 })
        .toFile(path.join(outDir, `${base}-${w}.webp`));
      variants.webp.push(`/assets/img/${base}-${w}.webp ${w}w`);

      // JPEG fallback for very old clients and for social-card previews.
      await resized.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true })
        .toFile(path.join(outDir, `${base}-${w}.jpg`));
      variants.jpg.push(`/assets/img/${base}-${w}.jpg ${w}w`);
    }

    const largest = WIDTHS.filter((w) => w <= meta.width * 1.2).pop() || meta.width;
    imageManifest.set(base, {
      width: meta.width,
      height: meta.height,
      ratio: meta.height / meta.width,
      variants,
      fallback: `/assets/img/${base}-${largest}.jpg`,
    });
    log(`image  ${file} → avif/webp/jpg @ ${WIDTHS.join(',')}px`);
  }
}

/**
 * Build a <picture> element with AVIF → WebP → JPEG fallbacks.
 * width/height are always set so the browser reserves space and the page
 * doesn't jump while loading (this is a Core Web Vitals ranking factor).
 */
function picture(base, { alt, sizes = '100vw', className = '', eager = false }) {
  const m = imageManifest.get(base);
  if (!m) {
    return `<!-- image "${base}" not found in src/images/ -->`;
  }
  const displayW = 800;
  const displayH = Math.round(displayW * m.ratio);
  const loading = eager
    ? 'loading="eager" fetchpriority="high" decoding="async"'
    : 'loading="lazy" decoding="async"';

  return `<picture>
  <source type="image/avif" srcset="${m.variants.avif.join(', ')}" sizes="${sizes}">
  <source type="image/webp" srcset="${m.variants.webp.join(', ')}" sizes="${sizes}">
  <img src="${m.fallback}" srcset="${m.variants.jpg.join(', ')}" sizes="${sizes}"
       width="${displayW}" height="${displayH}" alt="${esc(alt)}"
       class="${className}" ${loading}>
</picture>`;
}

/* ------------------------------------------------------------------ *
 * 5. Structured data (JSON-LD)
 * ------------------------------------------------------------------ */

function personJsonLd() {
  return {
    '@type': 'Person',
    '@id': `${site.url}/#person`,
    name: site.name,
    alternateName: site.alternateNames,
    givenName: site.givenName,
    familyName: site.familyName,
    jobTitle: site.jobTitle,
    email: `mailto:${site.email}`,
    url: site.url,
    image: `${site.url}/assets/img/${site.photo}-800.jpg`,
    description: site.description,
    knowsAbout: site.knowsAbout,
    affiliation: {
      '@type': 'CollegeOrUniversity',
      name: site.affiliation.name,
      url: site.affiliation.url,
    },
    worksFor: {
      '@type': 'ResearchOrganization',
      name: site.lab.name,
      url: site.lab.url,
    },
    alumniOf: site.alumniOf.map((a) => ({
      '@type': 'CollegeOrUniversity',
      name: a.name,
      url: a.url,
    })),
    sameAs: Object.values(site.profiles).filter(Boolean),
  };
}

function websiteJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': `${site.url}/#website`,
    url: site.url,
    name: site.name,
    inLanguage: 'en-US',
    publisher: { '@id': `${site.url}/#person` },
  };
}

function breadcrumbJsonLd(page) {
  if (page.slug === '') return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${site.url}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: page.navTitle || page.title,
        item: `${site.url}/${page.slug}/`,
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * 6. Page rendering
 * ------------------------------------------------------------------ */

function nav(currentSlug) {
  return site.nav
    .map((item) => {
      const isCurrent = item.slug === currentSlug;
      const href = item.slug === '' ? '/' : `/${item.slug}/`;
      return `<li><a href="${href}"${isCurrent ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`;
    })
    .join('\n        ');
}

/** Collapse whitespace between tags without touching <pre>/<script> content. */
function minifyHtml(html) {
  const stash = [];
  html = html.replace(/<(pre|script|style|textarea)\b[\s\S]*?<\/\1>/gi, (m) => {
    stash.push(m);
    return `\u0001${stash.length - 1}\u0001`;
  });
  html = html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  return html.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[Number(i)]);
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const pagesBuilt = [];

async function buildPage(file, css) {
  const raw = await fs.readFile(path.join(SRC, 'pages', file), 'utf8');

  // Each page begins with a JSON front-matter block inside an HTML comment.
  const fm = raw.match(/^<!--\s*([\s\S]*?)\s*-->/);
  if (!fm) throw new Error(`${file} is missing its front-matter comment block`);
  const page = JSON.parse(fm[1]);
  let body = raw.slice(fm[0].length).trim();

  // Expand content tokens.
  body = body
    .replace(/\{\{publications\}\}/g, () => renderPublicationList(publications))
    .replace(/\{\{selected_publications\}\}/g, () => renderSelected(publications))
    .replace(/\{\{image:([\w.-]+)\|([^|]*)\|([^|]*)\|?(eager)?\}\}/g, (_, base, alt, sizes, eager) =>
      picture(base, { alt, sizes: sizes || '100vw', eager: eager === 'eager', className: 'photo' })
    );

  const url = page.slug === '' ? `${site.url}/` : `${site.url}/${page.slug}/`;
  const description = page.description || site.description;

  const graph = [personJsonLd(), websiteJsonLd()];
  const crumb = breadcrumbJsonLd(page);
  if (crumb) graph.push(crumb);
  if (page.slug === 'publications') graph.push(...publicationJsonLd(publications));

  const jsonLd = JSON.stringify(
    { '@context': 'https://schema.org', '@graph': graph },
    (_, v) => (v === undefined ? undefined : v)
  );

  const socialImage = `${site.url}/assets/img/${site.photo}-1200.jpg`;

  const html = layout
    .replaceAll('{{lang}}', 'en-US')
    .replaceAll('{{title}}', esc(page.title))
    .replaceAll('{{description}}', esc(description))
    .replaceAll('{{canonical}}', url)
    .replaceAll('{{social_image}}', socialImage)
    .replaceAll('{{site_name}}', esc(site.name))
    .replaceAll('{{nav}}', nav(page.slug))
    .replaceAll('{{css}}', css)
    .replaceAll('{{json_ld}}', jsonLd)
    .replaceAll('{{year}}', String(new Date().getFullYear()))
    .replaceAll('{{updated}}', BUILD_DATE)
    .replaceAll('{{email}}', esc(site.email))
    .replaceAll('{{scholar}}', esc(site.profiles.scholar))
    .replaceAll('{{body_class}}', page.slug ? `page-${page.slug}` : 'page-home')
    .replaceAll('{{content}}', body);

  // Cloudflare Pages looks for /404.html specifically, not /404/index.html.
  const outPath =
    page.slug === ''
      ? path.join(OUT, 'index.html')
      : page.slug === '404'
        ? path.join(OUT, '404.html')
        : path.join(OUT, page.slug, 'index.html');

  await mkDir(path.dirname(outPath));
  await fs.writeFile(outPath, minifyHtml(html));
  if (page.slug !== '404') {
    pagesBuilt.push({ ...page, url, priority: page.priority ?? 0.7 });
  }
  log(`page   ${page.slug === '' ? '/' : page.slug === '404' ? '/404.html' : '/' + page.slug + '/'}`);
}

/* ------------------------------------------------------------------ *
 * 7. sitemap.xml + robots.txt
 * ------------------------------------------------------------------ */

async function writeSitemap() {
  const urls = pagesBuilt
    .sort((a, b) => b.priority - a.priority)
    .map(
      (p) => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <changefreq>${p.changefreq || 'monthly'}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`
    )
    .join('\n');

  await fs.writeFile(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
  );

  await fs.writeFile(
    path.join(OUT, 'robots.txt'),
    `# https://miranencheva.com
User-agent: *
Allow: /

Sitemap: ${site.url}/sitemap.xml
`
  );
  log('wrote  sitemap.xml, robots.txt');
}

/* ------------------------------------------------------------------ *
 * 8. Run
 * ------------------------------------------------------------------ */

async function build() {
  const started = Date.now();
  console.log(`\nBuilding ${site.url}\n`);

  await cleanOutput(OUT);
  await mkDir(OUT);

  await processImages();

  // CSS is inlined into every page: the whole stylesheet is a few kilobytes,
  // so inlining removes a render-blocking request and improves LCP.
  const css = minifyCss(await fs.readFile(path.join(SRC, 'styles', 'main.css'), 'utf8'));

  const pageFiles = (await fs.readdir(path.join(SRC, 'pages'))).filter((f) =>
    f.endsWith('.html')
  );
  for (const f of pageFiles) await buildPage(f, css);

  await copyDir(path.join(SRC, 'static'), OUT);
  await writeSitemap();

  console.log(`\nDone in ${Date.now() - started}ms → dist/\n`);
}

await build();

if (process.argv.includes('--watch')) {
  console.log('Watching src/ for changes… (Ctrl-C to stop)');
  let timer;
  const watcher = fs.watch(SRC, { recursive: true });
  for await (const _ of watcher) {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch(console.error), 120);
  }
}
