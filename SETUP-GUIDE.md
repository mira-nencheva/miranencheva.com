# Getting your new site online, step by step

This is written for someone who has never deployed a website. Every step says
exactly what to click and what you should see afterwards. Total time: about
45 minutes, most of which is waiting.

**The end result:** you edit a file → you push to GitHub → Cloudflare rebuilds and
publishes your site automatically, usually within 60 seconds. No FTP, no
WordPress dashboard, no hosting bill.

---

## How the pieces fit together

```
   your computer            GitHub                  Cloudflare
   ─────────────            ──────                  ──────────
   edit a file    ──push──▶  stores the code ──▶ builds it and serves
                             (the backup)        it worldwide
                                  │
                                  └──▶ GitHub Actions double-checks
                                       the build before it goes live

   Namecheap ──── points miranencheva.com at Cloudflare (one-time change)
```

Namecheap stays your **registrar** (where the domain is owned and renewed).
Cloudflare becomes your **DNS host** (where the domain's records live) and your
**web host**. WordPress.com gets removed from the picture entirely.

---

## Before you start

Have these three tabs open, and create the accounts if you don't have them:

| Account | Cost | Sign up |
|---|---|---|
| GitHub | Free | <https://github.com/signup> |
| Cloudflare | Free | <https://dash.cloudflare.com/sign-up> |
| Namecheap | Already yours | <https://www.namecheap.com/myaccount/login/> |

You'll also need **Git** on your Mac. Open Terminal (⌘-Space, type "Terminal")
and run:

```bash
git --version
```

If it prints a version number, you're set. If macOS offers to install
developer tools, accept — it takes a few minutes.

---

## Step 0 — A note about where this folder lives

This project currently sits inside your Google Drive folder. That works, but
Google Drive occasionally locks files while syncing, which can make the local
build stumble (you may see a harmless "cloud sync lock" note).

**This does not affect your live website at all** — Cloudflare builds from
GitHub, not from your Drive. But if you'd like the smoothest local experience,
you can move the folder once, before Step 1:

```bash
mkdir -p ~/Sites
mv ~/"Google Drive/My Drive/MasterFolder/Administrative/WorkWebsite" ~/Sites/miranencheva.com
cd ~/Sites/miranencheva.com
```

Your code will still be safely backed up — on GitHub, which is a better backup
for code than Drive is. Entirely optional; skip it if you'd rather not.

---

## Step 1 — Put the site on GitHub

### 1a. Create an empty repository

1. Go to <https://github.com/new>
2. **Repository name:** `miranencheva.com`
3. **Description:** `Personal academic website`
4. Choose **Public**. (Public is fine — it's a website — and it keeps
   GitHub Actions free. Private also works.)
5. **Do not** tick "Add a README", "Add .gitignore", or "Choose a license".
   The folder already has these; adding them here causes a conflict.
6. Click **Create repository**.

You'll land on a page showing setup commands. Leave it open.

### 1b. Push this folder to it

In Terminal, `cd` into this project folder. If you didn't move it in Step 0:

```bash
cd ~/"Google Drive/My Drive/MasterFolder/Administrative/WorkWebsite"
```

Then run these, one at a time. Replace `YOUR-USERNAME` with your GitHub username:

```bash
git init
git add .
git commit -m "New static site: initial version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/miranencheva.com.git
git push -u origin main
```

On `git push`, a browser window will ask you to authorise GitHub. Approve it.

> **If it asks for a password in Terminal:** GitHub no longer accepts account
> passwords. Easiest fix is to install GitHub CLI (`brew install gh`, then
> `gh auth login`), or create a Personal Access Token at
> <https://github.com/settings/tokens> and paste that as the password.

**Check it worked:** refresh your repository page. You should see `src/`,
`build.mjs`, `README.md`, and the rest. You should *not* see `node_modules/`
or `dist/` — those are intentionally excluded.

Within a minute a small ✓ or ✗ appears next to your commit. That's the
GitHub Actions check building your site. If it's a ✗, click it to see why —
but it should be green.

---

## Step 2 — Connect Cloudflare Pages to GitHub

This is the "CD" half of CI/CD. Once connected, every push deploys itself.

1. Go to <https://dash.cloudflare.com> and log in.
2. In the left sidebar: **Compute (Workers & Pages)** → **Pages** tab.
3. Click **Create application** → **Pages** → **Connect to Git**.
4. Click **Connect GitHub**. Authorise Cloudflare.
   - When GitHub asks which repositories to grant access to, you can pick
     **Only select repositories** → `miranencheva.com`. That's the safer choice.
5. Back in Cloudflare, select the `miranencheva.com` repository → **Begin setup**.
6. Fill in the build settings **exactly** as below:

   | Field | Value |
   |---|---|
   | Project name | `miranencheva` |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave empty)* |

