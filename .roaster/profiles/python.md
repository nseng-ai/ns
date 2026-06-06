# Python stack

This is a loose profile for `roaster stack run python` over a Graphite/`gt`
stack of Python changes. It points the stack workflow at Python-focused review
findings before generating resolver branches. Current real mutation boundaries
are guarded; use `--dry-run` for routine local smoke checks.

## Loose conventions

- Run the `dignified-python` reviewer over the stack diff; it carries the
  team's production Python standards (modern `str | None` type syntax, LBYL
  over EAFP, pathlib, frozen dataclasses/Pydantic for data).
- Bias triage and resolver work toward typing, correctness, and test
  architecture (gateway interfaces and fakes over `unittest.mock`).
- Use `--target-branch` when the stack target is known by branch name.
- Use `--target-pr` when the stack target is known by pull request number or URL.
- Pass one or more `--reviewer` options to suggest reviewers the future orchestration should consider.
- Use `--triage-prompt` and `--resolver-prompt` to name or provide agent guidance for triage and resolver phases.

## Important parsing contract

Roaster does **not** deterministically parse this profile markdown. Headings, bullets, prose, and any frontmatter-like text are raw loose guidance for humans and future agent orchestration only. Deterministic workflow facts must come from CLI flags, checked code, or future typed configuration surfaces.
