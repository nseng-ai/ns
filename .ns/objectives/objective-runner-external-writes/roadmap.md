# Roadmap

This is a steelthread autoobjective. Each row is one committable Runner slice; the final row is the one real external-write proof. Breadth already decided but deliberately deferred is recorded under `## Parked`, not rediscovered during the thread.

## Work

- [x] **Amend the Runner contract around parent-only publication.** Record the conditional exception to ADRs 0022/0024: the implementation child remains forbidden from external writes; after `runner-finish`, parent judgment and material Objective tracking, an explicitly authorized parent publisher may act. Specify the two-key gate, one-invocation Objective/branch/existing-PR binding, best-effort PR update, and cumulative managed-section contract. Update runner/autorun skill guidance and the canonical forbidden-action wording so it cannot be mistaken for permission to publish from the child.
      Policy: local docs and contract tests only; choose exact names within the settled semantics, but steer if the design requires Markdown parsing or persistent authorization state.
      Evidence: ADR 0037 and its 0022/0024 refinement annotations define the ordering, trust zones, invocation scope, and partial-failure semantics; runner/autorun guidance and canonical prompt consumers preserve the absolute child/step prohibition. Focused Objective tests and full `just` passed on the implementing branch.
- [x] **Add publication authorization and pre-mutation facts.** Extend the parent orchestration/tool input and Objective-owned core with an explicit launch attestation and a bound publication target: Objective slug, current branch, existing PR identity/head, and launch baseline. Re-check the binding immediately before mutation and refuse missing/mismatched PR, branch drift, Objective mismatch, dirty/unverified state, or absent authorization.
      Policy: use prose-independent structured invocation facts; no Objective tags/frontmatter and no child-visible credential or write permission.
      Evidence: versioned Zod contracts and pure bind/recheck policy now bind invocation, Objective, branch, existing PR, launch/remote heads, and cumulative summary facts. Fake-driven unit tests cover invalid attestation, invocation expiry, target drift, dirty/unverified state, ancestry, and Runner trailer mismatches without any mutation path.
- [x] **Expose the narrow Flow publication mechanics.** Provide the curated Capability API needed for guarded fast-forward push, current-branch existing-PR verification, and idempotent managed-body update while preserving non-managed prose. Objectives owns eligibility and Objective Runner summary policy; Flow owns Git/Graphite/GitHub mutation mechanics and execution-channel wiring. Do not deep-import Flow internals or create a second generic GitHub gateway in Objectives.
      Policy: follow Consumer Gateway and capability-boundary conventions; no PR creation, stack submit, force-push, comments, merge, or rollback.
      Evidence: `@nseng-ai/flow/api` now exposes a branch-publication client backed by narrow repository and PR gateways. Fake-driven tests prove target binding, refusal and partial-failure ordering, and managed-body preservation; a disposable bare-remote integration test proves the non-force push path. Flow package tests and native TypeScript check passed.
- [ ] **Publish after verified checkpoint judgment.** Wire the trusted orchestrator so a successful local Runner step can, after parent-authored material Objective tracking, push the bound branch and best-effort regenerate one cumulative `Objective Runner` PR section from parent-supplied summary evidence: slug, published commits, validation, and escalatable decisions. Push failure is a publication failure; PR-edit failure is precise best-effort evidence and does not invalidate the successful push or stop later implementation steps. A later successful edit replaces the complete managed section and heals stale content.
      Policy: the implementation child remains credential-blind; only the parent entrypoint binds host Git/GitHub authentication. Every escalatable runner judgment must already be durable in the selected Objective before it is summarized for the PR.
      Evidence: tests cover success, push refusal/failure, push-success-plus-PR-failure, later healing, preserved human prose, and no rollback call.
- [ ] **Run the existing-PR steelthread probe.** On a disposable or deliberately selected non-trunk branch with an existing PR and an Objective whose Runner Policy opts in, launch one explicitly authorized autorun invocation, complete at least one real Runner slice, record any material decision in that Objective, push the resulting commits, and verify the cumulative managed PR section. Inspect that the child had no credentials/write authority and that no other branch or PR changed.
      Policy: steer first for the exact live Objective/branch/PR and fresh launch authorization; this is the only row permitted to perform external writes. Do not merge, land, submit a stack, deploy, or publish anything else.
      Evidence: bounded branch/PR identifiers, pushed commit SHAs, preserved PR prose, managed-section contents, denial-path evidence, and full relevant validation recorded in a Semantic Update without secret material.

## Parked

- PR creation for branches without an existing PR.
- Full Graphite stack submit/restack and multi-PR summary propagation.
- Merge/land, release publication, deployment, issue mutation, and arbitrary write APIs.
- Persistent, repository-wide, or cross-session publication grants.
- PR comments or full-body ownership instead of one preserved managed section.
- Automatic remote rollback, force-push recovery, or remote-history repair after partial publication.
- Short-lived branch/PR-scoped credential minting; promote if host credential breadth proves unacceptable.
- Required final PR-summary reconciliation or durable retry state; promote if best-effort updates commonly remain stale.
