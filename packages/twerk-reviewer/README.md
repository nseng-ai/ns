# twerk-reviewer

`twerk-reviewer` runs markdown-defined reviewers against the current branch
diff. Once you've chosen a harness, adding a new reviewer is literally adding
a markdown file under `reviews/`.

## Quick start

```bash
# Write a reviewer.
cat > reviews/demo.md <<'EOF'
---
description: Short description.
---

Flag issues.
EOF

# Run it against the current branch diff. If exactly one supported harness
# is on PATH, it's selected automatically.
reviewer review run demo
```

## CLI

```
reviewer harness list        # detect known harnesses on PATH
reviewer harness show        # print which harness would be used

reviewer review list         # enumerate reviews/**/*.md as keys
reviewer review run <key>    # resolve reviews/<key>.md, run it, print findings
```

Every operation also has a JSON form for machine consumers:

```bash
reviewer review run dignified-python --format json
reviewer harness list --format json
```

## Execution, models, and cost

Local runs execute one review definition by key:

```bash
reviewer review run dignified-python
reviewer review run dignified-python --model sonnet
```

CI discovers `reviews/**/*.md`, fans out one job per discovered reviewer key,
runs each reviewer against the PR diff, and posts the resulting findings back to
the PR. The workflow does not pass `--model`; it relies on each markdown review
definition's `default_model`. Adding more reviewer files therefore increases the
number of CI jobs and the potential model-provider cost for each PR run.

Model selection is intentionally explicit:

1. `reviewer review run <key> --model <model>`.
2. The review definition's `default_model` frontmatter field.
3. Failure asking the caller to pass `--model` or add `default_model`.

There is no package-wide fallback model. The current Claude Code adapter accepts
short aliases (`haiku`, `sonnet`, `opus`) plus full `claude-*` model names
supported by the installed Claude Code CLI. The shipped
`reviews/dignified-python.md` reviewer uses `default_model: haiku` as the cheap
CI dogfood default: it is intended for per-diff detection, with engineers doing
resolution in their normal higher-context workflow. Callers can opt into a
larger supported Claude model with `--model` for local runs or by changing a
review definition's `default_model`.

`twerk-reviewer` itself does not charge for execution; cost is charged by the
selected harness/model provider. When Claude Code reports usage,
`reviewer review run` prints token counts, total USD cost, duration, and turn
count in human output. `--format json` includes the same data under `usage`.
Costs scale with diff size, reviewer prompt length, model choice, cache
behavior, and the number of reviewers run in CI.

`twerk-reviewer` is detection-only. Reviewers inspect the supplied diff and emit
findings; they do not edit the repository. The Claude Code adapter is constrained
to read-only tools, and PR summary/inline comments are feedback surfaces rather
than automated remediation.

## Harness selection

`twerk-reviewer` does not know how to call an LLM directly. Each harness
(Claude Code, Codex, Pi, …) is driven through a small adapter that knows its
argv shape and stdout contract. The first-class adapter today is
**Claude Code**; adding others is a future slice.

Resolution order for which harness a review uses:

1. `--harness <name>` on the `review run` command.
2. `TWERK_REVIEWER_HARNESS` environment variable.
3. The single harness detected on `PATH`, if exactly one is available.
4. Failure — either no harness is on `PATH`, or more than one is and the
   choice is ambiguous.

The Claude Code adapter shells out in read-only review mode:

```
claude -p --output-format stream-json --verbose --bare --tools Bash,Read --model <model> --system-prompt ...
```

The review prompt is passed on stdin. `--bare` skips hooks, plugins, and
CLAUDE.md auto-discovery so reviews are fast and deterministic. The adapter uses
`--json-schema` for findings-mode runs so Claude Code returns structured
findings; it also reads Claude Code's terminal result event for usage/cost data
when that data is present.

## Review definition format

A reviewer is a markdown file under `reviews/` at the repo root. Nested
subdirectories are allowed: `reviews/python/typing.md` is key
`python/typing`. The reviewer `name` comes from the filename (without its
extension) — e.g. `dignified-python.md` becomes the reviewer named
`dignified-python`. The frontmatter holds structured metadata; everything
after the closing `---` fence becomes the reviewer's instructions.

```md
---
description: Review Python diffs for violations of the team's dignified Python standards.
default_model: sonnet
---

Concrete rules for the model. The adapter wraps these with a prompt that
asks the model to emit findings as JSON.
```

Required frontmatter fields:

- `description`

Optional frontmatter fields:

- `default_model` — used when the `--model` flag is not passed. If neither
  `--model` nor `default_model` is present, `reviewer review run` fails and asks
  for an explicit model.

The markdown body (after the closing fence) is required and becomes the
reviewer's `instructions`.

## Finding schema

Every review executor must emit JSON of this shape on stdout:

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

`line` may be `null` for file-level findings. `severity` is one of
`info`, `warning`, `error`. An empty `findings` array means the review
passed.

## PR comments in CI

The reviewer CI workflow keeps the summary comment as the complete aggregate
record for every finding. When GitHub can place a finding on a concrete PR diff
line, CI also attempts to post an inline review comment for that finding.

Inline comments require both a concrete `path` + `line` and GitHub acceptance
for that location in the PR diff. Some findings are therefore summary-only but
still valid, including:

- `line: null` file-level findings.
- Findings in files unchanged by the PR.
- Findings on lines outside the changed diff hunk.
- Binary or large files where GitHub omits patch metadata.
- Any finding from a run where GitHub rejects inline comment posting.

The summary comment includes an inline-posting status section with counts for
posted inline comments, duplicate inline comments skipped, summary-only
findings, and any inline-posting API error. Force-pushes can orphan or outdate
inline comments; stable inline markers reduce duplicate reposting, but they do
not fully solve that GitHub limitation.
