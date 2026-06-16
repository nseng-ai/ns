# Planned-Branch Plan Contract

## Thesis

Planned-branch plans should become verifiable contracts rather than narratives. The lineage for this workstream is the public upstream `shadcn/improve` skill at https://github.com/shadcn/improve, currently vendored locally at `.agents/skills/improve/` but not expected to remain in this repo permanently. That skill encodes a plan-file discipline — drift detection, verification gates, STOP conditions, scope boundaries, cold-read review — designed to let a zero-context executor implement a plan safely. asdl already has the superior storage and lifecycle layer (branch-attached plans via Branch Memory, Graphite stacking, the planned-branch skill family); what it lacks is that format and execution discipline inside the plan artifact itself.

This Objective triages eleven candidate ideas borrowed from `improve` and lands the accepted ones. The core deliverable is a bilateral change: the `plans-write` skill defines the hardened artifact format, and the `planned-branch-impl` skill defines the matching execution protocol. The two halves are one contract and ship as one slice — a divergence protocol is inert against plans with nothing to check divergence against.

The unifying frame, settled during the advisory conversation that produced the candidates: a plan is a model of reality plus predictions about how it responds to change. Excerpts and gates make model-reality divergence detectable; STOP conditions make it recoverable by returning judgment to the planner. The executor may absorb small, documented prediction errors and must surrender on large ones.

## Scope

In scope:

- Explicit triage of all eleven candidates with a recorded disposition each: implement, reject with reason, park with rationale, or split into a follow-on Objective (the pi-extension-deepening discipline).
- Candidates 1–5 arrive with preliminary verdicts from the advisory conversation; triage confirms or revises them before implementation:
  1. **Content-anchored drift detection** — stamp provenance (SHA, branch, date) into plans for humans; the mechanical check compares the plan's current-state excerpts against live code, never SHA-range diffs (Graphite restacks make SHA ancestry untrustworthy; two-dot tree diffs survive pure restacks but thrash on trunk churn through hot files and on downstack amendments in upstack plans). Verdict: adopt; excerpts double as the drift anchor.
  2. **Verification gates** — asymmetric adoption: machine-checkable done criteria are mandatory and strict (commands and expected results, full validation via canonical entry points like `just` recipes and pnpm scripts); per-step gates required where a targeted check naturally exists, with an honest "no independent gate; verified at step N" escape instead of vacuous gates. Prefer exit codes and grep absence/presence checks over output-shape expectations. Red→green regression-test pairs are the strongest gate shape.
  3. **STOP conditions / divergence protocol** — split universal from plan-specific: universal triggers (excerpt mismatch, gate fails twice, fix needs an out-of-scope file) live once as standing protocol in `planned-branch-impl`, with the divergence-from-ground-truth framing, the deviation rule (documented minimal adaptation judged on merit; silent deviation fails review), and a defined STOP report shape (observed vs expected, work completed, tree state). Plans carry only 2–4 plan-specific assumption conditions.
  4. **Scope lists** — in-scope files as a hard boundary; every out-of-scope entry carries a one-line reason (negative-knowledge transfer). Mechanical review check via `git diff --stat` against the in-scope list, distinguishing executor edits (fail) from repo-mandated autofix formatting (note).
  5. **Cold-read test** — default final step of `plans-write`: a fresh-context subagent on a cheap model reads the plan cold and reports executability gaps only ("what would you have to guess?"), no inference, no style notes; the planner triages before saving.
- Candidates 6–11 have recorded dispositions:
  6. **Trust-nothing review checklist** — implement in-family. The landing surface should be Saved plan closeout/review guidance: rerun done criteria, compare changed files to scope, check deviations, and read meaningful test assertions rather than trusting green commands alone.
  7. **Vetting taxonomy for fan-out audits** — split into a follow-on Objective if pursued. It is useful audit/subagent-fanout discipline, but it is outside the Saved plan / Attached plan contract.
  8. **Verifiability as a ranking input** — reject as a separate branch-context change. It is good `improve` prioritization advice, while asdl Objectives should keep roadmap order semantic and user-directed; selected plan work is already covered by verification-gate requirements.
  9. **Rejection ledger** — reject as already covered. Objective dispositions plus immutable Semantic Updates provide the durable record; a separate ledger would duplicate the Objective model.
  10. **Direction-grounding rule** — split into a follow-on Objective if pursued. It belongs in Objective creation/next-work quality rather than this branch-context contract slice.
  11. **Verification-baseline-first ordering** — implement in-family. Saved plans should establish or confirm a credible one-command validation baseline before risky implementation work when a repository lacks one, without reintroducing a plan-write-time command prevalidation gate.
- Skill edits to `plans-write` (template: provenance stamp, current-state excerpts as drift anchor, scope lists with reasons, gate discipline, plan-specific STOP section, cold-read step) and `planned-branch-impl` (protocol: pre-step-1 excerpt verification, universal STOP triggers, deviation rule, STOP report format).
- A pointer line in the umbrella `planned-branch` skill; the operative protocol lives only in `planned-branch-impl`. The protocol must also govern `/planned-branch:upstack-impl-session`, the most divergence-prone path.
- Harness-neutral wording throughout: these are public, portable skills, and the cold-read step's model-tier guidance must follow the repo's Skill Model Examples rule (concrete OpenAI and Anthropic examples, each labeled with its harness).

Decisions already made during the advisory conversation:

