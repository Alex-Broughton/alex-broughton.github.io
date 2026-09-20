#!/usr/bin/env python3
"""
Build data/publications.json for alex-broughton.github.io.

Sources, in order of authority:
  1. ORCID public API   -> the canonical list of works (what Alex claims)
  2. NASA ADS API       -> full author lists, venue, volume/pages, citations

ADS is queried by DOI / arXiv id / bibcode from the ORCID record; anything ADS
does not know about is still emitted, just without enrichment. If the ADS token
is absent the script degrades gracefully to ORCID-only output.

Env:
  ORCID_ID    default 0000-0001-6966-5316
  ADS_TOKEN   NASA ADS API token (repo secret); optional
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

ORCID_ID = os.environ.get("ORCID_ID", "0000-0001-6966-5316")
ADS_TOKEN = os.environ.get("ADS_TOKEN", "").strip()
OUT = Path(__file__).resolve().parents[1] / "data" / "publications.json"

ORCID_API = "https://pub.orcid.org/v3.0"
ADS_API = "https://api.adsabs.harvard.edu/v1/search/query"
ADS_FIELDS = "bibcode,title,author,year,pub,volume,page,doi,identifier,citation_count,doctype"

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "alex-broughton.github.io publication builder"


# --------------------------------------------------------------------------- #
# ORCID
# --------------------------------------------------------------------------- #

def orcid_works() -> list[dict]:
    r = SESSION.get(f"{ORCID_API}/{ORCID_ID}/works",
                    headers={"Accept": "application/json"}, timeout=60)
    r.raise_for_status()
    groups = r.json().get("group", [])

    works = []
    for g in groups:
        summaries = g.get("work-summary") or []
        if not summaries:
            continue
        s = summaries[0]

        ids = {}
        for ext in (g.get("external-ids") or {}).get("external-id", []):
            t = (ext.get("external-id-type") or "").lower()
            v = ext.get("external-id-value")
            if t and v and t not in ids:
                ids[t] = v

        year = (s.get("publication-date") or {}).get("year") or {}
        works.append({
            "title": ((s.get("title") or {}).get("title") or {}).get("value", "").strip(),
            "year": int(year["value"]) if year.get("value", "").isdigit() else None,
            "venue": ((s.get("journal-title") or {}) or {}).get("value", "") or "",
            "type": (s.get("type") or "").replace("-", " ").lower(),
            "doi": ids.get("doi"),
            "arxiv": ids.get("arxiv"),
            "bibcode": ids.get("bibcode"),
            "url": ((s.get("url") or {}) or {}).get("value") or None,
            "authors": [],
            "citations": None,
            "volume": None,
            "pages": None,
            "source": "orcid",
        })
    return [w for w in works if w["title"]]


# --------------------------------------------------------------------------- #
# NASA ADS
# --------------------------------------------------------------------------- #

def ads_query(q: str, rows: int = 25) -> list[dict]:
    if not ADS_TOKEN:
        return []
    for attempt in range(3):
        r = SESSION.get(
            ADS_API,
            params={"q": q, "fl": ADS_FIELDS, "rows": rows},
            headers={"Authorization": f"Bearer {ADS_TOKEN}"},
            timeout=60,
        )
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code >= 400:
            print(f"  ads: {r.status_code} for {q[:80]}", file=sys.stderr)
            return []
        return r.json().get("response", {}).get("docs", [])
    return []


def ads_all_by_orcid() -> dict[str, dict]:
    """Everything ADS associates with the ORCID iD, keyed by DOI and bibcode."""
    docs = ads_query(f'orcid:"{ORCID_ID}"', rows=200)
    index: dict[str, dict] = {}
    for d in docs:
        if d.get("doi"):
            for doi in d["doi"]:
                index[doi.lower()] = d
        if d.get("bibcode"):
            index[d["bibcode"].lower()] = d
        for ident in d.get("identifier", []):
            if ident.lower().startswith("arxiv:"):
                index[ident.lower().replace("arxiv:", "arxiv:")] = d
    return index


def merge(work: dict, doc: dict) -> None:
    if not doc:
        return
    work["authors"] = doc.get("author") or work["authors"]
    work["bibcode"] = doc.get("bibcode") or work["bibcode"]
    work["citations"] = doc.get("citation_count")
    work["venue"] = doc.get("pub") or work["venue"]
    work["volume"] = doc.get("volume")
    pages = doc.get("page")
    work["pages"] = pages[0] if isinstance(pages, list) and pages else (pages or None)
    if doc.get("year") and not work["year"]:
        work["year"] = int(doc["year"])
    if doc.get("doctype"):
        work["type"] = doc["doctype"]
    if doc.get("title") and not work["title"]:
        work["title"] = doc["title"][0]
    for ident in doc.get("identifier", []):
        if ident.lower().startswith("arxiv:") and not work["arxiv"]:
            work["arxiv"] = ident.split(":", 1)[1]
    work["source"] = "orcid+ads"


def enrich(works: list[dict]) -> None:
    if not ADS_TOKEN:
        print("ADS_TOKEN not set — emitting ORCID-only records.", file=sys.stderr)
        return

    index = ads_all_by_orcid()
    print(f"ads: {len(index)} identifier keys from orcid query", file=sys.stderr)

    for w in works:
        doc = None
        if w["doi"]:
            doc = index.get(w["doi"].lower())
        if not doc and w["bibcode"]:
            doc = index.get(w["bibcode"].lower())
        if not doc and w["arxiv"]:
            doc = index.get(f"arxiv:{w['arxiv']}".lower())

        if not doc:                                    # targeted lookup
            if w["doi"]:
                hits = ads_query(f'doi:"{w["doi"]}"', rows=1)
            elif w["arxiv"]:
                hits = ads_query(f'arxiv:"{w["arxiv"]}"', rows=1)
            else:
                safe = w["title"].replace('"', " ")
                hits = ads_query(f'title:"{safe}"', rows=1)
            doc = hits[0] if hits else None
            time.sleep(0.25)

        merge(w, doc)


# --------------------------------------------------------------------------- #

def main() -> int:
    seed_path = OUT.with_name("publications.seed.json")

    try:
        works = orcid_works()
        print(f"orcid: {len(works)} works", file=sys.stderr)
    except Exception as exc:                            # noqa: BLE001
        print(f"ORCID fetch failed: {exc}", file=sys.stderr)
        if seed_path.exists():
            print("falling back to seed file; leaving existing data in place", file=sys.stderr)
            return 0
        return 1

    if not works:
        print("ORCID returned no works — refusing to overwrite existing data.", file=sys.stderr)
        return 0

    enrich(works)

    # Merge in any hand-curated seed entries ORCID does not carry.
    if seed_path.exists():
        seen = {(w.get("doi") or w.get("title", "")).lower() for w in works}
        for extra in json.loads(seed_path.read_text()).get("publications", []):
            key = (extra.get("doi") or extra.get("title", "")).lower()
            if key and key not in seen:
                extra.setdefault("source", "seed")
                works.append(extra)
                seen.add(key)

    works.sort(key=lambda w: (w.get("year") or 0, w.get("title") or ""), reverse=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "orcid": ORCID_ID,
        "count": len(works),
        "publications": works,
    }, indent=2, ensure_ascii=False) + "\n")

    print(f"wrote {OUT} ({len(works)} records)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
