# Systemic #3 resolved — branch-creation policy single-homed

## Summary

The branch-creation precedence policy now lives in exactly one home. On branch
`single-home-branch-creation-policy` (commit `a496d0b6b`, base
`add-skill-content-remediation`), `skills/branch-context-from-plan/SKILL.md` Workflow
steps 3–4 were collapsed into a single step that keeps the load-bearing repo default
inline (`--branch-creation graphite`) and points to the single home for the full
precedence rules. `skills/branch-context/references/lifecycle.md` is unchanged — it was
already the canonical, fuller copy (it carries the portable-default sentence and the
`--branch` note), so deleting the `from-plan` copy lost no information.

## Objective Impact

- Roadmap `## Work` Systemic #3 row marked `[x]` with completion evidence.
- Scope finding corrected: the policy was duplicated **2×** (two full copies in
  `from-plan/SKILL.md` and `lifecycle.md`), not "triplicated" as originally recorded.
  No third full restatement existed; `branch-context-impl`, `enriched-plan-save`, and
  `diagnostics-admin.md` do not restate the policy.
- Two systemic findings remain open (Systemic #1 stub descriptions, Systemic #2 grill
  pair), plus the disclosure-surgery and duplication-collapse roadmap rows. Objective
  stays open.

## Follow-Ups

- None for Systemic #3. Verification evidence (single home, inline repo default,
  reachable pointer, valid frontmatter, contiguous steps) confirmed at implementation
  time. The edit landed in the real `skills/` source, respecting the symlink-layout
  risk.