- Content-anchored checking, not SHA-anchored: the SHA is stamped for human forensics only.
- No plan-write-time gating on command pre-validation: the planner is not required to pre-execute every gate command before saving the plan (user decision: "we're not going to gate on that").
- Out-of-family candidates that survive triage are dispositioned as split into follow-on Objectives, not implemented here; this slug names the contract that lives in the planned-branch family.

## Non-Goals

- Do not modify the vendored `improve` skill itself; it stays as-shipped per the repo's vendored-skill policy while present. This Objective borrows ideas, not code, from the public upstream `shadcn/improve` repository so the lineage remains clear even if the vendored local copy is deleted.
- Do not build the drift-check CLI (`cli-push-down` of excerpt/hash comparison) in this Objective; that is Phase 2, parked until template-level discipline proves the check fires usefully or decays from being skipped.
- Do not generalize the protocol to `objective-stack-impl` or `handoff-pickup`; their artifacts lack the excerpt/scope/gate structure that makes the protocol checkable, and wiring it in early reproduces the boilerplate-wallpaper failure mode.
- Do not add severity tiers or drift-kind classification; binary match/mismatch with STOP-on-mismatch is the correct v1.
- Do not adopt improve's `plans/` directory convention, its index file, or its advisor/executor dispatch loop; asdl's Branch Memory attachment and session model remain the lifecycle layer.
- Do not introduce execution policy, runner behavior, or task automation; this is planning-only tracking.

## Completion Criteria

This Objective can close when:

- All eleven candidates have a recorded disposition (implement / reject with reason / park with rationale / split), including confirmation or revision of the preliminary verdicts on candidates 1–5.
- Accepted in-family changes are implemented as a coherent bilateral slice: `plans-write` artifact format and `planned-branch-impl` execution protocol land together, with the umbrella pointer updated.
- The contract handles pre-contract plans gracefully: an implementing agent encountering an old-format plan recognizes it predates the contract rather than half-applying the protocol.
- Skill wording is harness-neutral and the Skill Model Examples rule is satisfied wherever model tiers are referenced.
- Evidence for skill edits is recorded in Objective updates (skill-audit-style review or equivalent, plus any repo checks relevant to touched files).
- A human explicitly agrees the outcome has been reached.

## Assumptions and Risks

Assumptions:

- Content-anchored comparison (excerpts vs live code) is restack-proof and clone-proof in ways SHA-ancestry checks are not; the plan's self-containment excerpts can double as the drift anchor without a separate hashing artifact.
- `plans-write` and `planned-branch-impl` are the correct bilateral hook points: the artifact skill defines the format, the skill loaded at execution time defines the behavior. Standing protocol not in the loaded execution path does not exist behaviorally.
- The five preliminary verdicts from the advisory conversation are sound starting points but not final dispositions; triage may revise them.
- The advisory conversation's full analysis lives in this session's history, not in a durable artifact; this Objective record is the durable summary, so its candidate descriptions must stand alone.
- Existing Objective conventions may already cover candidate 9 (rejection ledger ≈ dispositions); triage should check for prior art before implementing anything.

Risks:

- **Boilerplate decay**: universal STOP conditions restated per-plan become wallpaper. Mitigated by the universal/plan-specific split, but the template must enforce it.
- **Gate theater**: vacuous gates (`exit 0` on steps they cannot observe) are worse than none — they manufacture false confidence. The litmus test: would the command fail if the step were silently skipped?
- **Alarm fatigue**: excerpt drift on hot shared files fires often in an active repo; a check that cries wolf gets rubber-stamped. False-positive cost is bounded (minutes of re-verification at session start) but credibility decay is the real risk.
- **Scope padding**: if scope breaches are painful, planners over-broaden in-scope lists defensively; the counter-pressure is that fat in-scope lists weaken the drift check.
- **Cold-read failure modes**: a strong reader infers gaps away (use a cheap model, report-don't-resolve prompt); an unfocused reader returns noise (executability gaps only).
- **Template inflation**: `plans-write` is a public skill; every added section costs tokens on every plan-write. The contract additions must earn their length, and a skill-audit pass on the edited skills is appropriate evidence.
- **Trial reversibility**: PR #1479 documents the prototype as prompt-policy/test surface only. Rollback is a single PR/commit revert with no migration, compatibility shim, Branch Memory mutation, or long-lived feature flag; dependent work should remain separate until the trial is accepted.
- **Sprawl**: eleven candidates invite scope creep; the disposition discipline and split-out rule are the containment.

## Open Questions

- What evidence threshold justifies Phase 2 CLI push-down of the drift check — drift caught usefully, or the manual check being skipped under context pressure?
- For split candidate 7, what narrower Objective should own fan-out audit vetting taxonomy if it becomes worth pursuing?
- For split candidate 10, what narrower Objective-family refinement should own direction-grounding rules if it becomes worth pursuing?

## Closure

Closed by explicit human agreement after the roadmap reached all checked-off rows and the final open completion criterion was satisfied. The Objective triaged all eleven `improve`-borrowed candidates, landed the accepted branch-context plan-contract slices across Saved plan authoring and branch-context implementation guidance, handled pre-contract plans gracefully, preserved harness-neutral wording, and recorded implementation/review/validation evidence in Semantic Updates.

The plan-contract prototype remains intentionally reversible prompt-policy/test surface rather than a storage migration or runtime feature flag. Parked follow-up ideas remain outside this closed Objective: CLI push-down of drift checking if manual excerpt comparison proves useful or starts being skipped, possible fan-out audit vetting taxonomy work, possible Objective-family direction-grounding work, and any future generalization of the protocol to artifacts that first adopt the checkable plan format.
