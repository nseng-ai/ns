# Systemic #1 rebaselined to five invocation kinds; Objective assessed closure-ready

## Summary

Trunk-style objective-refresh against HEAD (`141ac24df`; branch cut from trunk at
`8fdc6f50`, no slug commits since). The record was already accurate and largely
verified; two stale facts inside systemic #1 were corrected, and the Objective was
assessed for closure.

Verified this pass (probe-backed):

- **`areg check` reports "All skills OK"** (re-run 2026-07-05) — the systemic #1
  durable deliverable (no listed-but-unroutable stub; kinds registry-managed and
  enforced) still holds.
- **The fifth invocation kind `unlisted` has landed** — 9 references in
  `docs/adr/0016-skill-invocation-context-budget.md`, 6 in
  `docs/conventions/skill-conventions.md`. `areg skill list` shows `setup-graphite`
  and `create-python-package` as kind `unlisted` (`NATIVE hidden`, `PI excluded`) with
  real descriptions restored, and `project-setup` as kind `normal` — the eight
  project-bootstrap leaves now sit behind a single ambient `project-setup` router
  (`skills/project-setup/SKILL.md` present). This resolves the explicit follow-up logged
  in update `20260704T160939Z` ("update four kinds → five kinds on the next refresh").
- **All DONE per-skill targets verify at the line-count level** against their recorded
  rewrite evidence: `brmem` 270, `dignified-python` 130, `refactor-swarm` 138,
  `objective-create` 85, `objective-close` 78, `objective-update` 183, `handoff-create`
  123, `ccc-available-work` 194, `ccc-stack-map` 115, `code-gt-restack-resolve` 314,
  `code-resolve-merge-conflicts` 221, `code-thermostack` 156, `objective` 157.

Corrected in `objective.md` / `roadmap.md` (targeted, not a rewrite — the record's
narrative, scope, and criteria were verified intact):

- systemic #1 "areg's four kinds" → "five kinds", adding `unlisted` to the enumeration.
- The `setup-*` / `create-*` family, previously recorded as `command-backed`, is now
  `unlisted` behind the ambient `project-setup` router (PRs #2867/#2869, commits
  `44612a600`/`695ea59bd`, 2026-07-04); `project-setup` added to the `normal`
  routers/standards list.
- The residual `Command:` stub example `setup-graphite` was stale (it now carries a real
  description) — swapped to `ns-flow-submit`, which still shows `description: "Command:
  ns-flow-submit"`. Also refreshed the `sdl-flow-submit` → `ns-flow-submit` rename in the
  roadmap residual-work note and the `areg check` verification date to 2026-07-05.

## Objective Impact

- Systemic #1 framing is current again; the deliverable is unchanged (additive taxonomy
  extension, not a reversal).
- **Closure assessment: closure-ready, not closed.** All three systemic findings are
  resolved and the per-skill queue is recorded exhausted (every ≥5 target DONE, dropped,
  deferred, or parked with a reason). Two things kept this refresh from closing inline:
  (1) completion criterion "no verbatim-duplicated contract remains among the ≥5 skills"
  is a repo-wide quality claim not cheaply probe-verifiable without re-running the audit
  lens — only line counts and `areg check` were confirmed; and (2) the per-skill
  remediation row is deliberately `[~]`, and closing a multi-session Objective of this
  size warrants an explicit user outcome/rationale call. Remaining open items are a
  parked Non-Goal (polish tier) and an externally-gated cleanup (the
  `code-gt-restack-resolve` TEMPORARY block), neither owned by this Objective.

## Follow-Ups

- User decision: close the Objective (flip the per-skill row to `[x]` and record
  `## Closure`) or keep it open for a final "no-duplication-remains" verification sweep
  across the ≥5 set.
- The two parked elevation candidates (`ccc-branch-triage`, `handoff-pickup`) remain
  parked; confirm they are out of the ≥5 set (clarity candidates, not duplication) at
  closure time.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
