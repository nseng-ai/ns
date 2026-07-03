# Roaster Stack Thermo Review Followups

## Thesis

The submitted `roaster-graphite-stack-workflow` stack passed targeted validation, but the thermo-nuclear code quality review found several maintainability and integration issues that should be tracked as durable follow-up work before the roaster stack workflow is treated as structurally clean.

This Objective tracks the concrete findings from that review: decompose the overgrown workflow module, fix the Graphite attach-tip integration contract, resolve unused generated-PR marker/body support, and make persisted run state rich enough to support safe resume and audit.

## Scope

- Preserve the behavioral intent of the submitted roaster Graphite stack workflow while improving its structure.
- Reduce `packages/roaster/src/roaster/stack_workflow.py` from a 1,198-line orchestration catch-all into clearer layers for workflow phases, persistence, dashboard projection, resolver input rendering, and result shaping.
- Fix or deliberately narrow the attach-tip behavior so explicit `--target-branch` does not silently bypass the Graphite stack-tip abstraction.
- Resolve the generated PR marker/body mismatch: either wire a narrow production path that uses the helpers, or remove/defer the helpers and documentation until they are real workflow behavior.
- Enrich durable run state so Branch Memory can explain partial runs, generated branch status, dashboard linkage, resolver artifact linkage, submission status, and failure context without relying only on transient in-memory state.
- Carry forward the review evidence and reasoning from the thermo-nuclear review so future implementers understand why these are structural followups rather than cosmetic cleanup.

## Non-Goals

- Do not reopen the whole `roaster-graphite-stack-workflow` Objective or re-plan all nine original implementation slices.
- Do not require live GitHub or Graphite mutation smoke tests as part of this Objective.
- Do not broaden into generic roaster quality hardening beyond the concrete thermo-review followups unless a direct implementation dependency is discovered.
- Do not add inline GitHub review comments or original review-thread resolution behavior; the dashboard-only MVP remains acceptable unless the generated-PR body decision explicitly changes the contract.
- Do not introduce a new Objective state system, hidden metadata, or task database behavior.

## Completion Criteria

- `stack_workflow.py` no longer functions as the catch-all home for every stack concern; the resulting module boundaries make orchestration, persistence, dashboard projection, resolver input rendering, and dry-run/result shaping easier to review independently.
- The explicit target-branch path either uses the Graphite attach-tip abstraction or the unused abstraction and docs/tests are removed or rewritten to match the real reduced behavior.
- Generated PR marker/body support is no longer misleading dead code: it is either wired into the workflow through a narrow tested path or explicitly deleted/deferred with docs/tests updated.
- Persisted Branch Memory run state records enough information to reconstruct important run outcomes and partial failures, including generated branch/batch status and dashboard/resolver artifact pointers where relevant.
- Tests cover the changed contracts, including dry-run no-mutation guarantees and the relevant fake-driven Graphite/Branch Memory/dashboard behavior.
- The resulting README and Objective/roadmap context no longer overstate capabilities that the code does not provide.

## Assumptions and Risks

Assumptions:

- The thermo-nuclear review evidence is current for branch `roaster-stack/docs-closeout`: `gt ls` showed the full submitted stack above `master`, targeted stack tests passed with `64 passed`, and the review inspected `master..HEAD` rather than only the top branch.
- The most important structural issue is not correctness failure but maintainability debt: `stack_workflow.py` reached 1,198 lines and now owns too many concepts.
- The attach-tip gateway abstraction is intended to represent where generated resolver branches attach above an implementation stack; explicit `--target-branch` mutating runs now use that abstraction and fail closed until real attach-tip resolution is implemented.
- Generated PR marker/body helpers were intended as lineage support, but production code does not have a gateway contract to discover generated PR numbers or edit generated PR bodies; the helpers are now documented as pure/deferred utilities rather than production publication behavior.
- Branch Memory run artifacts are meant to be durable audit/resume state, not merely temporary scratch output; manifests now record batch states, resolver locators, dashboard linkage, and submission outcomes.

Risks:

- Decomposing `stack_workflow.py` could accidentally change safety ordering. In particular, Branch Memory/dashboard writes, resolver execution, branch mutation, and `gt submit` must retain their intended hard-stop behavior.
- The decomposition slices de-risked behavior-preserving extraction paths: dry-run result contracts/projection helpers now live outside `stack_workflow.py`, shared triage views are pure helpers, resolver input rendering now lives in `roaster.stack_resolver_input`, dashboard projection now lives in `roaster.stack_dashboard_projection`, and run manifest checkpoint/persistence helpers now live in `roaster.stack_run_persistence`. The remaining workflow ownership is accepted phase orchestration rather than an unresolved catch-all concern, with targeted and full validation preserving the safety-ordering guardrail.
- Fixing attach-tip behavior exposed the absence of a stable real Graphite attach-tip implementation; the workflow now prefers a guarded/fake-covered boundary and fails closed for real mutating explicit-target runs instead of speculative live Graphite parsing.
- Wiring generated PR body support requires broader GitHub/Graphite integration than this Objective should smuggle in; generated PR body publication is now explicitly deferred until PR discovery/body-update gateways exist.
- Richer manifest/run-state modeling can become overdesigned. The implemented manifest state is intentionally limited to durable audit/resume facts: batch state, generated branches, resolver locators, dashboard linkage, submission status, and failure context.

## Open Questions

- No active open questions remain. The final decomposition slice extracted run-persistence helpers and intentionally left workflow phase orchestration in `stack_workflow.py` as the accepted boundary for this Objective.

## Closure

Completed. The thermo-review followups are resolved as behavior-preserving structural cleanup: dry-run shaping, triage views, resolver input rendering, dashboard projection, and run manifest checkpoint/persistence helpers now live outside `stack_workflow.py`; explicit target-branch attach-tip behavior fails closed through the gateway boundary; generated PR marker/body support is documented as pure/deferred rather than misleading production publication behavior; durable Branch Memory run manifests carry batch, resolver, dashboard, submission, and failure context; and README/tests now describe the cleaned contracts.

Evidence: local working-tree implementation on branch `roaster-run-persistence-checkpoint-extraction` extracts run persistence into `packages/roaster/src/roaster/stack_run_persistence.py`, adds focused unit coverage in `packages/roaster/tests/unit/test_stack_run_persistence.py`, and keeps `packages/roaster/src/roaster/stack_workflow.py` as orchestration rather than the catch-all home for every stack concern. Verification passed with targeted workflow/run-storage/persistence tests, adjacent roaster stack dashboard/resolver-input/CLI tests, focused type checking, and full `just` validation.

Caveats and follow-ups: live disposable GitHub/Graphite mutation smoke tests, real Graphite attach-tip discovery, inline review-thread mutation, generated resolver PR body publication, and broader roaster quality hardening remain parked or out of scope unless future work explicitly takes them up.
