# roaster

`roaster` runs markdown-defined reviewers against a target. The default target
is the current branch diff; callers can also supply a UTF-8 document/artifact
with `--file` or `--stdin`. Once you've chosen a harness, adding a new reviewer
is literally adding a markdown file under `reviews/`.

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
roaster review run demo

# Run a target-polymorphic adversarial reviewer against a document/artifact.
roaster review run adversarial --file plan.md --target-kind document --review-format findings
roaster review run adversarial --stdin --target-kind document --context "This is an implementation plan."
```

## CLI

```
roaster harness list        # detect known harnesses on PATH
roaster harness show        # print which harness would be used

roaster review list          # enumerate reviews/**/*.md as keys
roaster review list-matching # list reviews whose when_changed globs match the current diff
roaster review run <key>     # resolve reviews/<key>.md, run it, print findings
```

Every operation also has a JSON form for machine consumers:

```bash
roaster review run dignified-python --format json
roaster harness list --format json
```

## Review targets and additive context

`roaster review run <key>` reviews the current branch diff unless a document
source is supplied. Document targets are local-output only in this slice; roaster
does not publish document findings as GitHub PR inline comments or CI comments.

```bash
roaster review run simplify                         # reviews the current branch diff
roaster review run adversarial --file plan.md --target-kind document --review-format findings
roaster review run adversarial --stdin --target-kind document --context "This is an implementation plan."
```

Target options:

- `--file <path>` reads a UTF-8 document/artifact file.
- `--stdin` reads a UTF-8 document/artifact from stdin.
- `--target-kind document` is optional when `--file` or `--stdin` is supplied;
  `diff` remains the default without document input.
- `--base-ref` is valid only for diff targets.

Additive context options:

- `--context <text>` adds inline invocation context and may be repeated.
- `--context-file <path>` reads UTF-8 context from a file and may be repeated.

Context can narrow focus or provide background facts, but it cannot override the
reviewer instructions, target guidance, output schema, or materiality rules.
When a document target is run with a reviewer that appears diff-specific,
roaster emits a deterministic warning but still runs the review.

## Orchestration

`roaster` no longer owns multi-branch stack orchestration. Use planning and
agent workflows outside roaster for multi-branch remediation; roaster remains
focused on running markdown-defined reviews and harness operations.

## Project config

`roaster` reads project-level diff exclusions from the repository root `asdl.toml`:

```toml
[roaster.diff]
exclude = [
  ".agents/skills/**/*.py",
  ".claude/skills/**/*.py",
]
```

These are plain repo-relative glob patterns. `roaster` converts them to Git pathspec excludes before assembling the reviewer prompt, so excluded paths never enter the model input.

## Harness selection

`roaster` runs parsed review definitions through a unified harness
runtime. The runtime owns prompt assembly, harness detection, model support,
subprocess invocation, progress events, and stdout parsing. The first-class
harness today is **Claude Code**; adding others is a future slice.

Resolution order for which harness a review uses:

1. `--harness <name>` on the `review run` command.
2. `ASDL_ROASTER_HARNESS` environment variable.
3. The single harness detected on `PATH`, if exactly one is available.
4. Failure — either no harness is on `PATH`, or more than one is and the
   choice is ambiguous.

The Claude Code harness shells out with `-p --bare`, passes the assembled
review prompt on stdin, and uses read-only tools (`Bash,Read`). Findings mode
uses `--output-format json` with a target-aware structured-output JSON schema;
text mode uses `--output-format stream-json --verbose` and omits that schema.
The runtime parses Claude's terminal `result` event and usage metadata.

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
when_changed:
  - "**/*.py"
---

Concrete rules for the model. The adapter wraps these with a prompt that
asks the model to emit findings as JSON.
```

Required frontmatter fields:

- `description`

Optional frontmatter fields:

- `default_model` — used when the `--model` flag is not passed.
- `when_changed` — a list of repo-relative glob patterns. `roaster review
  list-matching` selects the review only when at least one changed path in the
  current branch diff matches one of these patterns. Omit this field for
  reviewers that should always be selected. Callers can then run selected keys
  with `roaster review run <key>`.

The markdown body (after the closing fence) is required and becomes the
reviewer's `instructions`.

## Finding schema

In findings mode, diff targets preserve the legacy finding shape:

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

`line` may be `null` for file-level findings. Existing diff consumers continue
to receive `path` and `line`.

Document targets use generalized locations:

```json
{
  "findings": [
    {
      "location": {"kind": "global"},
      "severity": "warning",
      "summary": "Plan omits rollback",
      "details": "Add the rollback or retry strategy."
    },
    {
      "location": {
        "kind": "text_anchor",
        "text": "Ship it safely.",
        "section": "Rollout"
      },
      "severity": "info",
      "summary": "Clarify safety evidence",
      "details": "Name the validation command or observable signal."
    }
  ]
}
```

Document locations are either `global` for whole-artifact findings or
`text_anchor` for exact text from the reviewed document. `severity` is one of
`info`, `warning`, `error`. An empty `findings` array means the review passed.

## PR comments in CI

The roaster CI workflow keeps the summary comment as the complete aggregate
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
