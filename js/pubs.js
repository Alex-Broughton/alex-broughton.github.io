/* ------------------------------------------------------------------
   pubs.js — renders data/publications.json
   The JSON is regenerated nightly by .github/workflows/publications.yml
   (ORCID -> NASA ADS enrichment). If that file is missing or stale, the
   page falls back to a live ORCID fetch in the browser.
   ------------------------------------------------------------------ */

const ORCID_ID = '0000-0001-6966-5316';

/* Surname variants that should be bolded in author lists. */
const ME = [/^broughton,?\s*(a(lex(ander)?)?\.?)?$/i, /^(alex(ander)?\.?\s+)?broughton$/i];

const AUTHOR_CUTOFF = 12;   // collapse author lists longer than this

const state = { pubs: [], filter: 'all' };

/* ---------------- helpers ---------------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function isMe(name) {
  const n = String(name).replace(/\s+/g, ' ').trim();
  return ME.some((re) => re.test(n));
}

/* "Broughton, Alex" -> "A. Broughton" ; leave already-short forms alone */
function shortName(name) {
  const n = String(name).trim();
  if (n.includes(',')) {
    const [last, first = ''] = n.split(',');
    const initials = first.trim().split(/[\s.]+/).filter(Boolean)
      .map((p) => p[0].toUpperCase() + '.').join(' ');
    return (initials ? initials + ' ' : '') + last.trim();
  }
  const parts = n.split(/\s+/);
  if (parts.length < 2) return n;
  const last = parts.pop();
  return parts.map((p) => p[0].toUpperCase() + '.').join(' ') + ' ' + last;
}

function authorHTML(authors, uid) {
  if (!authors || !authors.length) return '';
  const spans = authors.map((a) =>
    isMe(a) ? `<span class="me">${esc(shortName(a))}</span>` : esc(shortName(a)));

  if (spans.length <= AUTHOR_CUTOFF) return spans.join(', ');

  /* Always keep Alex visible even when collapsing. */
  const meIdx = authors.findIndex(isMe);
  const head = spans.slice(0, AUTHOR_CUTOFF);
  if (meIdx >= AUTHOR_CUTOFF) head[AUTHOR_CUTOFF - 1] = spans[meIdx];

  return `<span data-short="${uid}">${head.join(', ')}` +
    ` <button type="button" class="etal-toggle" data-expand="${uid}">` +
    `+ ${spans.length - AUTHOR_CUTOFF} more</button></span>` +
    `<span data-full="${uid}" hidden>${spans.join(', ')}` +
    ` <button type="button" class="etal-toggle" data-collapse="${uid}">show fewer</button></span>`;
}

function typeOf(p) {
  const t = (p.type || '').toLowerCase();
  if (/proceed|conference|spie/.test(t)) return 'proceedings';
  if (/preprint|arxiv|working/.test(t)) return 'preprint';
  if (/software|data/.test(t)) return 'other';
  return 'article';
}

function venueHTML(p) {
  const bits = [];
  if (p.venue) bits.push(`<em>${esc(p.venue)}</em>`);
  const vp = [p.volume && `<b style="font-weight:600">${esc(p.volume)}</b>`, p.pages && esc(p.pages)]
    .filter(Boolean).join(', ');
  if (vp) bits.push(`<span>${vp}</span>`);

  const links = [];
  if (p.doi) links.push(`<a href="https://doi.org/${encodeURIComponent(p.doi)}" rel="noopener">DOI</a>`);
  if (p.arxiv) links.push(`<a href="https://arxiv.org/abs/${encodeURIComponent(p.arxiv)}" rel="noopener">arXiv</a>`);
  if (p.bibcode) links.push(`<a href="https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(p.bibcode)}/abstract" rel="noopener">ADS</a>`);

  let html = bits.join(' <span class="dot">·</span> ');
  if (links.length) html += (html ? ' <span class="dot">·</span> ' : '') + links.join(' <span class="dot">·</span> ');
  if (Number.isFinite(p.citations) && p.citations > 0) {
    html += ` <span class="cites" title="Citations (NASA ADS)">${p.citations} cites</span>`;
  }
  return html;
}

