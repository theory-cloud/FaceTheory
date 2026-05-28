# Contributing to FaceTheory

FaceTheory is the client-delivery layer of the [Theory Cloud](https://github.com/theory-cloud) stack. It is pre-1.0 and under active development. Contributions are welcome, especially around the determinism contract, the adapter parity story, and the AWS-first deployment shape.

## Branch flow

FaceTheory uses the standard Theory Cloud three-branch flow:

```
feature/*  ──merge──▶  staging  ──merge PR──▶  premain  ──merge PR──▶  main
```

- **`staging`** — integration branch. Open feature PRs here.
- **`premain`** — prerelease branch. Release-Please opens `vX.Y.Z-rc.N` candidates from `premain`.
- **`main`** — stable release branch. Release-Please cuts `vX.Y.Z` releases from `main`.

After a stable release, `main` is back-merged into `staging`.

## Commit messages

FaceTheory uses [Conventional Commits](https://www.conventionalcommits.org/) driven by Release Please:

- `feat: ...` — minor bump
- `fix: ...` — patch bump
- `feat!: ...` / `fix!: ...` / `BREAKING CHANGE:` in body — flagged as breaking
- `docs: ...` / `test: ...` / `chore: ...` / `refactor: ...` / `style: ...` — no release

Scope when meaningful: `feat(ssr):`, `fix(isr):`, `feat(react):`, `fix(svelte):`, `fix(head):`, `docs(pages):`.

## Development

```bash
cd ts
npm ci
npm run typecheck
npm test
```

Run the relevant example before submitting changes that touch the public API:

```bash
npm run example:streaming:serve
npm run example:vite:vue:build && npm run example:vite:vue:serve
npm run example:vite:svelte:build && npm run example:vite:svelte:serve
```

Breaking an example without fixing the example in the same commit is a regression.

### Authoring documentation

Documentation lives under `docs/` and is published through GitHub Pages at <https://facetheory.theorycloud.ai/>. The site is a Jekyll build configured in `docs/_config.yml`; the framework-agnostic chrome (layouts, includes, CSS, JS) is shared across Theory Cloud frameworks.

#### Front matter convention

Every page Jekyll should render through the docs layout needs a minimal front matter block:

```markdown
---
title: Your Page Title
---

# Your H1 (optional — kramdown will still pick it up for the in-page TOC)
```

Files without front matter ship as static assets instead of rendered HTML — the `defaults: { layout: default }` block in `_config.yml` only fires when front matter is present.

Uppercase-named files (e.g. `ARCHITECTURE.md`) need an explicit `permalink:` so they're served at lowercase URLs:

```markdown
---
title: Architecture
permalink: /architecture/
---
```

The same applies to nested `README.md` files that should appear at clean URLs (e.g. `docs/cdk/README.md` uses `permalink: /cdk/`).

#### Where new pages slot in

Adding a new content page is a four-step change:

1. Create the markdown file under `docs/` with front matter.
2. Add an entry to a group in `docs/_data/nav.yml`:
   ```yaml
   - { id: my-page, title: My Page, url: /my-page/, icon: list-checks }
   ```
3. Append the entry's `id` to the `order:` list in `nav.yml` (drives prev/next pager).
4. Register the URL → id mapping in `url_to_id:` (drives sidebar active-link).

#### Callout pattern

Use the shared callout include for highlighted advisories:

```liquid
{% include callout.html type="info" %}
Inline body of the callout. Supports inline markdown.
{% endinclude %}
```

Available types follow the `_includes/callout.html` convention (`info`, `warning`, `success`, `danger`).

#### Local preview

Preview the site locally without installing Ruby on the host:

```bash
docker run --rm -p 4000:4000 \
  --volume="$PWD/docs:/srv/jekyll" --workdir=/srv/jekyll \
  ruby:3.3-slim sh -c "apt-get update -qq >/dev/null && \
  apt-get install -y -qq --no-install-recommends build-essential >/dev/null && \
  bundle install --quiet && \
  bundle exec jekyll serve --source . --destination ./_site \
    --host 0.0.0.0 --port 4000 --baseurl ''"
```

Browse `http://localhost:4000/`.

## Release discipline

- Never force-push to `main`, `premain`, or `staging`.
- Never amend a pushed commit.
- Never skip pre-commit hooks (`--no-verify`).
- Never retag a published release. Releases are immutable GitHub Releases.
- Never publish to npm. Distribution is GitHub Releases tarballs only.
- Never break an example in `ts/examples/` without fixing the example in the same commit.

## Code of conduct

Be kind. Assume good faith. When in doubt, ask.
