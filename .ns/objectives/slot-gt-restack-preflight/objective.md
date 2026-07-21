---
edges:
  - objective: skill-audit-remediation
    annotation: Graduated 2026-07-12 from that audit's Tranche 4 CLI push-down dispositions (frontload item 8); its routing-retrofit slice left linearize's per-branch evidence loop hand-rolled pending this record's descendants-report.
  - objective: flow-fold-stack-skills-into-workflow-tier
    annotation: Downstream consumer; its restack-resolve and linearize-descendants fold-in slices wire those Flow workflows to this record's restack-preflight and descendants-report primitives.
---

# ns slot gt exec: restack-preflight and descendants-report

## Thesis

Two deterministic Graphite fact-gathering phases identified by the 2026-07-12 skill
audit belong on the sanctioned `ns slot gt exec` surface beside `stack-branches`,
`stack-map-branches`, `quiescence`, and `backup-refs`. **restack-preflight:**
`code-gt-restack-resolve`'s clean-tree, gt-tracked, rebase-in-progress,
has-upstack-children, and in-scope Slot checks become one
`ns slot gt exec restack-preflight [--scope downstack|full] --format json` call. The
command defaults to downstack facts, while generic restacks and the Pi smart-restack
wrapper explicitly request full scope to preserve plain `gt restack` behavior.
**descendants-report:** `code-gt-linearize-descendants`' topology plus per-branch commit
shape, diff statistics, and PR metadata loop becomes one
`ns slot gt exec descendants-report <branch> --format json` call over the complete
transitive descendant subtree.

## Scope

- Implement `restack-preflight` with explicit downstack/full scope; retrofit
  `code-gt-restack-resolve`'s fact gathering and the Pi smart-restack wrapper while
  retaining workflow-owned scope and conflict-resolution decisions.
- Implement `descendants-report` for a branch's complete descendant subtree (topology +
  per-branch commit shape + diff statistics + best-effort inline PR metadata); retrofit
  `code-gt-linearize-descendants`' evidence gathering while retaining focused follow-up
  diffs and proposal judgment.
- Add domain-shaped Git comparison and batched GitHub seams with fake-driven tests per
  repository conventions.

## Non-Goals

- No judgment in the CLI: restack scope selection, conflict-resolution policy, and
  linearize's keep/move/reorder/duplicate/escalate proposal stay in the consuming
  workflows.
- No runtime Graphite dependency outside `slot gt` — this record lives entirely inside
  the sanctioned exception (`docs/conventions/graphite-dependency-boundary.md`).
- No parsing of human-facing Graphite display output (`gt ls`, `gt log`) for machine
  facts, and no stack mutation — both commands are read-only preflight/report surfaces.

## Completion Criteria

- Both operations exist with unit and scenario tests and documented JSON envelopes.
- `code-gt-restack-resolve`, the Pi smart-restack wrapper, and
  `code-gt-linearize-descendants` consume the commands; their matching hand-rolled fact
  loops are gone.
- `just` green and `areg check` OK with retrofitted skills verified via
  `areg skill show <name>`.

## Assumptions and Risks

- **Revised assumption — the resolved envelopes fit the actual consumers.** Repository
  evidence identifies `code-gt-restack-resolve`, the Pi wrapper, and
  `code-gt-linearize-descendants` as the matching consumers; divergence is resolved by
  additive fields, not per-consumer variants.
- **Mitigated risk — descendants-report cost.** The command must return the complete
  subtree; per-branch local Git evidence uses fixed concurrency and GitHub PR metadata
  uses one deduplicated best-effort batch rather than truncating output.
- **De-risked — wrapper duplication removed.** The Pi wrapper now invokes the same
  full-scope `restack-preflight` command through a strict Clinkr-envelope boundary and
  no longer inspects Git directories or worktree operation markers itself.

## Open Questions

- None currently. PR metadata is inline and best-effort; `restack-preflight` defaults to
  downstack scope and reuses only proven quiescence fact mechanics, leaving quiescence's
  snapshot/ref-drift contract private.

## Closure

Completed. Both hidden `ns slot gt exec` helpers now publish tested Clinkr JSON schemas:
`restack-preflight` provides downstack-by-default stack and Slot facts, while
`descendants-report` provides complete deterministic descendant evidence with bounded
local concurrency and best-effort batched PR metadata. `code-gt-restack-resolve`, the Pi
smart-restack wrapper, and `code-gt-linearize-descendants` consume the helpers without
moving workflow judgment or mutation into the CLI. Focused gateway, scenario, and Pi
workflow tests pass; `just`, `areg check`, both `areg skill show` checks, direct
`--json-schema` publication, and the stale-procedure search all pass. No remaining risks
or follow-ups block the delivered outcome.
