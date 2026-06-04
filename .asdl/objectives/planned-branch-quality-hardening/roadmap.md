# Roadmap

## Work

- [x] Canonical saved-plan resolver
  - Extracted one validated saved-plan/session/latest resolver for the current checkout in `@asdl/planned-branch`.
  - `/planned-branch:create` and `/cmux-slot:dispatch-plan` now use the shared session evidence parser/validator instead of parallel local implementations.
  - Evidence: tests reject outside-plan-store session evidence, wrong repo metadata, wrong source branch/branch key, and basename/slug mismatches; missing session files remain stale/fallback behavior where intended.
  - Verification: `cd ts/packages/planned-branch && bun test`, `cd ts/packages/pi-extensions && bun test`, `just ts-check`, and `just ts-test` passed.

- [x] Planned-branch-owned operation model for CMUX composition
  - `@asdl/planned-branch` now owns planned-branch create operation derivation, dry-run preview command rendering, shared success evidence formatting, and planned-branch failure context.
  - CMUX dispatch builds the planned-branch operation, delegates planned-branch preview/evidence/failure text to the package, and keeps local ownership of selected session plan presentation, slot checkout, workspace launch, and CMUX-specific recovery wording.
  - Evidence: planned-branch operation tests encode exact git/gt/brmem preview command internals, while CMUX dispatch tests assert composition behavior and no mutation in dry-run without re-encoding planned-branch command details.
  - Verification: `cd ts/packages/planned-branch && bun test`, `cd ts/packages/pi-extensions && bun test`, `just ts-check`, and `just ts-test` passed.

- [x] Unified Branch Memory envelope parsing
  - `brmem put`, `brmem list`, and `brmem get` now route through one strict `parseMachineEnvelopeData` path with shared `exit_code` and object-envelope validation.
  - Operation-specific body validators remain small and typed for put source metadata, list entries, and get content/ref data.
  - Evidence: `brmem-envelope-parsing.test.ts` covers valid put/list/get behavior, malformed JSON, missing/nonzero `exit_code`, malformed `data`, and namespace/branch/key mismatches consistently.
  - Verification: `cd ts/packages/planned-branch && bun test`, `just ts-check`, and `just ts-test` passed.

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
