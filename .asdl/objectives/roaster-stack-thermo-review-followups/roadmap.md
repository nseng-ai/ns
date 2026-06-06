# Roadmap

## Work

- [~] Decompose the roaster stack workflow module around stable responsibilities.
  - Context: the thermo-nuclear review flagged `packages/roaster/src/roaster/stack_workflow.py` at 1,198 lines, with dry-run orchestration, mutating orchestration, Branch Memory persistence, resolver input rendering, dashboard projection, Graphite sequencing, target resolution, and CLI-facing summary models all living together.
  - Progress: the first behavior-preserving slice extracted dry-run result contracts/projection helpers into `roaster.stack_dry_run` and shared triage accessors into `roaster.stack_triage_view`; CLI and workflow tests now import the dry-run result model from its canonical module. The next slice extracted resolver-agent input Markdown rendering and its local missing-value formatting into `roaster.stack_resolver_input`; mutating workflow orchestration now calls `render_stack_resolver_input(...)` instead of owning `_resolver_input_markdown(...)` directly.
  - Remaining split points: workflow phase orchestration, run persistence, dashboard projection, and remaining value formatting tied to those concerns.
  - Evidence preserved: dry-run no-mutation assertions remain explicit, targeted resolver-input/workflow tests passed, adjacent roaster stack tests passed, broader roaster/plugin tests passed, and full `just` validation passed.

- [ ] Fix or explicitly narrow Graphite attach-tip semantics for explicit target branches.
  - Context: the gateway exposes `resolve_attach_tip(...)`, and fake tests cover attach-tip resolution, but `_resolve_attach_context` currently treats an explicit `--target-branch` as both the target branch and attach tip.
  - Why this matters: generated resolver branches may attach directly to the named target branch instead of above the top of the implementation stack, undermining the stack-level contract.
  - Preferred direction: call the attach-tip abstraction for explicit target branches if the stack contract requires that behavior; otherwise remove or rewrite the unused abstraction/tests/docs so the limited manual mode is honest.

- [ ] Resolve generated PR marker/body support so it is not misleading dead code.
  - Context: `render_generated_pr_body(...)` and generated PR marker parsing/rendering are implemented and tested, but no production workflow path calls them. The real/fake Graphite gateways create/update/submit branches but do not discover generated PR numbers, update PR bodies, or populate dashboard generated-PR links.
  - Decision needed: either wire a narrow production path for generated PR body/lineage publication, or delete/defer the helpers and update docs/tests to avoid advertising unused behavior.
  - Guardrail: if wiring requires broad GitHub/Graphite capabilities, prefer deferring over smuggling ad hoc integration into the workflow.

- [ ] Make Branch Memory run state a durable audit/resume source of truth.
  - Context: current manifest state records basic identity and generated branches, while dashboard state and partial-failure context are mostly reconstructed from transient in-memory arguments.
  - Desired outcome: persisted run artifacts can explain important outcomes after interruption or failure: batch statuses, generated branch names, resolver artifact locators, dashboard linkage, submission status/failure context, and superseded/removed batch handling where supported.
  - Guardrail: keep this as a simple typed run-state model, not a task database or hidden workflow engine.

- [ ] Reconcile README and tests with the cleaned contracts.
  - Context: the original stack README intentionally documents guarded real adapters, dashboard-only behavior, dry-run safety, and disposable-branch-only mutation smoke guidance. The followups may change attach-tip behavior, generated PR body support, and manifest semantics.
  - Expected evidence: tests cover the revised fake-driven contracts, prompt/resource packaging still works, plugin mounting still works, and documentation no longer claims behavior that production code does not perform.

## Parked

- Broad roaster quality hardening outside the thermo-review findings.
- Live disposable GitHub/Graphite mutation smoke tests unless explicitly requested later.
- Inline review comments or original review-thread mutation/resolution.
- Fully autonomous production Graphite stack discovery if no stable machine-readable `gt` surface is available.
- A rich workflow database or state machine beyond durable Markdown/Branch Memory run artifacts.
