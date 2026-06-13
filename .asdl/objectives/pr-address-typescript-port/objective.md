# Port pr-address to TypeScript

## Thesis

`pr-address` should become TypeScript-backed by default as the first production vertical slice of the broader asdl toolkit migration. The port should preserve the existing public skill, CLI, JSON, wrapper, and safety contracts while replacing Python implementation internals with idiomatic, testable TypeScript.

This slice should prove migration patterns that later capability ports can reuse: command runtime shape, boundary schemas, gateway seams, golden and scenario parity, wrapper distribution, installed-skill behavior, and safe Python fallback retirement.

As of 2026-06-10 this record also owns the TS-package quality remediation absorbed from `pr-address-ts-thermo-review-followups` and the payload/reference consolidation absorbed from `payload-reference-generalization`, so all work on `ts/packages/pr-address` sequences in one roadmap. As of 2026-06-12 this record also owns the `pr-address` consumer migration onto `@asdl/clinkr`; `ts-cli-foundation` owns the reusable framework/core provider layer and this record owns package-specific adoption, compatibility fallout, and sequencing.

## Scope

- Public `pr-address` skill invocation and wrapper behavior in both local-checkout and installed-skill contexts.
- Standalone `pr-address` CLI compatibility, including migration of the command shell onto `@asdl/clinkr`, preservation of legacy-Python fallback dispatch until retirement, and the expected `asdl pr-address ...` integration path while it remains active. This includes `pr-address exec ... --format json` machine envelopes.
- Current operation families: PR feedback preparation and fetching, payload artifact management, classification scaffold/validation/planning, selected detail lookup, batch checkpointing, stack feedback planning and diff helpers, resolve/reply payload builders, GitHub mutation helpers, and finalization.
- Adapter-neutral TypeScript core logic with gateway boundaries for git, GitHub, filesystem, process, package/distribution, and other external behavior the later port needs.
- Scenario, golden, and contract parity evidence sufficient to preserve stable behavior while identifying accidental Python implementation details.
- Fake-driven tests with capability-shaped gateways, plus limited safe real-adapter smoke evidence for read-only or non-mutating paths where useful.
- Bundled JavaScript distribution shipped inside the installed skill plus wrapper local/prod detection once TypeScript becomes the default implementation path. No npm registry publish is required for cutover.
- Short, explicit Python fallback retirement after TypeScript default behavior is proven.
- Behavioral parity corrections from the thermo-nuclear review: `--format=json` acceptance and strict integer argument parsing (`read-feedback-detail` payload containment stays parked pending clinkr payload support).
- Contract consolidation: one canonical Zod schema per wire shape (plan, manifest, checkpoint, stack-plan, summaries, classification packet), `z.infer` producer types, deletion of hand-written mirror interfaces and `unknown`-washing seams.
- Structural decomposition of the two >1,300-line files (`operation-schemas.ts`, `classification-core.ts`) along boundaries the import graph already proves.
- Deduplication: a single operation table (registry + schema docs + help), a shared operation-support layer, a shared thread-decision engine between the single-PR and stack resolve-payload builders, and ports of the Python `thread_index` / `string_values` shared modules.
- Test-suite hardening while the Python reference is in-repo, specifically real git/GitHub adapter tests and json-schema comparator failure-mode tests. Fixture regeneration, drift detection, and provenance stamps are deliberately out of scope.
- Payload/reference consolidation: one shared XOR-source resolver in `json-input.ts`, one reference-validation/diagnostics rule, a package-local declarative `loadOperationPayload` per-operation payload spec, and stdin-edge documentation plus scenario pinning. Do not extract first-class clinkr payload/reference support from this Objective unless a second consumer outside pr-address proves the seam in a later decision.

## Non-Goals

