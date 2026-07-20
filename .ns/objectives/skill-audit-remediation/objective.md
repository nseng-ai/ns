---
edges:
  - objective: cmux-exec-occupancy-inventory
    annotation: Graduate record created during this audit's Tranche 4 (frontload item 6); it owns implementing the cmux occupancy inventory exec helper that this remediation chartered but did not build.
  - objective: objective-exec-surface-extension
    annotation: Graduate record created during this audit's Tranche 4 (frontload item 7); it owns the refresh-targets, update/refresh evidence, and retro-reconstruction exec work sized too large for this remediation.
  - objective: slot-gt-restack-preflight
    annotation: Graduate record created during this audit's Tranche 4 (frontload item 8); it owns the restack-preflight and descendants-report exec commands, including the linearize evidence loop the routing retrofit left hand-rolled.
---

# Skill Audit Remediation

## Thesis

The 2026-07-12 full-fleet audit of all 78 first-party skills (run with the consolidated
`skill-audit` skill against the vendored `writing-great-skills` vocabulary) produced 475
findings — 38 HIGH, 226 MED, 211 LOW — recorded in
`references/audit-findings.md`. The fleet is healthy in structure (most skills have sharp
completion criteria and working pointer routing) but carries substantial duplication
(289 findings), sediment, and a handful of genuine correctness bugs where skill text
contradicts the CLIs or repo state it describes. Fixing these in ordered tranches — bugs
first, then per-skill mechanical cuts, then trigger-surface normalization, then
cross-skill single-source-of-truth restructuring — deletes roughly 800+ lines of prompt
burden while preserving behavior, and leaves each meaning with one authoritative home.

Remediation lands as a Graphite stack (or short sequence of stacks) whose branches map to
the roadmap tranches below, so each tranche is independently reviewable and the risky
structural work stacks on top of the safe deletions.

## Scope

- Fix the HIGH behavior/correctness findings: skill text that contradicts actual CLI
  output fields, `just` recipes, brmem namespaces, install state, or sibling-skill
  doctrine (Tranche 0 rows in `roadmap.md`; full list in `references/audit-findings.md`).
- Apply the T1 mechanical cuts across the fleet: delete duplication, no-ops, sediment,
  and negation-shaped restatements per the audit's per-skill findings, preserving intent.
- Normalize the trigger surface (T2): replace legacy `description: "Command: <name>"`
  stubs with real one-line descriptions, convert workflow-summary descriptions to
  triggers, collapse synonym trigger lists, and fix `metadata.internal` drift — all
  through `areg`-sanctioned paths per `docs/conventions/skill-conventions.md`.
- Execute the T3 structural consolidations where the audit identified multi-site
  sources of truth: objective-family umbrella/leaf ownership, the review-skill
  adversarial-review convention (decided 2026-07-12 — see roadmap T3), TypeScript rule
  ownership (decided 2026-07-12: `ts/AGENTS.md` owns repo-specific detail;
  `ns-typescript` is rewritten toward portability), shared family references homed in
  neutral locations, disclosure moves, and TOCs for oversized reference files.
- Decide (accept or reject with rationale) each T4 CLI push-down candidate; implementing
  accepted ones may graduate to follow-on rows or separate Objectives.

## Non-Goals

- No rewriting of vendored skills under real directories in `.agents/skills/`
  (integration-boundary fixes only).
- No behavior changes to what skills instruct beyond correcting verified drift — cuts
  preserve behavior; anything that would change a workflow's semantics needs its own
  decision.
- No replacement of ns-native workflows (Branch Memory, Objective, Graphite, handoff)
  with upstream/generic patterns.
- No invocation-kind changes by hand-editing frontmatter; `areg` owns invocation kind.
- Not a redesign of the skill system, the audit process, or `skill-audit` itself beyond
  its own audit findings.

## Completion Criteria

- Every HIGH finding in `references/audit-findings.md` is either fixed or explicitly
  rejected with a recorded rationale (Semantic Update or roadmap note).
- Tranches 1–3 applied across the fleet: each MED/LOW finding fixed, or dispositioned as
  rejected/deferred in a Semantic Update; the fleet's total SKILL.md line count drops
  materially (audit estimate: ~800 lines from T1 alone) with `wc -l` evidence recorded.
- Each T4 push-down candidate has an explicit accept/graduate/reject disposition; any
  accepted implementation work has a home (row here or its own Objective).
- Every touched skill still passes `areg check`, repo validation (`just`) stays green,
  and touched skills' install state is verified via `areg skill show <name>`.
- A closing audit spot-check on a sample of heavily-edited skills confirms no new
  duplication/sediment was introduced by the remediation itself.

## Assumptions and Risks

- **Assumption — audit accuracy.** Findings were produced by twelve auditor agents with
  verification against CLIs and repo state in the clearest cases (field names,
  justfile recipes, install state), but individual line references and some judgments
  may be wrong or already stale; each tranche re-verifies findings against the live file
  before editing rather than applying the report blindly.
