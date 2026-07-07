---
edges:
  - objective: skill-management-subsystem
    annotation: Subobjective of this umbrella — remediates the confirmed findings from the 2026-07-06 thermo-nuclear review of the harness-artifacts stack (provisioning subsystem, AREG inspector slim-down, ns/ns-init wiring) before the stack's breadth work continues.
---

# Harness Artifacts Thermo Remediation

## Thesis

The 2026-07-06 thermo-nuclear code quality review of the harness-artifacts stack (31 commits, +7.9k/−4.2k, reviewed at `c757dc9ac`) judged the architecture fundamentally sound but surfaced 5 HIGH and 10 MEDIUM findings that clear the presumptive-blocker bar, plus a LOW tail. Every finding survived an adversarial challenge pass. This Objective manages fixing all of them as an **autoobjective**: repeated Objective Runner steps with parent checkpoints, each committed slice stacking on the previous one via Graphite, on top of the existing unmerged stack (tip: `harness-artifacts-review-feedback-remediation`).

The five HIGHs: (H1) the `homeDir ?? env.HOME ?? ""` sentinel lets `ns skills`/`ns update` silently write user-scope artifacts to cwd-relative paths; (H2) reconcile runs the full provisioning pipeline twice per artifact and force-applies on stale preview decisions because "conflicted" is modeled as an apply-layer error instead of an outcome; (H3) AREG kept its entire dead GitHub gateway subsystem; (H4) AREG kept a dead prompt gateway beside the live `ctx.interaction.confirm` seam; (H5) the mutation-policy mechanism survived with a single variant and a statically dead branch. The MEDIUMs cover text-only (binary-corrupting) provisioning I/O, the reconcile collision hard-fail that bricks `ns update` on one bad extension, the hardcoded first-party root sentinel, the duplicated first-party provisioning assembly, dishonest repo-local descriptors, the `.git`-marker projectRoot fallback, duplicated fs plumbing, dead planner branches, AREG layering residue, and ns-init dead surface. The full review text is the source of truth for finding details; this record tracks their remediation.

## Scope

- All 5 HIGH findings, remediated as reviewed (details per roadmap row).
- All 10 MEDIUM findings, each remediated or explicitly parked with a Semantic Update recording the rationale.
- One opportunistic LOW sweep (dead exports, identity wrappers, naming drift, casing double-encoding, misc residue), executed alongside adjacent slices rather than as standalone churn.
- Touched surfaces: `ts/packages/capabilities/harness-artifacts`, `ts/packages/tools/areg`, `ts/packages/capabilities/ns-init`, and — only for the homeDir seam decision — `ts/packages/kernel` (`NsExtensionApi`).
- Re-verification of each finding against current code before implementing it (the stack changed once mid-review; line references may drift).

## Non-Goals

