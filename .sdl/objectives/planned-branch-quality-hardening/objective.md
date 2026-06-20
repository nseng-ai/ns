# Planned Branch Quality Hardening

## Thesis

The planned-branch TypeScript CLI stack is functionally green, but the thermo-nuclear review found structural quality risks that should be fixed before the surface becomes harder to change. The goal is to preserve the current user-visible planned-branch behavior while tightening ownership boundaries, removing duplicated validation/parsing, and making the implementation feel simpler and more inevitable.

This Objective tracks the follow-up PR stack that turns the current working steelthread into a cleaner, maintainable planned-branch platform across the portable `@asdl/planned-branch` package, Pi integration, CMUX dispatch integration, and public skills/docs.

## Scope

In scope:

- Canonicalize saved-plan resolution and validation so `/planned-branch:create` and `/cmux:workspace:dispatch-plan` share one validated model instead of maintaining parallel session-history parsing and boundary checks.
- Reframe CMUX dispatch as composition over planned-branch-owned operations, so CMUX owns slot checkout/workspace launch and planned-branch owns branch/key/attachment preview, creation, dry-run, and evidence formatting.
- Unify Branch Memory machine-envelope parsing for `put`, `list`, and `get`, with typed validators for each operation body.
- Clean up CLI type contracts where optional bags and casts obscure real variants, especially plan resolution evidence and expected CLI parse errors.
- Collapse duplicated slug-derivation modules into one shared content-slug helper with semantic differences expressed as data.
- Introduce semantic gateway boundaries for Git, Branch Memory, and Graphite so planned-branch domain workflows do not directly depend on raw subprocess command protocols.
- Correct public planned-branch skills and docs where they imply inaccurate defaults, leak implementation sequencing, or use harness-specific wording where the surface is portable.

## Non-Goals

- Do not change the intended planned-branch user workflow: write a self-contained plan, create a branch and attach the plan, then load the attached plan for implementation.
- Do not redesign Branch Memory itself or change the `planned-branch` namespace/key contract unless a bug is discovered that requires it.
- Do not make this Objective responsible for shipping unrelated planned-branch features beyond the review hardening findings.
- Do not introduce Objective execution policy, task automation, or runner-specific state for this cleanup. This is planning-only tracking.
- Do not require a file-size-only refactor for files that were already large before the stack unless it directly supports the cleanup findings.

## Completion Criteria

This Objective is complete when:

- Both Pi planned-branch create and CMUX dispatch use a shared, canonical saved-plan validation path and tests cover rejection of invalid session evidence such as outside-plan-store files or wrong repo/branch metadata.
- CMUX dispatch no longer hand-owns planned-branch internals such as brmem keys, Graphite command sequencing, planned-branch evidence formatting, or dry-run command synthesis beyond what is needed to compose slot checkout and launch.
- `put`, `list`, and `get` Branch Memory JSON handling use one envelope parser with consistent `exit_code` expectations and focused tests for malformed envelopes and body mismatches.
- CLI evidence and parse contracts model real states without casts or exception-driven expected user-input validation.
- Planned-branch slug derivation has one reusable content-slug path instead of near-copy-paste plan/saved-plan modules.
- Planned-branch domain workflows depend on semantic gateway interfaces or equivalent owned adapters rather than spreading raw command construction/parsing through core logic.
- Public skills/docs accurately describe CLI defaults and portable command contracts without misleading Graphite default language or unnecessary internal implementation sequencing.
- Relevant TypeScript checks and package tests pass for the touched packages, and any deviations from the review findings are recorded in an Objective update.

## Assumptions and Risks

Assumptions:

- The existing behavior and tests from the planned-branch TS CLI stack are a valid baseline; the cleanup should preserve observable behavior except where tests intentionally tighten invalid-boundary rejection.
- The planned-branch package is the canonical owner of branch creation, Branch Memory attachment, saved-plan evidence, and attached-plan loading semantics.
- CMUX should remain a composition layer: after planned-branch creates/attaches, CMUX checks out a slot and opens a workspace.
- Semantic gateways could be introduced incrementally without blocking the smaller boundary fixes; the saved-plan resolver, CMUX operation model, Branch Memory envelope cleanup, CLI type-contract cleanup, shared content-slug derivation, Git semantic gateway slice, Branch Memory semantic gateway slice, Graphite semantic gateway slice, and public skills/docs accuracy pass have now landed as independent slices.

Risks:

- Gateway extraction may grow the diff if it attempts to redesign all command execution at once. The Git, Branch Memory, and Graphite gateway slices de-risked the seam shape by preserving adapter protocol tests and semantic in-memory fakes while keeping each adapter narrow. Graphite tracking stayed deliberately small: planned-branch core still owns local branch creation and partial-failure policy, while the real Graphite gateway owns only the `gt track` subprocess protocol.
- Tightening saved-plan validation may reveal tests or workflows that relied on arbitrary external `.md` files. Mitigate by keeping explicit plan-file behavior where intended and only requiring session/latest evidence to match the local plan-store contract. The canonical resolver slice de-risked this for Pi create and CMUX dispatch: valid local plan-store session evidence still works, missing session files remain stale where intended, and unsafe session evidence is rejected consistently.
- CMUX dry-run output may be coupled to exact command text in tests or user expectations. Mitigate by preserving useful evidence while moving command sequencing behind a planned operation model. The operation-model slice de-risked this for CMUX dispatch by moving exact planned-branch command assertions into package tests and keeping CMUX tests focused on composition and dry-run no-mutation behavior.
- Branch Memory machine-envelope drift between `put`, `list`, and `get` may produce inconsistent failure semantics. The unified envelope parsing slice de-risked this by routing all three operations through one strict parser while keeping operation-specific body validators focused.
- CLI parse/evidence contracts may obscure invalid states if optional bags and exception-driven user-input failures remain. The CLI type-contract slice de-risked this for resolve-plan evidence and expected parse failures by using discriminated evidence variants and returned parser errors with scenario coverage for human and JSON failures.
- Docs and skills may drift again if they duplicate CLI defaults. The public accuracy pass de-risked the current drift by stating the portable CLI default (`plain-git`), naming Graphite as an explicit `--branch-creation graphite` choice unless a wrapper owns a different default, making public skill descriptions harness-neutral, and demoting user-facing implementation file maps to command-contract surfaces.

## Open Questions

- Should the portable `planned-branch` CLI eventually expose a dry-run/preview operation directly, or is an internal operation model sufficient for Pi/CMUX composition?
- Resolved for the public workflow docs: keep command-contract surfaces and recovery guidance in user-facing docs; detailed implementation source maps belong in package-level or developer-facing references when needed.

## Closure

Outcome: completed.

The hardening stack completed the planned-branch cleanup findings while preserving the intended write-plan, create, attach, and load-plan workflow. The shipped slices added canonical saved-plan resolution for Pi create and CMUX dispatch, moved CMUX dispatch to a planned-branch-owned operation model, unified Branch Memory envelope parsing, cleaned up CLI parse/evidence contracts, shared content-slug derivation, introduced semantic Git/Branch Memory/Graphite gateways for planned-branch core behavior, and corrected public skills/docs to describe portable CLI defaults and command contracts accurately.

Evidence: the roadmap rows are complete; PRs through #901 record the final Graphite gateway and public skills/docs slices; `just`, `just ts-test`, `just dprint-check`, and `git diff --check` passed on the closing branch.

Caveats and follow-ups: the parked preview-command and file-splitting ideas remain optional future work, not blockers for this Objective. If multiple non-Pi callers later need planned-branch dry-run evidence without package imports, consider a portable `planned-branch exec preview-create` command as new work.