- No user-facing `pr-address` workflow redesign by default.
- No blind module-for-module port of `asdl_pr_address` or Python `asdl-core`.
- No TypeScript package scaffolding in the Objective-creation branch.
- No direct browser compatibility requirement for workflows that depend on local git, shell, filesystem, or authenticated GitHub state.
- No long-term Python fallback after cutover criteria are met.
- No replacement of semantic LLM judgment with brittle deterministic review-comment classification.
- No new abstraction beyond what deletes existing duplication — the remediation bar is fewer concepts, not rearranged ones.
- No breaking of the byte-parity envelope contract while the Python reference is live; restructurings must keep envelope text and artifact write order identical except where a parity correction explicitly updates them.
- No clinkr framework work itself — `@asdl/clinkr` reusable API design belongs to `ts-cli-foundation`. This record owns only the `pr-address` consumer migration onto the existing framework and any package-local compatibility adapters needed for that migration.

## Completion Criteria

- Current public `pr-address` CLI, skill, JSON, wrapper, documentation, and safety contracts are inventoried and classified as durable contract versus incidental Python behavior.
- A TypeScript implementation becomes the default for public `pr-address` invocation in local-checkout and installed-skill contexts, and the standalone `pr-address` CLI shell builds its command tree through `@asdl/clinkr` rather than a hand-rolled argv/help path.
- The standalone CLI, expected plugin/asdl integration path, JSON envelopes, payload artifact behavior, validation-before-action semantics, mutation-helper safety rules, and no-push guarantee are preserved or intentionally changed with explicit compatibility rationale.
- Fake-driven unit and scenario tests, golden/contract parity, wrapper checks, and limited safe real-adapter smoke evidence cover the migration.
- Public skill docs, wrapper behavior, README/developer docs, and distribution instructions point to TypeScript paths: local checkout execution plus the bundled installed-skill artifact.
- The `asdl pr-address ...` plugin is retired rather than ported; the standalone CLI is the only invocation surface after cutover.
- Python fallback has a short explicit retirement phase ending in full in-repo deletion of `packages/asdl-pr-address`; the published PyPI `asdl-pr-address==0.1.1` artifact remains the external frozen rollback.
- Lessons from the `pr-address` port feed back into the umbrella porting playbook for later capability slices.
- Parity corrections hold: `--format=json` produces JSON envelopes wherever `--format json` does; decimal integer parsing rejects non-canonical forms such as `1e2`, `0x10`, `+5`, whitespace-padded values, and `1_000` under the TypeScript clinkr shell. The `+5`/whitespace/underscore cases are an accepted stricter-than-click contract, not an accidental parity gap.
- Each wire contract (plan items, manifests, checkpoint, stack plan, compact summaries, classification packet) has exactly one canonical Zod definition; producers type against `z.infer`; the `--json-schema` doc routes import rather than restate; the two contradictory classification-template route schemas are unified.
- No source file in the package exceeds 1,000 lines; `operation-schemas.ts` and `classification-core.ts` are decomposed.
- One operation table drives dispatch, schema routing, and help; the dead exports identified by the review (`LEGACY_EXEC_OPERATIONS`, `isTsManaged`, `raw-exit`, and peers) are gone; `PrAddressContext` gateways are required and the `missing_gateway` branch class is deleted.
- The single-PR and stack resolve-payload builders share a thread-decision engine; the `trimRequired` divergence is eliminated by a shared string-values module.
- Real GitHub/git gateway adapters and the json-schema-parity comparator have their own tests. Captured-Python fixture regeneration, drift detection, and provenance stamps are deliberately out of scope.
- Exactly one implementation of the embedded-key-XOR-reference-option policy exists, in `json-input.ts`; the three prior implementations are deleted and all three reference-backed operations call it.
- Exactly one rule governs reference artifact validation and diagnostics across `--prep-reference`, `--stack-plan-reference`, and `--current-prep-reference`; the duplicated `stackPlanReferenceShapeSchema` copies are gone.
- A declarative payload spec drives payload + reference resolution for the reference-backed operations; the stdin-with-fully-reference-backed-inputs behavior is documented and pinned by a scenario test.

