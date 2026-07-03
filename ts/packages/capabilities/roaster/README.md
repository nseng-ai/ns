# @ji/roaster

Roaster runs configured, read-only code reviews against the current PR diff and records structured findings. In this repo the canonical command face is:

```bash
ji roaster ...
```

## Review definitions

Review definitions live in `.ji/reviews/<key>/review.md`. The key is the direct child folder name under `.ji/reviews`; for example `.ji/reviews/sdl-typescript-style-tripwire/review.md` is `sdl-typescript-style-tripwire`. Roaster loads only direct child `review.md` files, so colocated files such as `references/*.md` are review assets rather than review definitions.

A definition is a Markdown file with YAML frontmatter followed by the review instructions:

```md
---
description: |
  Short human-readable description shown by `ji roaster review list`.
model_profile: quick
local_only: false
applies_to:
  include:
    - "**/*.ts"
  exclude:
    - ".agents/skills/**"
---

Review only the supplied diff...
```

Frontmatter fields:

- `description` — required non-empty string.
- `model_profile` — optional non-empty string; defaults to `quick`. Current display groups `quick` as a tripwire and other profiles such as `deep` as deep reviews. `ji roaster review run --model-profile ...` can override it for one run.
- `local_only` — optional boolean; defaults to `false`. Set `true` only for reviews that must never run in CI. CI discovery uses `ji roaster review list --ci`, which excludes `local_only: true` definitions.
- `applies_to.include` — optional list of repo-relative glob patterns. When present, `ji roaster review list --applicable` selects the review only when the diff touches a matching path.
- `applies_to.exclude` — optional list of repo-relative glob patterns removed from applicability. Use this for vendored skill directories or generated areas.

Applicability patterns must be globs, not git pathspecs; keep them repo-relative and do not use `..` segments.

## Local operation

List all configured reviews:

```bash
ji roaster review list
```

List the reviews that CI would consider, before path applicability:

```bash
ji roaster review list --ci
```

List the CI-enabled reviews applicable to the current diff against a base branch:

```bash
ji roaster review list --ci --applicable --base-ref main
```

Run one review locally:

```bash
ji roaster review run <review-key> --base-ref main
```

Useful checks after editing a review definition:

```bash
dprint check .ji/reviews/<review-key>/review.md
ji roaster review list --ci --format json
ji roaster review list --ci --applicable --base-ref main --format json
```

## CI operation

The GitHub Actions workflow is `.github/workflows/roaster.yml`.

Discovery job:

1. Resolves the PR base ref.
2. Fetches `origin/<base-ref>`.
3. Runs:

   ```bash
   ji roaster review list --ci --applicable --base-ref "$BASE_REF" --format json
   ```

4. Uses `.data.keys` as the review matrix.

Review job:

1. Installs the TypeScript workspace and Claude Code CLI.
2. Runs each selected review with:

   ```bash
   ji roaster review run "$REVIEW_KEY" \
     --base-ref "$BASE_REF" \
     --log-branch "$GITHUB_HEAD_REF" \
     --format json
   ```

3. Pipes the result envelope to `ji roaster exec publish-findings` so findings are posted to the PR summary comment and inline comments when possible.

Operational notes:

- CI requires `ANTHROPIC_API_KEY` for review execution and uses `GITHUB_TOKEN` for PR publication.
- Draft PRs and forked PRs are skipped by the workflow guard.
- A review definition appears in CI only when `local_only` is omitted or set to `false` and its `applies_to` globs match the current diff when `--applicable` is used.
- Review logs are written to Branch Memory under the `roaster` namespace, keyed as `reviews/<review-key>/...`; inspect them with `ji roaster review log`.
