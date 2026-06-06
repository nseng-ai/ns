# TypeScript stack

This is a loose profile for `roaster stack run typescript` over a Graphite/`gt`
stack of TypeScript changes. It points the stack workflow at TypeScript-focused
review findings before generating resolver branches. Current real mutation
boundaries are guarded; use `--dry-run` for routine local smoke checks.

## Loose conventions

- Run the `typescript-style` reviewer over the stack diff; it carries the
  team's strict TypeScript standards (erasable syntax, Zod boundary schemas,
  discriminated unions, errors-as-values, backend-neutral minimal core).
- Bias triage and resolver work toward type-safety, boundary validation, and
  fake-driven testing (gateway interfaces with in-memory fakes).
- Use `--target-branch` when the stack target is known by branch name.
- Use `--target-pr` when the stack target is known by pull request number or URL.
- Pass one or more `--reviewer` options to suggest reviewers the future orchestration should consider.
- Use `--triage-prompt` and `--resolver-prompt` to name or provide agent guidance for triage and resolver phases.

## Important parsing contract

Roaster does **not** deterministically parse this profile markdown. Headings, bullets, prose, and any frontmatter-like text are raw loose guidance for humans and future agent orchestration only. Deterministic workflow facts must come from CLI flags, checked code, or future typed configuration surfaces.
