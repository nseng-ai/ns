# roaster

`roaster` is a CI-only PR-diff findings runner. GitHub Actions discovers markdown reviewers under `reviews/`, runs each reviewer against the pull request diff through Claude Code, and posts findings back to the PR as an aggregate summary comment plus best-effort inline comments.

## Supported CLI surface

```bash
roaster review list          # enumerate CI review definitions under reviews/
roaster review run <key>     # run one reviewer against the current PR/current-branch diff
```

Hidden CI helpers used by `.github/workflows/roaster.yml` live under `roaster exec`:

```bash
roaster exec post-inline-findings
roaster exec format-findings-comment
roaster exec post-findings-comment
```

Non-diff targets, additive local context, prose review mode, changed-path local selection, public harness commands, and local/manual roast orchestration are intentionally unsupported in this narrowed CI slice.

## GitHub Actions flow

The checked-in workflow discovers all review definitions:

```bash
uv run roaster review list --format json
```

For each key, CI resolves the PR base ref and runs a structured findings review:

```bash
uv run roaster review run "$REVIEW_KEY" --base-ref "$BASE_REF" --format json
```

The JSON envelope is then passed to hidden exec helpers that attempt inline PR comments first, render the summary comment, and create/update the PR discussion comment before the job exits with the original review status.

## Review definition format

A reviewer is a markdown file under `reviews/` at the repo root. The key is the file path without `.md`, relative to `reviews/`.

```md
---
description: Review Python diffs for violations of team standards.
default_model: haiku
---

Concrete review instructions for the model.
```

Required frontmatter:

- `description`

Optional frontmatter:

- `default_model` — used when `roaster review run` is called without `--model`.
- `applies_to` — path applicability as `{ include: [repo-relative globs], exclude?: [repo-relative globs] }`.

All definitions under `reviews/` are CI reviewers. The previous local/manual filtering metadata is no longer part of the format.

## Finding schema

Reviewers emit structured diff findings:

```json
{
  "findings": [
    {
      "path": "src/app.py",
      "line": 12,
      "severity": "warning",
      "summary": "Use pathlib instead of os.path",
      "details": "Line 12 joins paths with os.path.join."
    }
  ]
}
```

`line` may be `null` for file-level findings. `severity` is one of `info`, `warning`, or `error`. An empty `findings` array means the review passed.

## Project config

`roaster` still reads project-level diff exclusions from the repository root `asdl.toml`:

```toml
[roaster.diff]
exclude = [
  ".agents/skills/**/*.py",
  ".claude/skills/**/*.py",
]
```

These repo-relative glob patterns are converted to Git pathspec excludes before assembling the reviewer prompt, so excluded paths never enter model input.

## PR comments in CI

The summary comment is the complete aggregate record for every finding. When GitHub can place a finding on a concrete PR diff line, CI also attempts to post an inline review comment.

Summary-only findings remain valid when `line` is `null`, GitHub omits patch metadata, the line is outside the changed hunk, or GitHub rejects the inline comment request.
