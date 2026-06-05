# Roaster Graphite Stack Workflow

## Thesis

Build an execution-ready roaster feature that turns local automated review findings into an ordered Graphite resolution stack through `roaster stack run <profile-slug>`.

The north star is an end-to-end steelthread MVP: roaster resolves a loose profile, runs existing findings reviewers, asks a prompt-file-driven triage/verifier agent to accept/reject/merge/rank/batch findings, records canonical lineage in Branch Memory, publishes one persistent dashboard PR issue comment, runs a resolver agent per accepted batch, gates each batch on structured validation and safety evidence, creates or updates generated Graphite branches above the target implementation stack, and leaves PR submission or real external smoke execution to explicit human confirmation.

This Objective exists so `objective-stack-impl` can implement the feature autonomously as a reviewable Graphite stack after preview confirmation, without relying on the earlier saved planned-branch document as hidden context.

## Scope

Implement the steelthread MVP for a visible user-facing command shaped like:

```bash
roaster stack run <profile-slug>
```

In scope:

- A visible `roaster stack` CLI group whose help explicitly names Graphite/`gt`.
- Profile resolution from `.roaster/profiles/<profile-slug>.md`, with profile markdown treated as loose human/agent guidance and not deterministically parsed by headings.
- A checked-in sample profile at `.roaster/profiles/thermonuclear-stack.md`.
- Typed stack domain models for run requests/results, triage/resolver frontmatter, run manifests, dashboard rows, generated branch names, generated PR markers, and non-ideal failures.
- Deterministic YAML-frontmatter parsing for triage and resolver agent outputs. Markdown bodies are human explanation only.
- Branch Memory run storage under namespace `roaster-runs` on the original implementation branch scope, with centralized key construction and validation.
- A persistent roaster-managed dashboard as a top-level PR issue comment on the target implementation PR.
- Review collection through existing roaster reviewer workflows, using explicit `--reviewer` keys or standard/matching reviewers by default.
- A fake-driven `AgentRunnerGateway` boundary for triage and resolver sessions, plus guarded real adapter code when feasible.
- A fake-driven `GraphiteStackGateway` boundary for reading stack context, checkout, create/update, modify, and submit operations, plus guarded real adapter code.
- Dry-run orchestration that may run reviewers and triage but performs no Branch Memory writes, GitHub mutations, branch mutations, Graphite submissions, or external write operations.
- Mutation orchestration that, after non-dry-run confirmation, publishes the dashboard, persists lineage, runs one resolver per accepted batch, validates structured resolver reports, creates or updates generated Graphite branches, and updates status artifacts.
- Generated branch naming shaped like `<impl-branch-slug>/roaster/<run-slug>/<batch-slug>`.
- Hidden generated PR/body marker support or a narrow documented publication gateway path sufficient for later body updates.
- README documentation for the command, profiles, prompt overrides, Branch Memory lineage, dashboard behavior, dry-run behavior, rerun semantics, Graphite requirement, safety stops, and manual real smoke expectations.
- Scenario, unit, and gateway tests using fakes rather than `unittest.mock.patch` for core behavior.

The implementation should preserve existing roaster review behavior and current plugin discovery behavior while adding the new stack surface.

## Non-Goals

- Do not build the final polished product beyond the steelthread MVP.
- Do not wait for or monitor remote CI as part of the steelthread.
- Do not create inline GitHub review comments or resolve original review threads in the MVP.
- Do not mutate original GitHub review threads in this Objective.
- Do not deterministically parse profile markdown headings or prose. If reliable profile structure becomes necessary, add explicit YAML/frontmatter or CLI flags as a separately justified change.
- Do not make `pr-address exec` or another package the user-facing contract for this roaster workflow.
- Do not require autonomous real mutation smoke tests against live GitHub/Graphite resources for Objective completion.
- Do not automatically submit PRs from `objective-stack-impl`; PR submission remains a separate explicit user action.
- Do not introduce hidden stack ledgers, Branch Memory implementation plans, YAML registries, UUID task databases, or state machines for Objective execution itself.

## Completion Criteria

This Objective is complete when the steelthread MVP is implemented, tested, and documented such that a user can run `roaster stack run <profile-slug>` in dry-run mode safely and the non-dry-run path has fake-driven coverage plus guarded real gateway implementations.

Completion evidence should include:

- `roaster -h` and `roaster stack -h` expose the stack surface, and `roaster stack -h` names Graphite/`gt`.
- Missing and invalid profiles fail with clear non-ideal messages.
- `.roaster/profiles/thermonuclear-stack.md` exists and documents that profile markdown is loose guidance, not deterministic input.
- Triage and resolver YAML-frontmatter parsers reject missing frontmatter, invalid schema versions, invalid enums, duplicate IDs/slugs, unknown references, dependency cycles, missing validation evidence, and safety failures.
- Branch Memory storage helpers write/read only namespace `roaster-runs` on the original implementation branch scope and centralize all key construction.
- Dashboard rendering and publication helpers create/update one persistent PR issue comment and do not call inline review/thread mutation paths.
- Dry-run orchestration produces deterministic human/JSON output and performs no mutating gateway calls.
- Non-dry-run orchestration is fake-covered for review collection, triage, dashboard publication, Branch Memory writes, resolver execution, validation/safety hard stops, generated branch creation/update, and submit gateway invocation.
- Graphite and agent-runner real adapters are guarded behind gateway boundaries and surface clear failures when local tools are unavailable.
- README documentation explains the steelthread behavior, safety boundaries, manual real-smoke procedure, and deferred non-goals.
- Relevant package-focused tests pass, and broader repo checks are run when practical for the touched files.

