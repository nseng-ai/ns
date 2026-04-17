# twerk-reviewer

`twerk-reviewer` runs markdown-defined reviewers against the current branch
diff. Once you've chosen a harness, adding a new reviewer is literally adding
a markdown file under `reviews/`.

## Quick start

```bash
# One-time: detect available harnesses, pick one, persist the choice.
reviewer harness init

# Write a reviewer.
echo '# Demo\n## Description\nShort description.\n## Instructions\nFlag issues.' \
  > reviews/demo.md

# Run it against the current branch diff.
reviewer review run demo
```

## CLI

```
reviewer harness list        # detect known harnesses on PATH
reviewer harness init        # interactive: pick a harness, persist to .twerk/reviewer.toml
reviewer harness show        # print the persisted harness

reviewer review list         # enumerate reviews/**/*.md as keys
reviewer review run <key>    # resolve reviews/<key>.md, run it, print findings
```

Every operation also has a JSON form for machine consumers:

```bash
echo '{"key": "dignified-python"}' | reviewer review json run
reviewer harness json list
```

## Harness selection

`twerk-reviewer` does not know how to call an LLM directly. Each harness
(Claude Code, Codex, Pi, …) is driven through a small adapter that knows its
argv shape and stdout contract. The first-class adapter today is
**Claude Code**; adding others is a future slice.

Resolution order for which harness a review uses:

1. `--harness <name>` on the `review run` command.
2. `TWERK_REVIEWER_HARNESS` environment variable.
3. The persisted `.twerk/reviewer.toml` (written by `reviewer harness init`).
4. Failure pointing at `reviewer harness init`.

The Claude Code adapter shells out to:

```
claude -p --output-format json --bare --model <model> "<prompt>"
```

`--bare` skips hooks, plugins, and CLAUDE.md auto-discovery so reviews are
fast and deterministic. `-p --output-format json` returns the model's
response as JSON; the adapter then parses the model's text as
`{"findings": [...]}`.

## Review definition format

A reviewer is a markdown file under `reviews/` at the repo root. Nested
subdirectories are allowed: `reviews/python/typing.md` is key
`python/typing`.

```md
# Dignified Python

## Description

Short, one-paragraph summary of what this reviewer checks.

## Instructions

Concrete rules for the model. The adapter wraps these with a prompt that
asks the model to emit findings as JSON.

## Default Model

sonnet
```

Required sections:

- `# <name>` — the reviewer's display name.
- `## Description`
- `## Instructions`

Optional:

- `## Default Model` — used when `--model` is not passed.

## Config file

`.twerk/reviewer.toml` lives at the repo root (each git worktree gets its
own copy). Written by `reviewer harness init`, read by `review run`:

```toml
schema_version = 1

[harness]
name = "claude-code"
```

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
