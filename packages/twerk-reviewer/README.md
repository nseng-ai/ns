# twerk-reviewer

`twerk-reviewer` is the first local slice of the reviewer objective: load a
markdown-defined reviewer, review the current branch diff, and emit structured
findings that a harness can inject back into session context.

## Review Definition Format

Add a reviewer by creating a markdown file with this shape:

```md
# Dignified Python

## Description

Review Python diffs for violations of the team's dignified Python standards.

## Instructions

Flag concrete issues in the diff. Focus on typing, LBYL-style error handling,
pathlib usage, and test seams.
```

Required sections:

- `# <name>`
- `## Description`
- `## Instructions`

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