/* ---------------- render ---------------- */

function render() {
  const host = document.getElementById('pubs');
  const list = state.filter === 'all'
    ? state.pubs
    : state.pubs.filter((p) => typeOf(p) === state.filter);

  if (!list.length) {
    host.innerHTML = '<p class="pub-status">No publications in this category.</p>';
    return;
  }

  const years = [...new Set(list.map((p) => p.year || '—'))]
    .sort((a, b) => (b === '—' ? -1 : a === '—' ? 1 : b - a));

  let n = list.length;
  let html = '';
  for (const y of years) {
    html += `<h3 class="pub-year">${esc(y)}</h3><ol class="pub-list">`;
    for (const p of list.filter((q) => (q.year || '—') === y)) {
      const uid = 'p' + n;
      const title = p.url || (p.doi ? `https://doi.org/${p.doi}` : null);
      html += `<li class="pub">
        <div class="idx">${n--}</div>
        <div>
          <h4 class="pub-title">${title
            ? `<a href="${esc(title)}" rel="noopener">${esc(p.title)}</a>`
            : esc(p.title)}</h4>
          <p class="pub-authors">${authorHTML(p.authors, uid)}</p>
          <p class="pub-venue">${venueHTML(p)}</p>
        </div>
      </li>`;
    }
    html += '</ol>';
  }
  host.innerHTML = html;
}

/* ---------------- fallback: live ORCID ---------------- */

async function fetchFromOrcid() {
  const r = await fetch(`https://pub.orcid.org/v3.0/${ORCID_ID}/works`,
    { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('ORCID ' + r.status);
  const d = await r.json();
  return (d.group || []).map((g) => {
    const s = g['work-summary'][0];
    const ids = {};
    for (const id of (s['external-ids'] || {})['external-id'] || []) {
      ids[id['external-id-type']] = id['external-id-value'];
    }
    return {
      title: s.title?.title?.value || 'Untitled',
      year: Number(s['publication-date']?.year?.value) || null,
      venue: s['journal-title']?.value || '',
      type: s.type || '',
      doi: ids.doi || null,
      arxiv: ids.arxiv || null,
      url: s.url?.value || null,
      authors: [],
    };
  }).sort((a, b) => (b.year || 0) - (a.year || 0));
}

/* ---------------- boot ---------------- */

(async function init() {
  const meta = document.getElementById('pub-meta');
  try {
    const r = await fetch('data/publications.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('no cache file');
    const d = await r.json();
    state.pubs = d.publications || [];
    const when = d.generated ? new Date(d.generated) : null;
    meta.textContent = `${state.pubs.length} records` +
      (when ? ` · updated ${when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}` : '');
  } catch (e) {
    try {
      state.pubs = await fetchFromOrcid();
      meta.textContent = `${state.pubs.length} records · live from ORCID`;
    } catch (e2) {
      document.getElementById('pubs').innerHTML =
        `<p class="pub-status">Publication list unavailable right now — see the
         <a href="https://ui.adsabs.harvard.edu/search/q=orcid%3A${ORCID_ID}">NASA ADS library</a>
         or <a href="https://orcid.org/${ORCID_ID}">ORCID record</a>.</p>`;
      meta.textContent = '';
      return;
    }
  }
  render();
})();

/* filters + author expansion (delegated) */
document.addEventListener('click', (ev) => {
  const f = ev.target.closest('.pub-filters button');
  if (f) {
    state.filter = f.dataset.filter;
    document.querySelectorAll('.pub-filters button')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
    render();
    return;
  }
  const exp = ev.target.closest('[data-expand]');
  if (exp) {
    const id = exp.dataset.expand;
    document.querySelector(`[data-short="${id}"]`).hidden = true;
    document.querySelector(`[data-full="${id}"]`).hidden = false;
    return;
  }
  const col = ev.target.closest('[data-collapse]');
  if (col) {
    const id = col.dataset.collapse;
    document.querySelector(`[data-full="${id}"]`).hidden = true;
    document.querySelector(`[data-short="${id}"]`).hidden = false;
  }
});