- **Assumption — behavior preservation.** T1 deletions assume the audit correctly judged
  restatements as redundant. Risk: a "duplicate" copy was load-bearing for a skill loaded
  standalone (several families deliberately duplicate for standalone loads — e.g. the
  pi-grill pair's sanctioned self-containment). Mitigation: the audit marked sanctioned
  duplication explicitly; tranche editors honor those markers.
- **Risk — cross-family SSOT decisions are product decisions.** Several T3 items require
  choosing an owner (ns-typescript vs ts/AGENTS.md; typescript-style rule text vs ns
  enforcement ids; review-family generation from the reviews capability; conventions doc
  vs skill-management). Wrong ownership choices could orphan content for non-skill
  harnesses. These are decided per-item during Tranche 3, with the user where ambiguous.
- **Risk — audit/fix races.** Skills evolve on other branches; a tranche landing after an
  unrelated skill edit may conflict or re-verify against moved text. Line references in
  the findings file are anchored to commit e2ffd398e; quoted text is the durable anchor.
- **Risk — T4 scope creep.** CLI push-downs are code work with tests and gateway design;
  bundling them into this Objective could stall the prompt-burden wins. They are parked
  by default and graduate individually.

## Open Questions

None. All human-gated decisions are frontloaded so remaining tranches can run
unattended. Resolved 2026-07-12 (decisions and rationale in
`updates/20260712T150643Z-tranche0-correctness-fixes.md`, the T3-decisions update, and
`updates/20260712T171838Z-decision-frontload-and-runner-policy.md`): TypeScript
rule-fleet ownership; review-skill scaffolding; `project-setup` router promotion (stays
invoke-only); `code-gt-linearize-descendants` submit consent (informed single
confirmation); `changelog-update` portability (keeps its pure-git identity; T4
push-down rejected); all 29 T4 push-down dispositions; the T3 neutral-home policy; the
create-* shared-scaffolding park (rejected).

## Definition of Progress

A tranche slice (family branch or T4 item) counts as progress when: every audit finding
in its scope is either applied or dispositioned with a one-line rationale; per-family
`wc -l` before/after evidence is captured for cut tranches; `just` is green and
`areg check` passes with touched skills verified via `areg skill show <name>`; and a
Semantic Update records the outcome under this slug. The decisions recorded in the
2026-07-12 frontload update are binding — the runner applies them and does not reopen
them.

## Runner Policy

Frontloaded 2026-07-12 so remaining work can run unattended (objective-autorun or
headless objective-next sessions).

- **Scope:** the open roadmap Work rows (T1 mechanical cuts, T2 trigger surface,
  remaining T3 clusters, T4 accepted implementations and graduate records), executed in
  roadmap order, one family/cluster slice per stacked branch.
- **Write scope:** the runner creates stacked branches and commits via Graphite (`gt`,
  per the graphite skill) autonomously. `gt submit` / PR creation and any other
  remote or external write require explicit human confirmation — end each run with the
  stack local.
- **Ambiguity rule:** a finding that proves stale, load-bearing, or otherwise unclear
  against the live file is dispositioned as rejected/deferred with a one-line rationale
  in the slice's Semantic Update; the runner keeps going and never blocks a tranche on
  a question.
- **Validation gate:** nothing is kept or committed without `just` green and
  `areg check` OK; formatter failures go through `just dprint-fix`.
- **Stop conditions:** validation cannot be brought green within the slice; an edit
  would change a workflow's semantics beyond verified drift; work would escape
  `skills/`, `docs/`, the objective record, or the accepted T4 code surfaces; a cut
  conflicts with a sanctioned-duplication marker.
- Interactive sessions still present the standard execution preview; unattended runs
  proceed within this policy without per-session confirmation.

## Closure

Closed 2026-07-20 as completed.

Outcome: the remediation program executed its ordered tranches — correctness bugs, per-skill mechanical cuts, trigger-surface normalization, and cross-skill single-source-of-truth restructuring — and all five accepted Tranche 4 CLI push-down implementations landed (`ns slot gt exec backup-refs`, the `wait-for-checks` primitive, handoff slug normalization plus pickup term-matching, the bundled episode-slice script, and the stack-branches routing retrofit). The three oversized T4 items graduated into their own records (`cmux-exec-occupancy-inventory`, `objective-exec-surface-extension`, `slot-gt-restack-preflight`), which carry that work independently; the audit evidence base remains in `references/audit-findings.md`.

Residue deliberately waived at closure:

- The parked closing audit spot-check (re-running `skill-audit` on the most-edited skills) is dropped as a gate; any future fleet audit starts fresh against the then-current fleet rather than validating this remediation retroactively.
- The areg-mutations note intended for the `skill-management-subsystem` record was not carried over; if areg mutation commands become live work, re-derive the need from the T4 frontload update rather than treating this as tracked.

Closure decision made in the 2026-07-20 open-objective portfolio review (reduce concurrent WIP; this record's implementations were already done and only bookkeeping remained).
