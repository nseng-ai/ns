---
name: dev-preview-url
description: "Command: dev-preview-url"
allowed-tools:
  - "Bash(asdl-dev preview-url*)"
metadata:
  internal: true
---

# dev-preview-url

Print the Vercel preview URL for a branch by delegating to the shared `asdl-dev preview-url` CLI. This is the cross-harness path for `/dev:preview-url`; Pi only adds command ergonomics.

## When to use

Use when the user asks for the Vercel preview URL for the current branch or for an explicitly named branch in this repo.

## Workflow

Default to the current git branch:

```bash
asdl-dev preview-url
```

For an explicit branch:

```bash
asdl-dev preview-url --branch <branch>
```

For machine-readable output:

```bash
asdl-dev preview-url --branch <branch> --json
```

## Options and defaults

- `--branch TEXT`: branch to look up; defaults to the current git branch.
- `--project TEXT`: Vercel project; defaults to `VERCEL_PROJECT`, `.vercel/project.json`, then `asdl-tools`.
- `--scope TEXT`: Vercel scope/team; defaults to `VERCEL_SCOPE`, then `schrockns-projects`.
- `--json`: emit machine-readable JSON on stdout, including failures.

## Failure handling

If the CLI reports no deployment, missing Vercel CLI/auth, detached HEAD, or a lookup failure, surface the CLI output directly. Do not reimplement Vercel lookup logic in the skill.
