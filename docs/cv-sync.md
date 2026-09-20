# Keeping the CV on the site in sync with the LaTeX source

The website never stores CV content — only a built PDF at `cv/cv.pdf`, produced by
`.github/workflows/cv.yml`. That workflow checks out
[`Alex-Broughton/CV`](https://github.com/Alex-Broughton/CV), compiles `cv.tex` with a
full TeX Live image, and commits the PDF here if the rendered text changed.

It runs:

| Trigger | Latency | Setup required |
| --- | --- | --- |
| Nightly cron (09:42 UTC) | up to 24 h | none — works out of the box |
| Manual run from the **Actions** tab | immediate | none |
| `repository_dispatch` from the CV repo | ~1 min after you push the CV | one token, below |

## Optional: update the site the moment you commit your CV

Add a token and a one-file workflow to the CV repo.

**1. Create a fine-grained personal access token**

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.

- Repository access: only `Alex-Broughton/alex-broughton.github.io`
- Permissions: **Contents → Read and write**
- Expiry: your call (a calendar reminder beats a surprise 403)

**2. Store it in the CV repo**

`Alex-Broughton/CV` → Settings → Secrets and variables → Actions → New repository secret

- Name: `SITE_DISPATCH_TOKEN`
- Value: the token

**3. Add this file to the CV repo** at `.github/workflows/notify-site.yml`:

```yaml
name: Notify website

on:
  push:
    branches: [main]
    paths: ["cv.tex", "pubs.bib", "talks.bib", "res.cls", "*.png"]

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Ask the website to rebuild the CV
        run: |
          curl -fsSL -X POST \
            -H "Accept: application/vnd.github+json" \
            -H "Authorization: Bearer ${{ secrets.SITE_DISPATCH_TOKEN }}" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            https://api.github.com/repos/Alex-Broughton/alex-broughton.github.io/dispatches \
            -d '{"event_type":"cv-updated"}'
```

That's it. `git push` in the CV repo, and a minute later the site is serving the new PDF.

## If the CV repo is private

Add a second fine-grained token with **Contents → Read** on `Alex-Broughton/CV`, store it
in *this* repo as `CV_TOKEN`, and uncomment the `token:` line in the "Checkout CV source"
step of `.github/workflows/cv.yml`.

## If the LaTeX build fails in CI

`cv.tex` needs `res.cls` (in the repo), plus `biblatex`, `academicons`, `orcidlink` and
`helvet` from TeX Live. The `xu-cheng/latex-action@v3` image ships the full scheme, so
these are present. If you add a package that isn't, the Actions log will name the missing
`.sty` — add it to the CV repo alongside `res.cls`, or pin a newer `texlive_version`.

## Local alternative (no CI)

If you would rather push the PDF yourself, a `post-commit` hook in the CV repo works too:

```sh
# Alex-Broughton/CV/.git/hooks/post-commit  (chmod +x)
#!/bin/sh
SITE=~/Desktop/projects/alex-broughton.github.io
latexmk -pdf -interaction=nonstopmode cv.tex >/dev/null 2>&1 || exit 0
cp cv.pdf "$SITE/cv/cv.pdf"
cd "$SITE" && git add cv/cv.pdf && git commit -m "cv: sync from CV repo" && git push
```

The CI route is the better default — it does not depend on your laptop having a working
TeX Live, and it keeps working when you edit the CV from anywhere else.
