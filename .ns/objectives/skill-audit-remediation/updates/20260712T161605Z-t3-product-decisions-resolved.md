# T3 product decisions resolved: TypeScript ownership and adversarial-review convention

## Summary

Both T3-gating Open Questions were decided with the user in-session (2026-07-12).

**Decision 1 — TypeScript rule-fleet ownership.** `ts/AGENTS.md` owns the
repo-specific detail: the test-lane hard gates (`NS_TS_BAN_*`, `test/isolated/` vs
`test/integration/` placement, lane commands) and the time-seam rules with their
package-level specifics (`@nseng-ai/foundation/clock`, `/timers`, `/time/testing`,
`unrefTimerScheduler`). Rationale: despite its name, the `ns-typescript` skill is
designed for reuse in other projects, so it is rewritten toward portability and points
at the host repo's AGENTS.md for repo-specific enforcement; `ts/AGENTS.md` is loaded by
every agent editing under `ts/` regardless of harness, so repo detail there cannot be
orphaned. Today the two files duplicate the same doctrine with divergent wording (the
skill's fake-timers bullet carries remediation advice AGENTS.md lacks; AGENTS.md carries
package specifics the skill states loosely) — classic two-sources drift.

**Decision 2 — review-skill scaffolding.** No codegen and no generation from
`reviewSkillEntryFromDefinition`. Review definitions are LM-authored **adversarial
variants of their source skills** (constructive doctrine inverted into diff-grounded
findings hunting), managed HITL: agent-authored, human-reviewed, occasionally refreshed
and audited. The convention lands as `docs/conventions/adversarial-reviews.md`, with a
pointer from `.ns/reviews/README.md`, generalizing the pattern
`ns-typescript-style-tripwire/review.md` already implements end-to-end: a provenance
block naming source skills, Tier A (diff-grounded, mechanically reviewable, active) vs
Tier B (higher-context, commented out) derivation rules, refresh instructions with
validation commands. The doc also owns the SKILL.md stub template; the five identical
invocation stubs stay hand-instantiated and are marked sanctioned duplication.
Rationale: the derivation is judgment (what is mechanically reviewable per-diff), which
no toolchain captures; the observed failure mode — `code-smell-review` has no skill
stub, `ns-typescript-style-tripwire`'s stub is on a divergent 17-line template — is
addressed by the doc's checklist plus occasional audits rather than reconcile machinery.

Evidence grounding the decisions: five reviews lack provenance blocks entirely;
lineage is heterogeneous (`code-smell-review` is Fowler-derived;
`dry-but-not-too-dry` traces to the Matt Pocock melded set), so the doc must permit
`external/standalone` lineage, and sources may include AGENTS.md files, not just
skills.

The records were also housekept: the two Open Questions answered during Tranche 0
(`project-setup` stays invoke-only; `code-gt-linearize-descendants` uses an informed
single confirmation — decisions recorded in the Tranche 0 update) are pruned from
`objective.md` alongside the two decided here; `changelog-update` portability is the
only remaining Open Question.

## Objective Impact

Tranche 3's two product-decision blockers are gone; T3 is now executable largely
agent-alone. The T3 roadmap row carries the decided direction and the concrete new work
items: write the adversarial-reviews conventions doc, backfill provenance blocks on the
five reviews lacking them (permitting external/standalone lineage), and execute the
TypeScript ownership split (repo detail consolidates into `ts/AGENTS.md`;
`ns-typescript` rewritten toward portability).

## Follow-Ups

- The decisions compose: `ns-typescript-style-tripwire/review.md` derives from both the
  portable style skill and the repo overlay, so when the TypeScript split executes, its
  provenance/refresh sources must add `ts/AGENTS.md`.
- Decide during backfill whether `code-smell-review` should have a skill stub at all or
  is deliberately runner-only; the doc's stub-per-review checklist should record the
  policy either way.
- The `dignified-python-tripwire` review moved to `nseng-ai/ns-python` with its skill;
  if ns-python adopts the adversarial-review convention, it needs its own copy of the
  doc (ns-python currently has no conventions infrastructure).
