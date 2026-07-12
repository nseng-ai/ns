---
edges:
  - objective: skill-audit-remediation
    annotation: Graduated 2026-07-12 from that audit's Tranche 4 CLI push-down dispositions (frontload item 8); its routing-retrofit slice left linearize's per-branch evidence loop hand-rolled pending this record's descendants-report.
---

# ns slot gt exec: restack-preflight and descendants-report

## Thesis

Two deterministic Graphite fact-gathering phases identified by the 2026-07-12 skill
audit belong on the sanctioned `ns slot gt exec` surface beside `stack-branches`,
`stack-map-branches`, `quiescence`, and `backup-refs`. **restack-preflight:**
`objective-runner-step`'s preflight and scope determination — clean-tree check,
gt-tracked check, rebase-in-progress detection, has-upstack-children probe, in-scope
slot-conflict detection — is 4–6 tool calls of pure facts, and the Pi wrapper already
re-implements part of it, so the logic exists in two places today; the audit sized it as
`ns slot gt exec restack-preflight [--downstack] --format json` returning
`{clean, tracked, rebaseInProgress, hasUpstackChildren, slotConflicts[],
effectiveScope}`. **descendants-report:** `code-thermostack`'s per-descendant evidence
loop (topology plus per-branch commit shape, diff stats, and PR metadata — 3+ calls per
descendant bundling gt+git+gh) becomes one
`ns slot gt exec descendants-report <branch> --format json`; the T4 routing retrofit
already pointed thermostack and `code-gt-linearize-descendants` at `stack-branches` for
topology and deliberately left linearize's per-branch evidence gathering hand-rolled
pending this command — linearize is a known waiting consumer.

## Scope

- Implement `restack-preflight` with the audited envelope; retrofit
  `objective-runner-step`'s preflight to the command, the expected fields, and its
  decision table, and route the Pi wrapper's duplicate checks through the same command.
- Implement `descendants-report` (topology + per-branch commit shape + diff stats + PR
  metadata for a branch's descendant subtree); retrofit `code-thermostack` step 2 and
  `code-gt-linearize-descendants`' per-branch evidence gathering to consume it.
- Gateway seams and fake-driven tests per repo conventions; PR metadata behind the
  existing GitHub access patterns.

## Non-Goals

- No judgment in the CLI: thermostack's keep/move/reorder/duplicate/escalate inference,
  runner-step's scope decisions, and linearize's linearization plan stay in the skills.
- No runtime Graphite dependency outside `slot gt` — this record lives entirely inside
  the sanctioned exception (`docs/conventions/graphite-dependency-boundary.md`).
- No parsing of human-facing Graphite display output (`gt ls`, `gt log`) for machine
  facts, and no stack mutation — both commands are read-only preflight/report surfaces.

## Completion Criteria

- Both operations exist with unit and scenario tests and documented JSON envelopes.
- `objective-runner-step` (and its Pi wrapper), `code-thermostack`, and
  `code-gt-linearize-descendants` consume the commands; their hand-rolled loops are
  gone.
- `just` green and `areg check` OK with retrofitted skills verified via
  `areg skill show <name>`.

## Assumptions and Risks

- **Assumption — the audited envelopes fit the consumers.** The field sets sized by the
  audit cover runner-step's decision table and thermostack/linearize's evidence needs;
  divergence is resolved by additive fields, not per-consumer variants.
- **Risk — descendants-report cost.** Per-branch diff stats and PR metadata over a large
  subtree can be slow; the command should bound or batch work and report scope honestly
  rather than silently truncating.
- **Risk — wrapper duplication persists.** If the Pi wrapper keeps its own preflight
  logic after the command lands, the two-implementations problem this record exists to
  fix survives; the retrofit must cover both call sites.

## Open Questions

- Whether `descendants-report` inlines PR metadata or returns locators for a follow-up
  `gh` call when PR volume is large.
- Exact scope semantics shared between `restack-preflight` and the existing
  `quiescence` preflight (overlap must be resolved, not duplicated).