## Definition of Progress

Progress is keepable when:

- It lands an independently reviewable semantic slice from the roadmap with fake-driven tests or clear local validation evidence.
- It preserves existing roaster review CLI behavior while extending the package through explicit new modules and gateway boundaries.
- It reduces uncertainty around one risky boundary: profile/CLI shape, frontmatter parsing, Branch Memory storage, dashboard publication, agent running, Graphite mutation, resolver safety gates, or real-adapter/docs integration.
- It leaves the repository in a state where the current branch can pass targeted tests for the changed slice, or clearly records why validation was skipped or blocked.

Do not keep changes that:

- Mix unrelated product decisions into one PR slice.
- Depend on unreviewed live GitHub/Graphite mutations for correctness.
- Parse loose profile markdown as authoritative structure.
- Bypass existing gateway/fake patterns with ad hoc `gh`, `gt`, subprocess, or filesystem calls in core workflow code.
- Add package re-exports through `__init__.py` files or leading-underscore module names.

Useful evidence includes targeted pytest runs for roaster unit/gateway/scenario tests, plugin smoke tests for roaster discovery, static checks relevant to touched Python/Markdown/TOML, and parent-agent inspection of diffs after each runner subagent returns.

## Runner Policy

This Objective is designed for autonomous pursuit by `objective-stack-impl` after the parent agent presents and the user confirms an execution preview.

- Direct execution is allowed when: the preview covers 1-3 Graphite PR slices at a time, each slice has one clear thesis, the worktree is safe, and the slice stays within the steelthread MVP scope above.
- The parent agent may create or amend local Graphite branches, dispatch one runner subagent at a time, edit repo source/tests/docs, run local validation, and record Objective updates when meaningful progress is made.
- Steer or ask first when: the implementation would expand beyond the steelthread MVP, require live GitHub/Graphite mutation smoke tests, submit PRs, change the public contract away from `roaster stack run <profile-slug>`, introduce deterministic profile-prose parsing, remove existing roaster review behavior, or choose between materially different real agent runner designs.
- How work may be left: completed slices should be committed/amended through the repo Graphite workflow after parent-side validation. Blocked slices may leave inspected local changes only if the parent reports the blocker, validation state, and recommended recovery path.
- Validation before keeping work: prefer targeted roaster tests for each slice, plugin smoke tests when CLI/plugin wiring changes, and repo checks when practical. If lint or format failures are mechanical, use `just fix` or `just dprint-fix` per repo policy rather than hand-formatting.
- What will not happen unless explicitly requested: PR submission, live disposable roaster stack mutation smoke tests, GitHub issue/PR mutation outside tested/faked code paths, deployment, remote CI waiting, review-thread mutation, or broad product expansion beyond the MVP.

## Assumptions and Risks

Assumptions:

- Existing roaster reviewer workflows can provide findings through `run_review_by_key(..., requested_format="findings")` and matching review selection can be reused for default reviewer choice.
- Branch Memory can be used as a declared roaster dependency, or wrapped behind a small roaster run-storage gateway if direct imports become awkward.
- The target implementation branch normally resolves to a GitHub PR through existing `PRGateway` methods.
- Graphite is an acceptable runtime dependency for this command because the user-facing `roaster stack` contract explicitly names Graphite/`gt`.
- A local non-interactive agent runner can be adapted to return markdown with YAML frontmatter for triage/resolver sessions, even if exact flags need verification during implementation.
- Fake-driven tests are sufficient Objective completion evidence for external mutation paths; real mutation smoke remains manual and explicitly confirmed.

Risks:

- The real agent runner adapter may differ from the existing read-only Claude Code review harness and may need a smaller first implementation or a clear unavailable-tool failure mode.
- Updating generated PR bodies with hidden markers may require a narrow PR body editing gateway because Graphite submission alone may not set the final body shape.
- Rerun/update semantics for existing generated batch branches can become stack-surgery-heavy. The MVP should prefer clear failure modes over destructive automatic repair.
- Branch Memory branch encoding rejects branch names containing `---`; the workflow must validate this early and surface a clear message.
- The feature crosses multiple external boundaries: Branch Memory, GitHub comments, Graphite, and agent execution. Gateway boundaries and fakes are load-bearing for safe autonomous implementation.
- The Objective may tempt scope creep into remote CI monitoring, inline comments, thread resolution, sophisticated profile semantics, or final-product polish. These remain parked unless explicitly promoted.

## Open Questions

- What exact command and flags should the real local agent runner adapter use for mutating resolver sessions?
- Should generated PR body editing be added to `PRGateway`, a roaster-specific publication gateway, or a controlled `gh pr edit --body-file` adapter?
- What exact deterministic rule should generate a new `run_slug` for `--new-run` without an explicit slug? The default recommendation is profile slug plus ordinal suffix from the Branch Memory index.
- Should a later debug-only synthetic triage input be added to simplify manual mutation smoke tests without undermining prompt-driven production behavior?
- How much of matching existing generated PR branches on rerun should the MVP implement before failing safely and asking for human intervention?
