# gh-stack provider contract evidence

This package targets the official `github/gh-stack` provider. The representative fixtures in
`test/fixtures/` are sanitized, minimal structural fixtures. They are not claimed to have been
produced by `gh stack init` in this repository.

Evidence was revalidated on 2026-03-16:

- `gh stack --version` returned `gh stack version 0.1.0`.
- `gh stack view --help` described the current stack and `--json`; it did not provide repository-wide inventory.
- `gh api 'repos/{owner}/{repo}/stacks' --paginate --slurp` returned `[[]]` in the ns repository.
- A bare noninteractive `gh stack init` in a disposable repository exited 5 with
  `interactive input required; provide branch names as arguments`; it did not generate a local fixture.

Structural compatibility was checked read-only against the installed provider's source contract:

- local state is JSON at `<git-common-dir>/gh-stack`, with `schemaVersion`, `stacks`, stack `id`/`number`,
  `trunk.branch`, ordered `branches`, and optional `pullRequest` references;
- the Stacks endpoint returns stack `id`, repository-scoped `number`, `base.ref`, `created_at`, and ordered
  `pull_requests` with number, state, merge time, and `head.ref`;
- API pagination with `--slurp` produces an array of pages, which the adapter flattens.

Parsing is structural and additive: unknown fields and unfamiliar schema-version values are accepted when
all consumed fields remain safe. Missing or malformed consumed structure is rejected.
