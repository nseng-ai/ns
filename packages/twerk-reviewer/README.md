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

## Default Model

gpt-5-mini
```

Required sections:

- `# <name>`
- `## Description`
- `## Instructions`

Optional sections:

- `## Default Model`

## CLI

```bash
reviewer review-local path/to/reviewer.md \
  --base-ref master \
  --model gpt-5-mini \
  --executor-command "./scripts/run-reviewer"
```

The JSON path is:

```bash
echo '{
  "review_path": "path/to/reviewer.md",
  "base_ref": "master",
  "model": "gpt-5-mini",
  "executor_command": "./scripts/run-reviewer"
}' | reviewer json review-local
```

## Executor Contract

`--executor-command` points at any local command that can run a review. The
reviewer package writes a JSON request to the executor's stdin:

```json
{
  "review_name": "Dignified Python",
  "review_description": "Review Python diffs for violations ...",
  "review_instructions": "Flag concrete issues ...",
  "model": "gpt-5-mini",
  "base_ref": "master",
  "diff_text": "diff --git ...",
  "prompt": "You are a code reviewer ..."
}
```

The executor must print JSON to stdout in this shape:

```json
{
  "findings": [
    {
      "path": "src/app.py",
      "line": 12,
      "severity": "warning",
      "summary": "Use pathlib instead of os.path",
      "details": "The new code calls os.path.join directly."
    }
  ]
}
```

It may also emit the clinkr-style success envelope:

```json
{
  "success": true,
  "findings": []
}
```