## Definition of Progress

Progress is keepable when it moves `pr-address` toward TypeScript-default behavior while preserving or explicitly reclassifying public contracts.

Keepable progress should do at least one of the following:

- Port a coherent operation slice to TypeScript with the smallest local runtime/schema seams needed by that slice.
- Add or strengthen fake-driven unit, scenario, golden, wrapper, or safe smoke evidence for preserved behavior.
- Reduce active Python fallback scope after TypeScript parity for the affected surface is proven.
- Clarify public contract, distribution, wrapper, or plugin compatibility decisions in checked-in docs or Objective updates.
- Feed a proven, repeated migration seam into the broader TypeScript porting playbook.

Do not keep changes that:

- Broaden a shared framework before at least two operation slices prove the same seam.
- Change public CLI, JSON, wrapper, payload, mutation-safety, or no-push behavior without explicit compatibility rationale and tests.
- Replace semantic LLM judgment with brittle deterministic classification heuristics.
- Depend on live GitHub mutations, npm publishing, or branch/PR writes as validation for ordinary implementation slices.
- Remove the Python fallback for a surface before equivalent TypeScript behavior, docs, and invocation paths are covered.

Useful evidence includes:

- Targeted Vitest/TypeScript tests for the ported package and wrapper paths.
- Python scenario/golden probes used as contract references, especially `pr-address exec ... --json-schema` and golden fixture comparisons.
- Fake-driven gateway tests for git, GitHub, filesystem, process, package/distribution, and payload behavior.
- Safe read-only real-adapter smoke evidence where it materially de-risks local environment or GitHub API assumptions.
- Objective Semantic Updates that record compatibility decisions, deliberate contract changes, cutover decisions, fallback retirement evidence, and reusable migration lessons.

## Runner Policy

This Objective is execution-friendly for `objective-next` across every non-parked roadmap row under the boundaries below. A runner may preview a single coherent slice, then execute it after user confirmation without needing a new Objective policy change.

- Direct execution is allowed when the slice is confined to repository files and local validation: TypeScript package code, tests, wrappers, checked-in docs, Objective files, golden/parity fixtures, and local compatibility probes.
- Direct execution should prefer vertical operation slices over framework-first work. Start with `classification-template`, then reuse proven seams for `validate-feedback-classification`, `plan-feedback`, payload/detail helpers, GitHub-backed read-only helpers, mutation builders, mutation helpers, wrapper/distribution cutover, fallback retirement, and playbook feedback.
- Steer or ask first when a slice would intentionally change public contracts, schema shape, JSON envelope semantics, wrapper mode behavior, installed-skill behavior, mutation safety, plugin compatibility, or fallback-retirement timing.
- Ask before running live GitHub write operations, publishing npm packages, submitting/updating PRs, deleting broad Python implementation areas, rewriting historical golden fixtures as the primary evidence, or extracting a shared command-runtime package.
- Work may be left as a normal repository diff containing code, tests, docs, and Objective updates. Do not leave generated payload artifacts, live credentials, external-system state, or unstated compatibility changes.
- Validation before keeping work should be targeted to the slice first, then broaden to package/workspace checks when the slice touches shared wrapper, distribution, or contract surfaces. If full validation is expensive or blocked, record the exact narrower evidence and blocker.
- Roadmap row-level `Policy:` notes refine these defaults for that row; they do not create hidden state or a task queue.
- This policy extends unchanged to the remediation and payload-consolidation rows absorbed on 2026-06-10 (same repo-local file and validation boundaries).

## Assumptions and Risks

Assumptions:

