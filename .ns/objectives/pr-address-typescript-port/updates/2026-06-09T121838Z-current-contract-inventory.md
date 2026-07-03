# Current pr-address Contract Inventory

## Summary

The first inventory pass found the current public `pr-address` contract across the public skill, README/development docs, package metadata, CLI reference, wrapper, source group registration, scenario tests, and golden fixtures.

Durable compatibility contract for the TypeScript port:

- Invocation surfaces:
  - `skills/pr-address/SKILL.md` is the public workflow contract. The skill must only trigger when explicitly invoked, works on the current branch's PR, stops at the execution plan for read-only use, and never pushes.
  - The bundled `skills/pr-address/scripts/pr-address-run` wrapper is part of the user-facing distribution contract: resolve relative to the skill directory, run locally inside an asdl checkout, run an installed package outside a checkout, support `ASDL_PR_ADDRESS_MODE=local|prod`, and fail clearly for invalid mode.
  - `packages/asdl-pr-address/pyproject.toml` declares the current standalone `pr-address` console script and ASDL plugin entry point `pr_address = asdl_pr_address.cli.plugin:build_pr_address_plugin`; the TS port must preserve or explicitly replace both invocation paths.
  - Standalone help/version behavior is covered by scenario tests, and the hidden-but-invocable `exec` group keeps top-level human help focused while exposing agent operations.
- Machine envelope and failure semantics:
  - `pr-address exec <command> --format json` helpers emit the Clinkr-style envelope `{"exit_code": 0|1|2, "data": ..., "error_type": ..., "message": ...}`.
  - `exit_code: 0` means success, `exit_code: 1` means a well-formed negative or incomplete outcome with useful data, and `exit_code: 2` means malformed input, gateway/auth failure, or another hard failure.
  - Helpers advertise schemas with `--json-schema`.
- Feedback and payload semantics:
  - `prepare-run` and `get-feedback` default to payload mode and require a caller-supplied safe payload session id via `--payload-session-id` or `ASDL_PAYLOAD_SESSION_ID`.
  - Default stdout returns compact manifests with `payload_reference`, counts, IDs, paths/lines, item pointers, and body locators; raw review bodies stay in managed `.raw.json` artifacts.
  - `--payload-mode inline` remains a debugging/migration escape hatch, not the normal skill path.
  - Empty-body `COMMENTED` and `APPROVED` reviews are filtered by default where documented; include flags opt them back in.
  - `prepare-run` owns current-branch PR lookup, contested-thread reopening, restructured-file evidence, compact counts, and found-false behavior.
- Classification and planning semantics:
  - Semantic classification remains LLM-owned, but the parent-generated JSON packet is the deterministic CLI boundary.
  - `classification-template` pre-fills deterministic IDs, locators, item pointers, thread item pointers, and covered-comment skeletons; the parent fills semantic fields only.
  - `validate-feedback-classification` enforces exact-once accounting for PR-level reviews, unresolved review threads, covered thread comments, and discussion comments; invalid packets fail closed before planning.
  - The stable classification schema uses `schema_version: 1`, source-specific arrays, `disposition`, `complexity`, `informational_reason`, `needs_reply`, `pre_existing`, summaries, action summaries, and locator references.
  - `plan-feedback` is deterministic after validation, emits ordered batches `pre_existing`, `local`, `single_file`, `cross_cutting`, `complex`, and marks `cross_cutting`/`complex` as approval-required.
  - Informational review threads require a user decision; informational PR-level reviews and discussion comments remain visible.
- Mutation and safety semantics:
  - GitHub mutations go through `pr-address exec` helpers, not raw GitHub API calls.
  - `resolve-thread-with-reply`, `build-resolve-thread-batch-payload`, `resolve-thread-batch`, `build-stack-resolve-thread-payloads`, `reply-to-review`, `reply-to-discussion`, `add-issue-comment`, `add-reaction`, `add-review-thread-reply`, `resolve-thread`, and `unresolve-thread` are the explicit mutation/reply surface.
  - Builders validate payload decisions before mutating helpers run. Missing decisions never imply skip.
  - Resolution modes are durable: `fixed`, `pre_existing`, `explained`, and provenance-validated `planned`.
  - Planned provenance is limited to local branch or PR evidence, validated before mutation, and reply text treats captured branch/PR facts as snapshots.
  - `record-batch-checkpoint` and `finalize-run` record/check compact run evidence without mutating GitHub, committing, pushing, or reading raw bodies.
