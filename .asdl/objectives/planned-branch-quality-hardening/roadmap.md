# Roadmap

## Work

- [ ] Canonical saved-plan resolver
  - Extract one validated saved-plan/session/latest resolver for the current checkout.
  - Use it from both `/planned-branch:create` and `/cmux-slot:dispatch-plan`.
  - Evidence: tests reject outside-plan-store session evidence, wrong repo metadata, and wrong source branch/branch key where applicable.

- [ ] Planned-branch-owned operation model for CMUX composition
  - Move branch/key derivation, dry-run/preview evidence, create parameters, and planned-branch evidence formatting behind planned-branch-owned helpers.
  - Keep CMUX focused on slot checkout and workspace launch after planned-branch creation succeeds.
  - Evidence: CMUX tests assert composition behavior without re-encoding brmem/git/gt command internals unnecessarily.

- [ ] Unified Branch Memory envelope parsing
  - Route `brmem put`, `brmem list`, and `brmem get` through one strict machine-envelope parser.
  - Keep operation-specific body validators small and typed.
  - Evidence: parser tests cover invalid JSON, missing/nonzero `exit_code`, malformed `data`, and namespace/branch/key mismatches consistently.

- [ ] CLI and type-contract cleanup
  - Replace optional evidence bags and casts with discriminated unions for plan resolution and similar variants.
  - Make expected CLI parse failures return structured parse errors rather than throwing through the top-level catch.
  - Evidence: TypeScript check passes without casts for these variants; CLI scenario tests still cover human and JSON failure output.

- [ ] Shared content-slug derivation
  - Collapse planned-branch slug and saved-plan filename slug derivation into one reusable helper parameterized by semantic label, prompt wording, and failure text.
  - Evidence: existing slug tests pass with reduced duplication and no divergent normalization/validation paths.

- [ ] Semantic gateway boundary for planned-branch core
  - Introduce planned-branch-owned semantic gateways or equivalent adapters for Git facts/branch creation, Branch Memory attachment/loading, and Graphite tracking.
  - Move raw command construction and stdout parsing out of core workflow functions and into real adapters plus focused adapter tests.
  - Evidence: core tests use stateful semantic fakes; adapter tests preserve exact command protocol expectations.

- [ ] Public skills and docs accuracy pass
  - Correct `planned-branch-create` branch-creation wording so omission means the CLI default `plain-git`, while Graphite requires `--branch-creation graphite` unless a Pi adapter explicitly owns a different default.
  - Make public skill frontmatter harness-neutral.
  - Remove or demote internal implementation sequencing from user-facing docs where command-contract wording is enough.
  - Evidence: docs and skills describe observable behavior and recovery paths without misleading defaults or unnecessary TS internals.

## Parked

- [ ] Consider adding a portable `planned-branch exec preview-create` command if multiple non-Pi callers need dry-run evidence without importing package internals.
- [ ] Consider splitting already-large Pi extension files only if planned-branch cleanup work makes their local ownership boundaries worse; avoid churn for file size alone.