- Relitigating the review or re-running it; findings the adversarial challenge already killed stay dead.
- Remedies the challenge pass explicitly rejected: unifying the deliberately-narrow fs state ADTs into `PathState`/`TextFileState`, single-pass declaration parsing (would change tested duplicate-flagging semantics), and dropping the duplicate-name pre-pass.
- New features or breadth in the skill-management subsystem (that belongs to the umbrella's parked rows and future Subobjectives).
- Widening AREG beyond its inspector-plus-skill-kind-mutation role.
- PR submission, pushing, merging, or managing the underlying stack's landing.

## Completion Criteria

- Every HIGH finding is remediated with completion evidence (tests exercising the fixed behavior where behavior changed; deletion confirmed by grep where the remedy is deletion) and full repo validation green.
- Every MEDIUM finding is either remediated or parked with an explicit rationale in a Semantic Update; none is silently dropped.
- The LOW sweep row is done or explicitly parked.
- The remediation branches form a reviewable Graphite stack on top of the reviewed stack.

## Definition of Progress

Progress is keepable when:

- a roadmap row's remediation is implemented, validated (`just` green, full TS suite), and committed as its own stacked branch/commit;
- a finding is re-verified as already fixed or invalidated by upstream stack changes, recorded via Semantic Update;
- a decision-bearing row (repo-local descriptor honesty, kernel homeDir exposure) reaches a confirmed decision recorded in the record.

Do not keep changes that:

- change behavior beyond what the finding's remedy prescribes;
- mix multiple roadmap rows into one commit without checkpoint approval;
- leave validation red or tests skipped.

Useful evidence includes: grep output proving dead code is gone, before/after I/O counts for H2, targeted tests for H1's explicit-error path and the collision-skip policy, and `just` output.

## Runner Policy

This Objective is execution-friendly for `objective-next` and designed for `objective-autorun` under the boundaries below.

- Direct execution is allowed when: the slice is behavior-preserving deletion, refactoring, or internal restructuring (H3, H4, H5 sweeps; fs plumbing consolidation; dead planner branches; ns-init dead surface; LOW sweep; sentinel derivation; test-fixture fixes), validated by full repo validation.
- Steer or ask first when: the slice changes machine-facing contracts or user-visible behavior — error variants and codes (H2's `locally_edited_conflict` removal, `init-*` code renames, check/doctor code alignment), `ns update` failure semantics (collision skip-and-report), CLI JSON output shapes — or touches the kernel `NsExtensionApi` surface (H1's homeDir exposure), or a finding no longer matches current code on re-verification.
- How work may change files and be left: edits under the packages named in Scope plus their tests; each committed step is a clean stacked Graphite branch; no uncommitted work left across steps.
- Validation before keeping work: `just` (full repo validation) green per step; formatting via autofixers only.
- What will not happen unless explicitly requested: PR submission or updates, pushing, publishing, restacking/reshaping the underlying reviewed stack, edits outside the Scope packages, or external system writes of any kind.

## Assumptions and Risks

**Assumptions**

- The remediation stacks on top of the current unmerged stack (tip `harness-artifacts-review-feedback-remediation`); if the stack merges or is reshaped mid-flight, the remediation restacks onto the new base rather than re-planning.
- The review's findings were verified at `c757dc9ac`. The branch changed once mid-review already, so each finding is re-verified against current code before implementation; a finding invalidated upstream is closed by Semantic Update, not silently skipped.
- ns is private and unreleased, so machine-facing contract changes (error codes, failure semantics) have no external consumers to migrate; in-repo consumers are updated in the same slice.

**Risks**

- H2 restructures the manifest write path (conflict-as-outcome, single prepare); a regression here corrupts install manifests. Mitigation: the existing reconcile/provision test suites plus new tests around the conflict outcome before the old error variant is deleted.
- The reconcile collision-policy change (skip-and-report instead of hard-fail) alters `ns update` semantics; if the skip policy is wrong, colliding artifacts could be silently half-provisioned. Mitigation: steer-first row policy and explicit tests for the collision report.
- Two rows are decision-bearing with real alternatives (repo-local descriptor honesty: manifest+parity-test vs plain catalog entries; H1: kernel `NsExtensionApi` exposure vs capability-local resolution). Runner must not pick unilaterally — both carry ask-first row policy.
- Upstream stack activity is live (mid-review commits observed); parallel edits may conflict with remediation slices. Mitigation: re-verify per slice and restack early.

## Open Questions

- H1 seam: expose the kernel-computed `homeDir` on `NsExtensionApi` (deletes all three capability-side re-derivations) or fix locally in a shared capability helper? Kernel exposure is the reviewer's recommendation but widens a kernel surface.
- Repo-local descriptor honesty: check in `.ns/extensions/skills/` + parity test, or convert to plain preinstalled-catalog entries? Depends on whether repo-local exposure of the skills group is actually wanted.
- Should the first-party root sentinel gain a real (non-injected) integration test for the upward walk, and where does it live?
