---
edges:
  - objective: skill-audit-remediation
    annotation: Graduated 2026-07-12 from that audit's Tranche 4 CLI push-down dispositions (frontload item 6); its findings are the evidence that the cmux occupancy pipeline is written out near-verbatim in three skills.
---

# cmux Occupancy Inventory Exec Helper

## Thesis

Three observational cmux skills — `ns-cmux-available-work`, `ns-cmux-branch-triage`, and
`ns-cmux-stack-map` — each write out near-verbatim the same deterministic occupancy
evidence pipeline: `cmux tree --all --json`, per-window
`cmux workspace list --window <ref> --json`, per-workspace `git -C <cwd>` HEAD/dirty
probes, and Graphite/Objective enrichment (`ns slot gt exec stack-branches`,
`ns objective list --format json`). Push that deterministic inventory into one read-only
`ns cmux exec` operation returning a compact JSON manifest of workspace facts, branch
facts, evidence scope, and evidence locators; the skills keep only the command, the
expected fields, and the LLM judgment/presentation. `ns-cmux-available-work` already
reserves exactly this boundary ("Future cmux exec helper boundary", pointing at the
private cmux orchestration layer in `ts/packages/capabilities/cmux`); the live surface is
`ns cmux exec` (today only `workspace-summary`). This is real gateway-plus-test work,
sized too large for the skill-audit-remediation Objective that identified it.

## Scope

- Design the manifest shape: cmux windows/workspaces/surfaces, active/caller refs,
  per-workspace cwd + checked-out branch + dirty/detached state, Graphite evidence scope,
  and locators pointing at deeper evidence rather than inlining it.
- Implement a read-only inventory/manifest operation under `ns cmux exec` in
  `ts/packages/capabilities/cmux`, with gateway seams and fakes for the cmux and git
  probes per the repo's fake-driven testing conventions.
- Retrofit the three consumer skills so their evidence-collection sections collapse to
  the command plus expected fields, preserving each skill's judgment and output contract.

## Non-Goals

- No mutation of cmux, Git/Graphite, GitHub, or durable agent state — the helper inherits
  the shared read-only posture in `docs/conventions/cmux-observational-skills.md`.
- No ranking, availability judgment, or presentation in the CLI; row states, linking
  confidence, and rendering stay in the skills.
- Not a general Graphite topology service — `ns slot gt exec stack-branches` /
  `stack-map-branches` already own structured topology; the manifest records scope and
  composes, it does not reimplement them.

## Completion Criteria

- The exec operation exists with unit and scenario tests (no real cmux/git calls in
  tests) and emits the documented JSON manifest.
- All three consumer skills consume the manifest instead of hand-rolling the pipeline,
  with their judgment/output sections unchanged.
- `just` green and `areg check` OK with the retrofitted skills verified via
  `areg skill show <name>`.

## Assumptions and Risks

- **Assumption — one manifest fits three consumers.** The three skills' evidence
  pipelines overlap enough for a single manifest shape; divergent needs (e.g. triage's
  PR facts) are served by locators, not by widening the manifest per consumer.
- **Risk — judgment creep.** The helper could drift into computing availability states
  or rankings; the CLI owns deterministic facts only, per the same boundary the
  Objective exec surface holds.
- **Risk — external cmux contract drift.** `cmux` is an external tool; its JSON output
  changes must be absorbed behind the gateway seam, not in skill prose.

## Open Questions

- Exact operation name and manifest schema (settled at design time within this record).
- Whether per-workspace git probing reuses an existing git gateway or stays local to the
  cmux capability.

## Closure

Intentionally abandoned on 2026-07-12 after re-evaluating the feature following the
`nscc` host deletion. The three intended consumers — `ns-cmux-available-work`,
`ns-cmux-branch-triage`, and `ns-cmux-stack-map` — were removed along with their Pi
backing-skill registrations and consumer-only observational convention instead of being
retrofitted. With no remaining consumer, implementing a new cmux occupancy manifest,
gateway surface, and test suite would recreate infrastructure without live demand.

No inventory command or gateway was implemented. The existing `@nseng-ai/cmux`
capability, its sidebar/dispatch/workspace-summary behavior, and the structured
`ns slot gt exec stack-branches` / `stack-map-branches` operations remain because they
have independent consumers. The unchecked roadmap rows are intentionally canceled. If
a future concrete workflow again needs repeated cmux occupancy collection, it should be
justified from that consumer's current requirements rather than reopening this record.