- Stable `pr-address` contracts can be preserved through JSON envelope checks, scenario tests, golden fixtures, and compatibility-focused wrapper tests.
- The current TypeScript workspace is the right default home for the port: pnpm workspaces, Node ESM, strict TypeScript, and Vitest.
- Existing Python tests and docs are useful contract sources, but some fixtures or formatting details may encode accidental implementation behavior.
- The strongest current public-contract sources are the public skill (`skills/pr-address/SKILL.md`), `skills/pr-address/references/cli-reference.md`, source group registration, standalone scenario tests, and golden fixtures. Treat these as stronger compatibility evidence than partial developer prose when sources disagree.
- A vertical-slice migration will reveal better shared command runtime and gateway abstractions than pre-porting Python `asdl-core` as a module map.
- Compatibility-preserving TypeScript internals can still add cleaner TS-native APIs behind or alongside stable public contracts where useful.
- Canonical Zod-first TypeScript contract modules are the right source of truth for feedback manifests and plan-feedback outputs once they preserve existing runtime JSON shapes and leave legacy-broader consumer parsing explicit.
- The payload artifact store (`asdl_core.payloads`) is the single keystone dependency for all remaining unported operations; porting it first unblocks payload-mode `get-feedback`, `read-feedback-details`, `record-batch-checkpoint` artifacts, `prepare-run`, and stack orchestration. Confirmed 2026-06-09 by the endgame stack. Revised detail: the real store contract is `{root}/sessions/{session-id}/payloads/` with timestamped `{stamp}-{seq}-{descriptor}.{role}.{ext}` artifact names and no session-metadata files — the earlier `{root}/{session}/artifacts/` + `{descriptor}--{role}.json` description was inaccurate; the TypeScript port follows the real source with byte-for-byte parity fixtures.
- Stack orchestration operations (`stack-feedback-prep`, `stack-feedback-plan`, `build-stack-resolve-thread-payloads`) have no Graphite dependency; they need only the PR gateway, the payload store, and the already-ported classification/planning core. Confirmed 2026-06-09 during the stack-orchestration port.
- `prepare-run`'s contested-thread reopen is a GitHub write (`unresolve_review_thread`) already covered by the ported TypeScript mutation gateway and fakes; porting it did not require new live-write validation. Confirmed 2026-06-09.
- Managed-operation envelope output now matches Python `json.dumps(..., indent=2)` `ensure_ascii` escaping for non-ASCII content; this was a latent TypeScript parity gap closed during the `prepare-run-summarize` branch.
- Confirmed 2026-06-12: the package-local payload/reference helper path no longer relies on the known broad generic empty-payload cast or the prepare-run manifest parity test's double-cast laundering. PR #1350 corroborates the fix: field-reference-only payload loading starts from an explicit record accumulator, and the parity test consumes the exported prepare-run manifest input type directly.
- Decided 2026-06-13: the TypeScript clinkr integer parser's durable contract is optional leading `-` plus ASCII decimal digits only. Inputs such as `+5`, whitespace-padded numbers, and `1_000` remain usage errors even though Python click accepts them; this stricter contract is pinned by clinkr tests and should not be reopened by generic click-parity wording.

Decided (2026-06-09 endgame decisions):

- Distribution: the planned end state is a bundled, self-contained JavaScript artifact shipped inside the installed skill so `pr-address` runs without an asdl checkout. No npm registry publish is required; `@asdl/pr-address` remains unpublished by design.
  - Reconciled 2026-06-13: the installed wrapper is already a run-from-source bash shim — `ts/packages/pr-address/scripts/pr-address-shim`, installed to `~/.local/bin/pr-address` by `just install-pr-address`, which bakes the installing checkout path into `@@ASDL_CANONICAL_CHECKOUT@@`. It runs `node <checkout>/ts/packages/pr-address/src/cli.ts`, preferring the enclosing worktree (so each worktree runs its own sources) and falling back to the baked canonical checkout. There is no `local|prod` mode env var and no `uvx`/Python path in the wrapper, and the bundled artifact does not exist yet. The distribution model is TypeScript run-from-source today; the bundle is the remaining `bundle-distribution` work that makes it checkout-free.
