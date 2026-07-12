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

- `changelog-update` portability: keep the "pure git, no external tools" identity (reject
  its T4 push-down) or accept ns-scoping? (audit-findings: docs/retro batch)

Resolved 2026-07-12 (decisions and rationale in
`updates/20260712T150643Z-tranche0-correctness-fixes.md` and the T3-decisions update):
TypeScript rule-fleet ownership; review-skill scaffolding; `project-setup` router
promotion (stays invoke-only); `code-gt-linearize-descendants` submit consent (informed
single confirmation).