7. Expand **Environment variables** and add one:

   | Variable name | Value |
   |---|---|
   | `NODE_VERSION` | `20` |

   This pins the Node version so builds stay reproducible.

8. Click **Save and Deploy**.

Watch the log scroll. It will install dependencies, run the build, and finish
with something like `Success: Your site was deployed!`. First build takes
2–3 minutes; later ones are faster.

**Check it worked:** Cloudflare gives you a URL like
`https://miranencheva.pages.dev`. Open it. Your new site should be live there.

> Your real domain still points at WordPress at this stage. That's expected —
> we change it in Step 4, once you're happy with how the site looks.

---

## Step 3 — Look at the site and fix anything you don't like

Right now is the ideal moment: the new site is viewable but nothing has
switched over yet, so there's no rush and no downtime risk.

Two things definitely need your attention:

**Your photo.** I couldn't download the one from your WordPress site, so
there's a grey placeholder. Save your real photo as
`src/images/mira-nencheva.jpg` (replacing the placeholder — keep that exact
filename). Any size works; ideally at least 1200px wide. The build
automatically produces AVIF, WebP and JPEG versions at three sizes.

**Three missing DOIs.** In `src/data/publications.json`, four entries have a
`"_todo"` note and an empty `"doi": ""`. Open each paper, copy its DOI (the
`10.xxxx/...` string), and paste it in. Then delete the `_todo` line. The
paper title turns into a link automatically.

To publish any change:

```bash
git add .
git commit -m "Add real photo and DOIs"
git push
```

Cloudflare notices the push and redeploys within about a minute. That's the
whole workflow, forever.

---

## Step 4 — Move DNS from WordPress.com to Cloudflare

Your domain is registered at **Namecheap**, but its nameservers currently point
at WordPress.com (`ns1.wordpress.com`, `ns2`, `ns3`). We're going to repoint
them at Cloudflare.

### 4a. Write down anything you'd lose

**Do this before changing anything.** If you have email on this domain, or any
other subdomain, those records live at WordPress.com right now and will
disappear when you switch.

In WordPress.com: **Upgrades → Domains → miranencheva.com → DNS records**.
Screenshot the whole list. Pay attention to any **MX** records (email) or
**TXT** records (domain verification). If there are none beyond WordPress's own
A/CNAME records, you have nothing to preserve.

### 4b. Add your domain to Cloudflare

1. In the Cloudflare dashboard, click **Add a domain** (top of the account home).
2. Enter `miranencheva.com`. Click **Continue**.
3. Choose the **Free** plan. Continue.
4. Cloudflare scans your existing DNS and shows what it found. Review it — if
   you had MX or TXT records in 4a, confirm they're listed here, and add any
   that are missing.
5. Continue. Cloudflare now shows you **two nameservers** that look like:

   ```
   xxxx.ns.cloudflare.com
   yyyy.ns.cloudflare.com
   ```

   **Copy both.** They're unique to your account. Keep this tab open.

### 4c. Change the nameservers at Namecheap

1. Go to <https://ap.www.namecheap.com/domains/list/>
2. Find `miranencheva.com`, click **MANAGE**.
3. Scroll to the **NAMESERVERS** section. It currently reads **Custom DNS**
   with the three `wordpress.com` entries.
4. Keep **Custom DNS** selected, then **replace** the WordPress entries with
   the two Cloudflare ones. Remove the third empty/extra row.
5. Click the green ✓ to save.

**Check it worked:** back in Cloudflare, click **Check nameservers now**.
Propagation usually takes 5–30 minutes, occasionally a few hours. Cloudflare
emails you when the domain becomes **Active**.

### 4d. Point the domain at your site

Once Cloudflare says the domain is Active:

1. Go to **Compute (Workers & Pages)** → your `miranencheva` project →
   **Custom domains** tab.
2. Click **Set up a custom domain**. Enter `miranencheva.com`. Confirm.
3. Repeat for `www.miranencheva.com`.

Cloudflare creates the DNS records and issues a free SSL certificate
automatically. Give it 2–15 minutes.

**Check it worked:** open <https://miranencheva.com> in a private browsing
window. You should see the new site with a padlock in the address bar.

### 4e. Force HTTPS and pick one canonical hostname