- Plugin: the `asdl pr-address ...` Python plugin is retired outright, not shimmed or ported. The standalone `pr-address` CLI is the sole invocation surface after cutover.
- Python end-state: `packages/asdl-pr-address` is fully deleted in-repo in the endgame stack once parity, bundle cutover, and plugin retirement evidence exist. Rollback after deletion is the external frozen PyPI artifact `asdl-pr-address==0.1.1` via `uvx`, not in-repo code.

Risks:

- Shared command-runtime work could overfit to `pr-address` if extracted before repeated seams are proven.
- Skill or wrapper semantics could change accidentally, especially the shim's checkout resolution (enclosing-worktree-then-baked-canonical-checkout), payload defaults, mutation-helper ownership, or no-push guarantees. The earlier `local/prod` detection framing predates the run-from-source shim, which has no mode env var.
- Keeping Python fallback too long could create duplicate maintenance and obscure which path is authoritative; canonical TypeScript feedback contracts reduce this risk for classification/planning data but do not resolve distribution, plugin, artifact, stack, or schema-route fallback dependencies.
- Deleting Python too early could remove a useful rollback/reference path before contract parity is mature. Current evidence says broad deletion is still unsafe while `prepare-run`, `summarize-feedback`, default payload-writing `get-feedback`, stack orchestration helpers, `read-feedback-details`, public `record-batch-checkpoint`, several `--json-schema` routes, installed/prod wrapper mode, and the `asdl pr-address ...` plugin still depend on Python fallback. Updated 2026-06-09: deletion is now an explicit endgame-stack outcome gated on those surfaces being ported or retired within the same stack; external PyPI `0.1.1` preserves rollback after in-repo deletion. Narrowed later on 2026-06-09 by endgame branches 1-4: every exec operation now executes TypeScript-managed; the remaining Python-fallback surfaces are `--json-schema` routes, click usage-error envelope shapes for invalid option values, installed/prod wrapper mode, and the plugin. Reconciled 2026-06-13: of those, `--json-schema` routes are now TypeScript-owned (branch 6) and click usage-error shapes are TypeScript clinkr usage errors (branch 5); the wrapper is the run-from-source shim with no Python at all, so it is no longer a Python-fallback surface. The remaining active Python presence is the in-repo `packages/asdl-pr-address` reference, the TypeScript CLI's unknown-operation fallback dispatch, and the `asdl pr-address ...` plugin — pending the `plugin-retirement` and `python-deletion` branches.
- Materialized 2026-06-09: the wrapper's prod mode pins `asdl-pr-address==0.1.0`, which was never published — only `0.1.1` exists on PyPI — so installed/prod invocation is currently broken. This lowers the regression risk of prod cutover (there is no working prod Python path to preserve) and raises the priority of the bundle-distribution branch. Superseded 2026-06-13: the wrapper was reworked into the run-from-source shim, so the broken `0.1.0`/prod-mode `uvx` pin no longer exists in the wrapper. PyPI `0.1.1` survives only as the post-deletion Python rollback reference (objective end-state), unrelated to wrapper invocation. The replacement gap is that the shim requires an asdl checkout with `ts/node_modules` (`just ts-install`) and does not yet run checkout-free — exactly what `bundle-distribution` addresses.
- npm distribution risk is retired by the bundle decision; the replacement risk is bundling machinery itself (build correctness, runtime requirements of the bundled artifact, skill-directory size and staleness between releases).
- Plugin retirement is a deliberate breaking change for any `asdl pr-address ...` callers; the cutover must update docs/tests so no active caller path remains, rather than preserving compatibility.
- GitHub mutation safety could regress if helper boundaries or validation-before-action semantics are weakened.
- Stack-feedback behavior may be more complex than current scenario coverage shows. De-risked 2026-06-09: the full trio is TypeScript-managed with byte-for-byte parity fixtures covering plan-merge/batch/docket logic and every cross-reference validation error path in `build-stack-resolve-thread-payloads`.
- `packages/asdl-pr-address/docs/development.md` currently has a stale operation inventory relative to the skill, CLI reference, source registration, scenario tests, and golden fixtures; using it as the sole port inventory source would miss newer helpers and safety surfaces.
- Internal sequencing (from the 2026-06-10 absorption of the remediation and payload records): the Python-reference-dependent rows — parity corrections, fixture regeneration/provenance, and contract-consolidation parity arbitration — MUST land before the `python-deletion` endgame branch; once the in-repo reference is gone they become substantially more expensive or impossible to verify. The former cross-objective "multiple records touch the same package" drift risks are resolved by the consolidation itself.
- Fixture-byte coupling: error-message unification and parity corrections touch envelope bytes; careless fixture refresh could mask real regressions. Every fixture diff must be individually attributable to a deliberate message-template or parity change.
- clinkr divergence: pr-address migrates to clinkr last, but the consumer migration is owned here while the framework is owned by `ts-cli-foundation`. If the payload-spec design ignores clinkr conventions, the eventual shell migration becomes a rewrite instead of a move. Mitigation: keep spec conventions clinkr-compatible — snake_case schema keys and the `--<key>-reference` option derivation — while keeping `loadOperationPayload` package-local until another consumer proves a shared-framework need.

