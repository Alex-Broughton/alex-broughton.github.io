# alex-broughton.github.io

Personal academic site for Alex Broughton (KIPAC / SLAC). Plain static HTML, CSS and a
little vanilla JS — no build step, no framework, no dependencies to rot.

Live at <https://alex-broughton.github.io/>.

## Layout

```
index.html          Home — portrait, bio, affiliations, contact, links
research.html       Research areas + live publication list
outreach.html       Outreach & leadership
cv.html             Embedded + downloadable CV
css/style.css       All styling (Newsreader serif + Inter sans)
js/pubs.js          Renders data/publications.json; falls back to a live ORCID fetch
data/publications.json       Generated nightly — do not hand-edit
data/publications.seed.json  Hand-curated entries ORCID may not carry; merged in at build
scripts/build_publications.py  ORCID -> NASA ADS enrichment
cv/cv.pdf           Built automatically from Alex-Broughton/CV
docs/cv-sync.md     How the CV sync works and how to make it instant
```

## The two automations

**Publications** — `.github/workflows/publications.yml` runs nightly. It pulls the ORCID
record for `0000-0001-6966-5316`, matches each work to NASA ADS by DOI / arXiv id /
bibcode to recover full author lists, volume, pages and citation counts, and commits
`data/publications.json` when something changed.

> Requires a repo secret `ADS_TOKEN` — a NASA ADS API token from
> <https://ui.adsabs.harvard.edu/user/settings/token>. Without it the workflow still runs,
> but records come out ORCID-only (no author lists, no citation counts).

**CV** — `.github/workflows/cv.yml` checks out the CV repo, compiles `cv.tex` with TeX
Live, and commits `cv/cv.pdf`. Nightly by default; see [docs/cv-sync.md](docs/cv-sync.md)
to make it fire the moment you push your CV.

Both can be run on demand from the **Actions** tab.

## Adding a publication by hand

ORCID is the source of truth, so the right fix is usually to add the work there. For
anything ORCID cannot represent, append an entry to `data/publications.seed.json` —
it is merged into the generated list on the next build, deduplicated by DOI.

## Local preview

```sh
python3 -m http.server 8000
# http://localhost:8000
```

Opening the files directly with `file://` will not work: `js/pubs.js` fetches
`data/publications.json`, which browsers block on the file protocol.

## Editing content

Everything is in the HTML. The bio is in `index.html` under `.bio .prose`; research area
text in `research.html`; outreach blocks in `outreach.html`. The four SVG research icons
are inline in `research.html` and inherit `--accent`.

Design tokens — colors, fonts, measure — live in `:root` at the top of `css/style.css`.
