# twerk-reviewer

`twerk-reviewer` is the first local slice of the reviewer objective: load a
markdown-defined reviewer, review the current branch diff, and emit structured
findings that a harness can inject back into session context.

## Review Definition Format

Add a reviewer by creating a markdown file with YAML frontmatter. The
reviewer `name` comes from the filename (without its extension) — e.g.
`dignified-python.md` becomes the reviewer named `dignified-python`. The
frontmatter holds structured metadata; everything after the closing `---`
fence becomes the reviewer's instructions.

```md
---
description: Review Python diffs for violations of the team's dignified Python standards.
default_model: gpt-5-mini
---

Flag concrete issues in the diff. Focus on typing, LBYL-style error handling,
pathlib usage, and test seams.
```

Required frontmatter fields:

- `description`

Optional frontmatter fields:

- `default_model` — used when the `--model` flag is not passed.

The markdown body (after the closing fence) is required and becomes the
reviewer's `instructions`.

## CLI

```bash
reviewer review-local path/to/reviewer.md \
  --base-ref master \
  --model gpt-5-mini
```

The review executor is hardcoded to `claude -p` for this slice; a pluggable
executor will return later in the stack.

The JSON path is:

```bash
echo '{
  "review_path": "path/to/reviewer.md",
  "base_ref": "master",
  "model": "gpt-5-mini"
}' | reviewer json review-local
```
