# Roadmap

## Work

- [x] Decompose the roaster stack workflow module around stable responsibilities.
  - Context: the thermo-nuclear review flagged `packages/roaster/src/roaster/stack_workflow.py` at 1,198 lines, with dry-run orchestration, mutating orchestration, Branch Memory persistence, resolver input rendering, dashboard projection, Graphite sequencing, target resolution, and CLI-facing summary models all living together.
  - Outcome: behavior-preserving slices extracted dry-run result contracts/projection helpers into `roaster.stack_dry_run`, shared triage accessors into `roaster.stack_triage_view`, resolver-agent input Markdown rendering into `roaster.stack_resolver_input`, renderer-ready dashboard state and workflow dashboard rows into `roaster.stack_dashboard_projection`, and run manifest checkpoint/persistence helpers into `roaster.stack_run_persistence`. `stack_workflow.py` now retains the mutating and dry-run phase orchestration, Graphite sequencing, resolver invocation, and dashboard publication boundary instead of owning every run-state transformation and artifact write helper inline.
  - Accepted boundary: workflow phase orchestration remains in `stack_workflow.py` because moving it would be a broader behavioral refactor; the completed extraction leaves orchestration readable while making persistence, dashboard projection, resolver input rendering, dry-run shaping, and triage views independently reviewable.
  - Evidence preserved: dry-run no-mutation assertions remain explicit, targeted resolver-input/workflow tests passed, adjacent roaster stack tests passed, broader roaster/plugin tests passed, full `just` validation passed for prior slices, targeted workflow/dashboard/dashboard-projection tests plus ruff passed for the dashboard projection slice, targeted run-storage/workflow/dashboard/CLI tests plus README formatting passed for the run-state/docs slice, and the final run-persistence slice passed targeted workflow/run-storage/persistence tests, adjacent stack dashboard/resolver-input/CLI tests, focused type checking, and full `just` validation.

- [x] Fix or explicitly narrow Graphite attach-tip semantics for explicit target branches.
  - Context: the gateway exposes `resolve_attach_tip(...)`, and fake tests cover attach-tip resolution, but `_resolve_attach_context` previously treated an explicit `--target-branch` as both the target branch and attach tip.
  - Outcome: explicit target-branch mutating runs now call `GraphiteStackGateway.resolve_attach_tip(cwd=..., target_branch=...)`, use the returned attach tip for generated branch attachment, and propagate gateway failures. The real gateway fails closed until stable attach-tip support exists instead of pretending direct attachment is safe.
  - Evidence: targeted stack workflow and Graphite gateway tests passed; ruff passed on the touched source/test files.

- [x] Resolve generated PR marker/body support so it is not misleading dead code.
  - Context: `render_generated_pr_body(...)` and generated PR marker parsing/rendering are implemented and tested, but no production workflow path calls them. The real/fake Graphite gateways create/update/submit branches but do not discover generated PR numbers, update PR bodies, or populate dashboard generated-PR links.
  - Outcome: generated PR marker/body helpers remain pure/deferred rendering and parsing utilities only. README and test labels now state that production workflow publication does not discover or edit generated resolver PR bodies until an explicit PR discovery/body-update gateway contract exists.
  - Evidence: dashboard marker/body tests still cover the helpers as pure utilities; README formatting passed.

- [x] Make Branch Memory run state a durable audit/resume source of truth.
  - Context: prior manifest state recorded basic identity and generated branches, while dashboard state and partial-failure context were mostly reconstructed from transient in-memory arguments.
  - Outcome: persisted manifests now record per-batch state, generated branch names/statuses, resolver artifact locators, resolver/failure summaries, dashboard comment linkage, and generated stack submission success/failure.
  - Guardrail: the state remains a simple typed manifest shape, not a task database or hidden workflow engine.
  - Evidence: stack run storage and workflow tests cover manifest round-tripping plus invalid-resolver and submit-failure audit state.

- [x] Reconcile README and tests with the cleaned contracts.
  - Context: the original stack README intentionally documents guarded real adapters, dashboard-only behavior, dry-run safety, and disposable-branch-only mutation smoke guidance. The followups changed attach-tip behavior, generated PR body support, and manifest semantics.
  - Outcome: README now documents attach-tip fail-closed semantics, dashboard-only publication, deferred generated PR body helpers, and the enriched run manifest contract.
  - Evidence: targeted run-storage/workflow/dashboard/CLI tests passed, ruff passed on touched Python files, and `dprint check packages/roaster/README.md` passed.

## Parked

- Broad roaster quality hardening outside the thermo-review findings.
- Live disposable GitHub/Graphite mutation smoke tests unless explicitly requested later.
- Inline review comments or original review-thread mutation/resolution.
- Fully autonomous production Graphite stack discovery if no stable machine-readable `gt` surface is available.
- A rich workflow database or state machine beyond durable Markdown/Branch Memory run artifacts.
