# Roadmap

## Work

- [ ] Add the visible stack CLI skeleton, profile resolver, and sample profile.
  - Thesis: `roaster stack run <profile-slug>` becomes a discoverable, Graphite-explicit user-facing surface with safe profile lookup and no deterministic markdown-profile parsing.
  - Likely areas: `packages/roaster/src/roaster/cli/roaster/group.py`, new `cli/roaster/stack/`, new `stack_profile.py`, `.roaster/profiles/thermonuclear-stack.md`, roaster scenario tests.
  - Policy: direct execution after preview.
  - Evidence: standalone roaster CLI scenario tests cover help, Graphite wording, valid profile resolution, and missing-profile failure.

- [ ] Add stack domain models, slug helpers, and authoritative agent-output frontmatter parsing.
  - Thesis: roaster has typed contracts for stack requests/results, triage/resolver outputs, run manifests, dashboard rows, markers, slugs, and failure cases before orchestration depends on them.
  - Likely areas: `stack_models.py`, `stack_agent_output.py`, `stack_slugs.py`, parser/slug unit tests.
  - Policy: direct execution after preview.
  - Evidence: tests cover valid triage/resolver frontmatter, missing/invalid frontmatter, invalid enum values, duplicate finding IDs, duplicate batch slugs, unknown finding/batch references, dependency cycles, validation omissions, safety flags, and the rule that markdown body text is non-authoritative.

- [ ] Add Branch Memory run storage for roaster stack lineage.
  - Thesis: canonical run lineage is persisted under namespace `roaster-runs` on the original implementation branch, with centralized key construction and resume index behavior.
  - Likely areas: `packages/roaster/pyproject.toml`, a roaster run-storage helper/gateway, `FakeBranchMemoryGateway` tests, manifest/index model integration.
  - Policy: direct execution after preview; ask first if this would require changing Branch Memory package behavior rather than using its existing gateway/key validation.
  - Evidence: tests prove index, manifest, triage, and resolver keys; writes target the implementation branch only; generated branches do not receive canonical manifests; dry-run does not write; invalid Branch Memory branch/key cases fail clearly.

- [ ] Add stack dashboard rendering and PR issue-comment publication.
  - Thesis: each roaster stack run owns one persistent dashboard comment on the implementation PR, updated in place with run, batch, finding, validation, and generated PR status.
  - Likely areas: `stack_dashboard.py`, `stack_markers.py`, `findings_publication.py` patterns, `PRGateway`/`FakePRGateway` usage, dashboard unit tests.
  - Policy: direct execution after preview using fakes; ask first before adding broad GitHub gateway capabilities unrelated to issue-comment create/update/find.
  - Evidence: tests show marker rendering/parsing, new comment creation, existing comment update, zero-accepted-batch rendering, activity/log preservation if implemented, and no inline review/thread mutation calls.

- [ ] Add review collection and the triage agent-runner boundary.
  - Thesis: the workflow can collect findings from explicit or matching roaster reviewers and feed them, with profile guidance, into a fake-driven triage/verifier agent boundary.
  - Likely areas: `stack_workflow.py`, `gateways/agent_runner/`, `prompts/stack_triage.md`, existing `workflow.py` reuse, fake agent runner tests.
  - Policy: direct execution after preview; ask first if choosing a real mutating runner design becomes a blocking architectural decision.
  - Evidence: tests cover explicit reviewer selection, default matching reviewer selection, no matching reviewers, reviewer failure behavior, prompt override threading, profile guidance inclusion, and parsed triage output handling.

- [ ] Implement dry-run stack orchestration and CLI rendering.
  - Thesis: `roaster stack run ... --dry-run` exercises profile resolution, reviewer collection, triage planning, manifest/action shaping, and deterministic human/JSON rendering without mutating Branch Memory, GitHub, Graphite, branches, or external systems.
  - Likely areas: `stack_workflow.py`, `cli/roaster/stack/run.py`, result renderers, scenario tests.
  - Policy: direct execution after preview.
  - Evidence: dry-run tests assert no mutating gateway calls, deterministic JSON envelope fields, useful human output, clear target/profile/run/reviewer/batch summaries, and clear failure rendering for invalid profile or invalid triage output.

- [ ] Add the Graphite stack gateway and generated branch/marker support.
  - Thesis: all Graphite-specific stack reads and mutations sit behind a roaster-specific gateway that can attach generated resolution branches above the target implementation stack while preserving lineage to the original target branch/PR.
  - Likely areas: `gateways/graphite_stack/`, generated branch name helpers, generated PR marker/body helpers, gateway fake tests, guarded real `gt` subprocess adapter.
  - Policy: direct execution after preview using fakes and guarded real code; ask first before live Graphite mutation smoke tests or destructive stack repair behavior.
  - Evidence: tests cover stack-tip resolution, generated branch naming, branch-exists behavior, create/update/modify/submit call recording, dependency-first then confidence/risk ordering, generated marker rendering/parsing, and Graphite failure propagation.

- [ ] Implement resolver-loop mutation orchestration and hard safety stops.
  - Thesis: non-dry-run orchestration persists triage, publishes the dashboard, runs one resolver agent per accepted batch at the current stack tip, enforces structured validation/safety reports, creates or updates generated branches, updates manifest/dashboard status, and stops safely on failure.
  - Likely areas: `stack_workflow.py`, resolver prompt/resource, agent runner fake, Branch Memory storage, dashboard publication, Graphite stack gateway fake.
  - Policy: direct execution after preview; ask first before broadening rerun semantics beyond safe update/reuse/fail behavior.
  - Evidence: tests cover zero accepted batches, rejected-only triage, resolver completed/failed/blocked statuses, failed validation, missing validation evidence, safety flags, Branch Memory/dashboard update phases, submit gateway invocation after all successful batches, submit failure status, existing matching batch update, and removed/superseded batch recording where implemented.

- [ ] Add guarded real adapters, README documentation, plugin smoke coverage, and closeout validation.
  - Thesis: the steelthread is usable and inspectable: default prompts are packaged, real adapters fail clearly or run through guarded boundaries, docs explain behavior and safety limits, and plugin/package checks show the feature is integrated.
  - Likely areas: `gateways/agent_runner/real.py`, `gateways/graphite_stack/real.py`, `packages/roaster/README.md`, `packages/roaster/pyproject.toml`, prompt package resources, `tests/scenario/test_plugins.py`.
  - Policy: direct execution after preview for source/docs/tests; do not run live external mutation smoke tests or submit PRs without explicit human confirmation.
  - Evidence: targeted roaster tests pass, roaster plugin smoke covers `stack`, README documents quickstart/dry-run/manual-smoke/Branch Memory/dashboard/rerun/safety behavior, package resources include stack prompts, and any real-adapter unavailable-tool paths are tested or manually inspected.

## Parked

- Final-product polish beyond the steelthread MVP.
- Remote CI waiting, monitoring, or mergeability dashboards.
- Inline GitHub review comments and original review-thread mutation/resolution.
- Deterministic parsing of profile markdown headings or prose.
- Rich profile schema beyond explicit future YAML/frontmatter or CLI flags.
- Full automatic stack surgery for complex reruns where generated branch topology changed substantially.
- Required live disposable mutation smoke tests as Objective completion evidence.
- Automatic PR submission by `objective-stack-impl`.
- Any broad `pr-address` integration or user-facing contract outside `roaster stack`.