- Stack workflow semantics:
  - `stack-feedback-prep` is Graphite-neutral: callers provide stack PR/branch metadata; the helper does not discover the stack through `gt` or `gh`.
  - Stack prep/plan support full and compact stdout modes. Compact mode returns artifact references and omits verbose inline data/raw bodies.
  - `stack-feedback-plan` validates per-PR classifications and merges batches by single-PR plan order.
  - `stack-feedback-diff-current` compares a validated stack plan with fresh include-resolved prep before mutation and must be safe before planned resolution proceeds.
  - `build-stack-resolve-thread-payloads` produces per-PR `resolve-thread-batch` payloads from the merged stack plan; the single-PR builder intentionally rejects stack plans.
- Registered `exec` operation surface observed in source/CLI reference:
  - Feedback/composite/read-only: `prepare-run`, `get-feedback`, `summarize-feedback`, `get-pr-for-branch`, `get-reviews`, `get-review-comments`, `get-discussion-comments`.
  - Payload/classification/planning: `read-feedback-detail`, `read-feedback-details`, `classification-template`, `validate-feedback-classification`, `plan-feedback`.
  - Batch/finalization: `build-resolve-thread-batch-payload`, `record-batch-checkpoint`, `finalize-run`.
  - Stack: `stack-feedback-prep`, `stack-feedback-plan`, `stack-feedback-diff-current`, `build-stack-resolve-thread-payloads`.
  - Mutation/reply primitives: `resolve-thread`, `resolve-thread-with-reply`, `resolve-thread-batch`, `unresolve-thread`, `add-review-thread-reply`, `reply-to-review`, `reply-to-discussion`, `add-issue-comment`, `add-reaction`.
- Test evidence:
  - Scenario tests exercise the standalone `build_cli()` path, not only internal functions.
  - Golden fixtures under `packages/asdl-pr-address/tests/golden/v1/` snapshot deterministic JSON/text contracts for `validate-feedback-classification`, `plan-feedback`, `build-resolve-thread-batch-payload`, `record-batch-checkpoint`, `finalize-run`, payload manifest builders, `classification-template`, and reply formatting.
  - Golden fixture README explicitly says expected output changes should be intentional and reviewed case-by-case.

Incidental or implementation-specific behavior that should not be blindly preserved:

- Python module paths, function/class names, pyproject dependency shape, Pydantic model identities, dataclass/fake gateway types, and clinkr internals are implementation details unless exposed through CLI/JSON behavior.
- The Python package name `asdl-pr-address`, `uv`, `uvx`, and the exact `ASDL_VERSION` pin are current distribution mechanics. The durable behavior is local-checkout versus installed-skill dispatch with clear override/failure behavior; the TS port may replace the underlying mechanics with npm/pnpm once compatibility is explicit.
- Exact JSON object key order, internal validation-code names, and some diagnostic text should be treated as contract only where tests/goldens or skill instructions depend on them. The durable contract is structured failure categories, exact IDs, payload safety, and actionable diagnostics.
- Current developer docs operation inventory is stale relative to the skill/CLI reference/source: it omits newer helpers such as `plan-feedback`, `record-batch-checkpoint`, `finalize-run`, stack prep/plan/diff/build helpers, and builder operations. The TS planning boundary should treat the public skill plus `references/cli-reference.md`, source group registration, scenario tests, and goldens as stronger evidence than that partial inventory.

## Objective Impact

This completes the first roadmap item, `Inventory the current public pr-address contract.` The Objective can now move from broad compatibility intent to concrete migration-boundary decisions.

The inventory reinforces the Objective's default compatibility stance: preserve public CLI/skill/JSON/safety behavior first, while allowing TypeScript-native internals and distribution mechanics behind the same user-visible contracts. It also identifies the highest-risk compatibility seams for the next work item: wrapper distribution, standalone versus ASDL plugin invocation, JSON envelope/schema parity, payload artifact behavior, and mutation-helper safety.

## Follow-Ups

- Define the TypeScript migration boundary and package shape using this inventory as the compatibility baseline.
- Reconcile or replace the stale operation inventory in `packages/asdl-pr-address/docs/development.md` during the docs/wrapper cutover work, not as a prerequisite to package-shape planning.
- Decide how `asdl pr-address ...` plugin compatibility should work in a TS-first world.
- Decide which golden outputs are byte-level contract versus representative fixture evidence before using them as parity tests.
- Keep mutation helpers, validation-before-action, no-push behavior, payload defaults, and complete feedback accounting as non-negotiable compatibility constraints unless a later Objective update records an explicit rationale for changing them.