Two settings that matter for SEO — duplicate content across `http`/`https` and
`www`/non-`www` splits your ranking signals.

1. In Cloudflare, select your domain → **SSL/TLS** → **Overview**.
   Set encryption mode to **Full (strict)**.
2. **SSL/TLS → Edge Certificates** → turn on **Always Use HTTPS**.
3. **Rules → Redirect Rules** → **Create rule**:
   - Name: `www to apex`
   - When incoming requests match: **Custom filter expression**
   - Field `Hostname`, Operator `equals`, Value `www.miranencheva.com`
   - Then: **Dynamic redirect**, expression
     `concat("https://miranencheva.com", http.request.uri.path)`
   - Status code **301**, tick **Preserve query string**
   - Deploy.

Now `www.miranencheva.com` permanently redirects to `miranencheva.com`, which
is the address your `canonical` tags already declare.

---

## Step 5 — Turn off WordPress.com

Only after the new site has been live and correct for a few days.

1. WordPress.com → **Upgrades → Domains → miranencheva.com** → disconnect the
   domain from the WordPress site.
2. If you're paying for a WordPress.com plan you no longer need, cancel it.
3. **Do not** delete or transfer the domain at Namecheap. It's the thing
   holding your name.

Make sure Namecheap **auto-renew stays ON** (it currently is; expires
30 May 2027). Losing the domain would undo all the SEO work.

---

## Step 6 — Tell Google about the new site

This is what actually moves the needle on ranking for your name.

### 6a. Google Search Console

1. Go to <https://search.google.com/search-console> and sign in.
2. **Add property** → choose the **Domain** option (left box) → `miranencheva.com`.
3. Google gives you a **TXT record** to add. In Cloudflare: your domain →
   **DNS → Records → Add record** → Type `TXT`, Name `@`, Content = the string
   Google gave you. Save.
4. Back in Google, click **Verify**. (If it fails, wait 10 minutes and retry.)
5. Once verified: **Sitemaps** in the left menu → enter `sitemap.xml` → Submit.
6. Use **URL Inspection** on `https://miranencheva.com/` and click
   **Request indexing**. Repeat for `/research/` and `/publications/`.

Indexing typically takes a few days to a couple of weeks.

### 6b. Bing Webmaster Tools

<https://www.bing.com/webmasters> — you can import directly from Google Search
Console in two clicks. Worth doing; Bing also feeds DuckDuckGo and ChatGPT search.

### 6c. Link to yourself from places Google already trusts

This matters more than anything on the site itself. Backlinks from
high-authority domains are the strongest signal that `miranencheva.com` is the
real Mira Nencheva. Add or update the link on:

- Your **Stanford department profile page** (highest value — `.edu` domain)
- Your **Google Scholar** profile → Edit profile → Homepage field
- Your **ORCID** record (create one at <https://orcid.org> if you haven't —
  then add it to `src/site.json` under `profiles.orcid`)
- Your **lab pages**: Language and Cognition Lab, and the Gotlib lab
- **OSF** profile, **LinkedIn**, **Bluesky**, conference bios
- Your **email signature**

Each of these also becomes a `sameAs` entry in your structured data once you
fill it into `src/site.json`, which helps Google connect all your scholarly
identities to one person.

---

## Troubleshooting

**Cloudflare build fails with "command not found: npm"**
Framework preset must be **None** and build command exactly `npm run build`.
Re-check under Settings → Builds & deployments.

**Build fails on `sharp`**
Confirm the `NODE_VERSION` environment variable is set to `20` in the
Cloudflare project settings, then retry the deployment.

**Site shows Cloudflare error 522 or 1016**
The custom domain was added before the nameservers went Active. Remove the
custom domain in Pages, wait for Cloudflare to report Active, then re-add it.

**Old WordPress site still showing**
Your browser or your ISP is caching DNS. Try a private window, or a phone on
cellular data. Check what the rest of the world sees at
<https://www.whatsmydns.net/#NS/miranencheva.com>.

**Email stopped working**
An MX record didn't carry over. Add it back in Cloudflare → DNS → Records,
using the screenshot from Step 4a.

**I broke something and want to undo it**
Cloudflare Pages keeps every past deployment. Project → **Deployments** → find
a working one → **⋯** → **Rollback to this deployment**. Instant.

---

## Your day-to-day workflow from here

```bash
# 1. edit files in src/
# 2. preview locally (optional)
npm run build && npx serve dist

# 3. publish
git add .
git commit -m "describe what changed"
git push
```

That's it. Cloudflare handles the rest.
