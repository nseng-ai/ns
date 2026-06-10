# Roadmap

## Work

- [ ] Triage candidates 6–11 and record dispositions (implement / reject with reason / park / split), checking prior art first — especially whether Objective disposition conventions already cover the rejection ledger (9) and whether interview practice already covers direction grounding (10) and verifiability ranking (8).
- [ ] Confirm or revise the preliminary verdicts on candidates 1–5 as final dispositions, including the settled decisions (content-anchored checking, no command pre-validation gate, universal/plan-specific STOP split).
- [ ] Design the `plans-write` template additions as one coherent artifact format: provenance stamp, current-state excerpts as drift anchor, in-scope/out-of-scope lists with exclusion reasons, gate discipline with the honest-absence rule, plan-specific STOP section, cold-read final step with harness-labeled model examples.
  - Keep template length accountable to the public-skill token cost; prefer tightening over adding.
- [ ] Design the `planned-branch-impl` protocol section: divergence-from-ground-truth framing up front, pre-step-1 excerpt verification, universal STOP triggers, deviation rule, STOP report shape, pre-contract plan recognition.
- [ ] Implement the bilateral slice — `plans-write` and `planned-branch-impl` together, umbrella `planned-branch` pointer line, upstack-impl-session coverage confirmed.
  - Evidence: skill-audit-style review of the edited skills; harness-neutral wording check; Skill Model Examples rule satisfied.
- [ ] Implement, split out, or close out whatever candidates 6–11 triage accepts, per their recorded dispositions.

## Parked

- CLI push-down of the drift check (`check-drift`-style exec command with content hashing) — until template-level discipline shows the check firing usefully or decaying from skips.
- Generalizing the protocol to `objective-stack-impl` / `handoff-pickup` — their artifacts must adopt the format before the protocol is checkable.
- Severity tiers / drift-kind classification — binary match-or-STOP is the v1.
