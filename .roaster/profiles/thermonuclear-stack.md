# Thermonuclear stack

This is a sample loose profile for `roaster stack run thermonuclear-stack` dry-run usage.
The `roaster stack` workflow is Graphite/`gt`-explicit: it is meant to reason
about a stack of PRs/branches, not a single isolated review. Current real
mutation boundaries are guarded; use dry-run for routine local smoke checks.

## Loose conventions

- Use `--target-branch` when the stack target is known by branch name.
- Use `--target-pr` when the stack target is known by pull request number or URL.
- Pass one or more `--reviewer` options to suggest reviewers the future orchestration should consider.
- Use `--triage-prompt` and `--resolver-prompt` to name or provide agent guidance for triage and resolver phases.

## Important parsing contract

Roaster does **not** deterministically parse this profile markdown. Headings, bullets, prose, and any frontmatter-like text are raw loose guidance for humans and future agent orchestration only. Deterministic workflow facts must come from CLI flags, checked code, or future typed configuration surfaces.