## Open Questions

- Which golden outputs require byte-for-byte parity, and which represent structured compatibility where key order or formatting may intentionally differ?
- How should TypeScript output handle Python/Pydantic compatibility details such as explicit `null` fields in otherwise optional manifest/template data?
- Which command-runtime pieces deserve extraction only after a second operation slice or later capability proves the same seam?
- What does checkout-free distribution require, given the current run-from-source shim baseline (the shim `exec node <checkout>/.../cli.ts` directly, needing a Node that strips TypeScript types plus an installed `ts/node_modules`)? Open sub-questions: bundle build inputs, the Node version floor for the bundled artifact, single-file vs directory bundle, and how the installed shim/skill switches from run-from-source to the bundled artifact and picks up new bundles.

Resolved 2026-06-12 (structural/dedup group):

- `stack-feedback-prep` parallel fetch is on by default. Failures still resolve to the first failure in input order; artifact writes remain sequential in stack order; fixture-visible stdout, exit behavior, sequence numbers, and filenames remain byte-identical. The accepted compatibility tradeoff is that partial-failure disk state may contain fewer per-PR artifacts than Python.

Decided 2026-06-12 (dead-code sweep):

- `writeTextArtifact` stays in the payload store for now. It has no production caller, but the store still models `log` artifacts, parity fixtures write text artifacts, and lookup-negative tests use log artifacts to prove JSON lookups reject non-JSON roles. Deleting it would narrow the store contract rather than remove unreachable implementation plumbing.

Decided 2026-06-10 (consolidation):

- Spec-driven option/schema generation from the payload spec (the former payload-reference #5b) dissolves into this record's pr-address clinkr shell migration rather than landing standalone, per the overlap note's own recommendation.
- Final ownership of `loadOperationPayload` is package-local in this record for now. `@asdl/clinkr` should not grow first-class payload/reference support until at least one second consumer proves the seam.

Resolved 2026-06-12 (payload/reference consolidation):

- Reference-backed `stack_plan` and `current_prep` inputs receive exactly the validation their embedded equivalents receive. The shallow reference-shape schemas are deleted; downstream validators own `invalid_stack_plan_shape`, `invalid_current_prep_shape`, and related semantic diagnostics. `--prep-reference` keeps full schema validation because the embedded `prep` payload is schema-typed at the same boundary.

Resolved 2026-06-09 (see Decided entries under Assumptions and Risks):

- Plugin compatibility: the `asdl pr-address ...` plugin is retired, not preserved or replaced.
- Fallback retirement evidence: the retirement phase begins now and completes within the endgame stack — every remaining fallback surface is either ported (operations, schema routes, payload store) or retired (plugin), the wrapper cuts over to bundle/prod-TS behavior, and `packages/asdl-pr-address` is deleted in the final branches with PyPI `0.1.1` as external rollback.
