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

- [x] CLI and type-contract cleanup
  - Resolve-plan evidence now uses explicit/latest discriminated variants instead of an optional-field bag.
  - Expected CLI flag-value parse failures now return parser errors instead of throwing through `requireValue`, while the top-level catch remains for non-parse execution failures.
  - Evidence: `formatResolvePlanEvidence` no longer casts latest evidence, resolve-plan JSON serialization switches by variant, and CLI scenario tests cover missing-value and malformed-argument failures in both human and JSON modes without command execution.
  - Verification: `cd ts/packages/planned-branch && bun test`, `just ts-check`, and `just ts-test` passed.

- [x] Shared content-slug derivation
  - Planned-branch slug and saved-plan filename slug derivation now share one Pi content-slug helper parameterized by semantic label, prompt intro wording, invalid-output text, failure header, and no-fallback sentence.
  - `derivePlanContentSlug` remains the file-reading wrapper for `/planned-branch:create`, while `deriveSavedPlanContentSlug` remains the in-memory content wrapper for `write_source_branch_plan_file`.
  - Evidence: direct slug tests cover the shared normalizer plus saved-plan-specific success and invalid-output failure text, with prompt/fallback distinctions preserved.
  - Verification: `cd ts/packages/pi-extensions && bun test`, `cd ts/packages/pi-extensions && bun run check`, `just ts-check`, and `just ts-test` passed.

- [x] Semantic gateway boundary for planned-branch core
  - Git facts/branch operations, Branch Memory attachment/loading, and Graphite branch tracking now have planned-branch-owned semantic gateways in `@asdl/planned-branch`.
  - Core planned-branch create, source-plan store, explicit/latest plan resolution, and attached-plan loading now consume semantic Git facts/operations instead of constructing and parsing raw Git commands inline.
  - Core planned-branch create and load-plan workflows now consume semantic Branch Memory operations for attachment presence, attach, list, and get instead of constructing raw `brmem check/put/list/get` command arguments or parsing Branch Memory machine envelopes inline.
  - Graphite branch creation still keeps local Git branch creation and partial-failure policy in planned-branch core, while the real Graphite gateway owns the exact `gt track <branch> --parent <parent> --no-interactive` subprocess protocol, timeout, startup, nonzero, and killed-result mapping.
  - Evidence: planned-branch core/scenario tests use stateful semantic Git, Branch Memory, and Graphite fakes; real gateway tests preserve exact `git`, `brmem`, and `gt` command protocol expectations, exit-code conventions, timeout behavior, unavailable-command handling, malformed/mismatched envelope handling, and Graphite startup/nonzero/killed failure mapping.
  - Verification: `cd ts/packages/planned-branch && bun test`, `cd ts/packages/planned-branch && bun run check`, `just ts-check`, and `just ts-test` passed.

- [x] Public skills and docs accuracy pass
  - `planned-branch-create` now states that omitting `--branch-creation` uses the portable CLI default, `plain-git`, while Graphite requires `--branch-creation graphite` unless a wrapper explicitly owns a different default.
  - Public planned-branch skill frontmatter now describes agent use without Claude Code-specific trigger wording.
  - User-facing planned-branch docs now emphasize command-contract surfaces, portable CLI defaults, cross-harness interoperability, and recovery paths instead of detailed TypeScript implementation file maps.
  - Evidence: public skills and docs describe observable behavior and recovery paths without misleading Graphite defaults or unnecessary implementation internals.
  - Verification: `just dprint-check`, `git diff --check`, `just`, and `just ts-test` passed.

## Parked

- [ ] Consider adding a portable `planned-branch exec preview-create` command if multiple non-Pi callers need dry-run evidence without importing package internals.
- [ ] Consider splitting already-large Pi extension files only if planned-branch cleanup work makes their local ownership boundaries worse; avoid churn for file size alone.
