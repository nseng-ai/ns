# Handoff: Continue lifecycle remediation plan grill

Continuation focus: Continue the structured `/ns:plan:grill-and-save` session for the thermo-nuclear review findings. Keep the new transaction contract as simple as possible, and inspect/cite Pi’s established prepared-operation or staged-apply pattern as prior art before choosing the exact contract.

## Context

The current branch is `user-lifecycle-artifact-reporting`, the tip of a four-branch stack over `master`. A thermo-nuclear review of the merged stack found five implementation-quality issues. The follow-up request was to grill requirements, write a self-contained implementation plan, and save it with `write_saved_plan_file`. No plan has been saved yet.

The review’s principal defects are:

1. User uninstall removes its declaration before applying bundled Harness artifact removals. A partial failure then leaves no declaration-backed deletion authority, although the error tells the user to rerun uninstall.
2. User npm update mutates the canonical managed package before Extension Descriptor validation and Harness artifact preflight, so a later failure can expose new package bytes with old artifacts.
3. User list loads Extension Descriptors twice through separate descriptor and availability gateways.
4. Effective User-layer loading makes a synthetic failed decision only to recover the Active harness, then decides again.
5. Harness artifact provisioning duplicates the canonical trusted-boundary-root policy.

## Current State

The structured grill started and settled two material choices:

- **User uninstall:** remove targeted bundled Harness artifacts first and remove the User extension declaration last. The declaration remains the deletion authority during retries. This intentionally supersedes ADR 0056’s declaration-first ordering. If the final user `ns.toml` compare-and-write fails, the declaration remains and a retry is safe.
- **User npm update:** stage a candidate package in a separate managed location, validate its Extension Descriptor, and prepare bundled Harness artifact reconciliation before promotion. Preserve the old package during validation and retain rollback information until artifact application succeeds.

The next scope question was shown but canceled before an answer. It asked whether the saved plan should fix all five review findings, only the two safety defects, or the two safety defects plus canonical trusted-boundary cleanup.

Repository validation was clean before planning: `just` passed, including formatting, lint, typecheck, 590 Vitest files, 6,365 tests, sanity tests, dependency checks, and Objective checks.

## Decisions / Findings

- Keep deletion authority explicit and git/config-native. Do not infer authority from install manifests and do not add a hidden durable ownership index; ADR 0056 rejected both.
- Keep cross-Harness artifact application idempotent and retryable. It is not filesystem-atomic.
- The candidate-package update contract is not designed yet. Before finalizing it, inspect Pi code for a small prepared-operation or prepare/apply contract that can serve as prior art. Prefer the smallest discriminated contract that separates preparation from commit; avoid a generic transaction framework.
- Use canonical vocabulary: User extension declaration, Extension Descriptor, bundled Harness artifact, Harness, Active harness, configured `supported_harnesses`, deletion authority, and User extension layer.
- The final saved plan must be self-contained and include goal/outcome, discovered facts, files/symbols/tests/docs, implementation steps, validation, risks/assumptions/open questions, and review/remediation.
- If the plan has same-shape edits across files, apply `skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md`. Prefer precise semantic edits for 1–4 files; use `refactor-swarm` for 5+ file-local mixed edits; require a final stale-name grep for naming changes.

## Next Steps

1. Resume with `grill_ask`; every user-facing grill question must use that tool and ask exactly one question.
2. Re-ask the canceled scope question in Simplified Technical English: all five findings, safety-only, or safety plus trusted-boundary consolidation. Recommend all five only if the contract remains coherent and small.
3. Inspect Pi implementation code and documentation for prior art for a prepared operation, staged candidate, prepare/apply, or rollback-capable contract. Cite exact paths/symbols in the plan; do not rely on vague analogy.
4. Based on that prior art, ask at most one further material question only if a user-visible or data-safety choice remains. Do not ask routine validation questions.
5. Reconcile ADR 0056: add a superseding ADR rather than rewriting the accepted ADR in place, because ADRs are immutable time-in-place records. Update current documentation/context only with the implementation.
6. Produce and review the complete Markdown plan, then call `write_saved_plan_file`. Do not create a branch or write Branch Memory for the plan.

## Investigation Sources

- Source session ID: 019fd877-545a-7b4f-b603-a72c520a3ba7
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-01--/2026-08-06T19-05-26-874Z_019fd877-545a-7b4f-b603-a72c520a3ba7.jsonl
- Related files:
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-WSF7mD/c66c79f0-ff03-404b-a8eb-3da07f628805.jsonl` — lifecycle mutation architecture review evidence.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-oaxehy/8d28d35a-0d9c-4dcb-b94b-c6bf82f4d685.jsonl` — User list/reporting architecture review evidence.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-SKdjh7/96aaaac3-4edc-421b-8deb-9b4005f9662e.jsonl` — SDK and Harness artifact core review evidence.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-UshjaF/6e33cca3-277a-4c76-bd96-2da8974c0129.jsonl` — test and whole-stack review evidence.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-KOGYfc/0ba68429-4836-43ad-9f9e-fcbc8d12bad2.jsonl` — mandatory adversarial challenge and final severity reconciliation.
  - `docs/adr/0056-harness-aware-user-extension-layer.md` — accepted User-layer, deletion-authority, uninstall, and retry contracts that the new design must supersede where necessary.
  - `ts/packages/public/ns/src/init/uninstall-extension.ts` — declaration/removal ordering and broken retry path.
  - `ts/packages/public/ns/src/init/update-extension.ts` — current npm update ordering and artifact preparation.
  - `ts/packages/public/ns/src/init/extension-acquisition.ts` — install/update/uninstall acquisition gateway contracts and fakes.
  - `ts/packages/public/ns/src/init/list-extensions.ts` — duplicate descriptor/availability loading and User artifact reporting.
  - `ts/packages/public/sdk/src/extensions/user-extension-layer.ts` — synthetic first gate decision.
  - `ts/packages/public/ns/src/harness-artifacts/provision-apply.ts` — duplicate trusted-boundary helper.
  - `ts/packages/public/ns/src/harness-artifacts/harness-paths.ts` — canonical Harness path and trusted-boundary resolver.
  - `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts` — main User lifecycle scenarios and missing two-invocation uninstall recovery case.
  - `ts/packages/public/ns/test/extension-acquisition.test.ts` — acquisition gateway contract tests.

## Useful Commands / Files

- Load active orientations: `ns objective exec load-orientations --format md`
- Inspect the stack diff: `git diff master...HEAD`
- Find Pi prior art narrowly: `rg -n --glob '!*.map' --max-columns 300 --max-columns-preview 'prepare|prepared|stage|staged|promote|rollback|apply' .pi ts/packages/incubating/hosts/pi ts/packages/internal/hosts/pi | head -n 200`
- Validate implementation later with repo policy: `just`; add the relevant integration, isolated, sanity, and TypeScript style-guard lanes based on changed boundaries.
