# Roadmap

## Work

- [ ] Establish roaster collector/accounting models and artifact roots.
  - Define typed roaster models for collector runs, source items, proposed findings, ignored items, duplicate relations, helper evidence/envelope references, optional typed closeout refs, and validation errors.
  - Source items should use deterministic adapter-scoped IDs; findings should keep human-readable IDs.
  - Persist pending collector runs in roaster run artifacts, with compact evidence inline and full/raw bodies behind payload locators.
  - Policy: direct execution after preview.
  - Evidence: schema/unit tests prove strict accounting invariants and fixture round-trips without live GitHub.

- [ ] Add governed roaster collector CLI surfaces.
  - Add a user-facing `roaster collect` surface for listing collectors and starting governed runs.
  - Add hidden `roaster exec` operations for recording and validating collector results.
  - `roaster collect run github-pr-feedback` should create a pending run and emit a contract/task packet: target/profile context, allowed helper commands, required helper-envelope schema, result schema, artifact paths, and recording command.
  - Policy: direct execution after preview.
  - Evidence: CLI scenario tests cover successful pending run creation, invalid collector results, missing helper evidence, duplicate/unaccounted source items, and JSON output envelopes.

- [ ] Upgrade the GitHub PR feedback collector from prototype seed to roaster-owned accounting contract.
  - Rewrite `collectors/github-pr-feedback.md` so it no longer presents `findings` plus `ignored_items` as the final durable contract.
  - The prompt should instruct the active agent to produce source items plus proposed findings, account for every unresolved/current source item exactly once, preserve helper evidence references, and include optional typed closeout refs when available.
  - The prompt may call `pr-address exec` helpers directly, but must record exact helper command envelopes or verifiable references for roaster validation.
  - Policy: direct execution after preview; steer first if changing the no-backwards-compat stance.
  - Evidence: dprint passes and prompt examples match roaster validators/fixtures.

- [ ] Define strict, versioned `pr-address exec` helper contracts for GitHub PR feedback evidence.
  - Treat `pr-address exec` as the shell-out adapter boundary used by roaster.
  - Keep useful helper behavior: branch PR lookup, feedback fetch/summarize/detail, payload/detail locators, compact summaries, and GitHub closeout mutation helpers.
  - Remove or prepare to remove workflow-shaped classification/planning concepts once roaster replacement behavior exists.
  - Split any reusable read-only behavior out of `prepare-run`; contested-thread mutation belongs to explicit closeout policy, not collection.
  - Policy: ask first before deleting currently-used commands unless the same stack provides the roaster replacement path.
  - Evidence: fixture envelopes document command/output schema versions and roaster tests consume those fixtures.

- [ ] Feed collector proposed findings into roaster triage and batch planning.
  - Extend the roaster run engine so collector findings join review findings in the same triage/batching path while preserving source-item provenance.
  - Keep the internal abstraction as finding sources, with reviews and collectors as user-facing categories.
  - Apply strict source-item accounting only to addressable external collectors initially; do not force roaster code-review prompts into source-item ledgers.
  - Policy: direct execution after preview.
  - Evidence: tests show collector provenance survives triage, batching, resolver records, and dashboard/rendered summaries.

- [ ] Add closeout intent planning without executing GitHub mutations.
  - Model one closeout intent per addressable source item, grouped by finding and batch for display and approval.
  - Roaster should generate proposed human-facing reply text from finding, batch, validation, and target context.
  - Closeout intents should include enough adapter target data to execute through GitHub helper commands later, but no mutation should occur in this slice.
  - Policy: direct execution after preview; do not call GitHub write APIs.
  - Evidence: unit/scenario tests validate intent grouping, required proposed text, missing closeout ref handling, duplicate source handling, and dashboard/report output.

- [ ] Implement explicit GitHub closeout adapter execution through helper CLI commands.
  - Execute only approved roaster closeout intents through `pr-address exec` helper commands.
  - Keep adapter behavior deterministic: it posts/resolves/reopens exactly the approved intents and does not invent reply text.
  - Contested-thread reopening is an explicit closeout policy, disabled during collection and executed only in the final confirmed phase.
  - Policy: ask before any live GitHub mutation; tests must use fakes/fixtures.
  - Evidence: fake-helper tests cover reply, resolve, resolve-with-reply, reopen policy, partial failure recording, and idempotent/reportable execution results.

- [ ] Preserve `pr-address` as a lightweight roaster-backed workflow and rewrite `internal-pr-stack-address` as a thin roaster profile entrypoint.
  - Public `pr-address` should still feel like a coherent single-PR workflow: select the current-branch/single-PR roaster profile, collect GitHub PR feedback, run roaster triage/batches, and optionally execute approved GitHub closeout after confirmation.
  - The `pr-address` wrapper should not own classification, batching, resolver gating, validation semantics, closeout wording, or source accounting; those remain roaster-owned.
  - `internal-pr-stack-address` should select the Graphite stack target/profile, enforce stack PR coverage/worktree safety, and then invoke the same roaster run engine.
  - Roaster profiles should own source selection, target selector policy, branch/fix-location policy, validation defaults, closeout adapter, and stack omnibus/follow-up branch policy.
  - Policy: ask before removing user-facing `pr-address` workflow affordances; direct execution is fine for skill prose/doc updates that make ownership clearer.
  - Evidence: skill docs are shorter, old duplicated workflow instructions are gone, `pr-address` remains a usable lightweight wrapper, and scenario/fixture coverage proves roaster owns the durable workflow.

- [ ] Delete obsolete `pr-address` classification/planning code after the roaster replacement is usable.
  - Remove or retire `classification_template`, `feedback_classification`, `validate_feedback_classification`, and old composite execution planning behavior.
  - Keep only helper plumbing needed by roaster: PR lookup, fetch/summarize/detail/payload locators, and closeout mutations.
  - Policy: perform only after earlier slices provide a working roaster-owned single-PR path.
  - Evidence: old tests are removed or replaced by roaster tests; no skills route agents to the deleted workflow.

## Parked

- Decide whether the `asdl-pr-address` package should eventually be renamed after helper-only demotion. Current decision is to keep hidden helper CLI plumbing while preserving the public `pr-address` workflow as a lightweight roaster-backed wrapper.
- Decide whether non-GitHub external collectors such as Buildkite, CI annotations, or code scanning should be implemented after GitHub PR feedback proves the generic collector core.
- Decide whether roaster should eventually run LLM prompts itself. Current decision keeps the active agent responsible for prompt judgment while roaster owns artifacts/contracts/gates.
- Decide whether code-review prompts should ever adopt lightweight evidence accounting. Current decision limits strict accounting to addressable external collectors initially.
- Consider a future direct Python adapter boundary if shell-out helper contracts become too brittle, despite the current decision to use `pr-address exec` JSON envelopes as the integration API.
