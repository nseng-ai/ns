---
edges:
  - objective: skill-audit-remediation
    annotation: Graduated 2026-07-12 from that audit's Tranche 4 CLI push-down dispositions (frontload item 7); the audit findings on objective-refresh, objective-update, and objective-retro are the evidence base for this extension.
---

# Objective Exec Surface Extension

## Thesis

`ns objective exec tracking-gate` proved the pattern: deterministic Objective evidence
lives in a tested CLI operation and the skill keeps the judgment. But only
`objective-next` benefits today. The 2026-07-12 skill audit found the same facts
hand-rolled elsewhere in the family: `objective-refresh`'s "Select targets" is a
deterministic diff/status pipeline over `.ns/objectives/` (path-to-slug reduction, trunk
resolution, merge-base baseline, detached-HEAD check) sized as a `refresh-targets` exec
operation returning `{slugs, trunk, baseline, dirtySlugs}`; `objective-update` and
`objective-refresh` both hand-roll trunk/base/diff evidence that tracking-gate already
computes for objective-next — one fact set, three mechanics; and `objective-retro`'s
reconstruction steps (trunk commits touching the record, sha-to-PR resolution via
`gh api`, cross-checked signals, file union) meet every push-down threshold but the retro
skill's own Boundaries currently ban new `ns objective exec` operations. This Objective
extends the exec surface to close all three gaps, including deliberately amending that
Boundaries ban.

## Scope

- Implement `ns objective exec refresh-targets` and retrofit `objective-refresh`'s
  Select-targets section to consume it (the skill keeps the selection policy).
- Extend tracking-gate-style deterministic evidence to `objective-update` and
  `objective-refresh` — additively reuse or generalize the existing tracking-gate
  operation rather than minting a third mechanics variant.
- Add a reconstruction exec operation for `objective-retro`'s evidence phase (delivered
  trunk commits, PR resolution, file union with confidence signals) and amend the retro
  skill's Boundaries so the ban is lifted for this sanctioned operation.
- Retrofit the consumer skills so each evidence section is the command plus expected
  fields.

## Non-Goals

- No Markdown-meaning parsing in CLI code: headings, roadmap checkboxes, and prose stay
  skill-interpreted per the Objective system's v1 rule; the exec surface owns
  deterministic facts only.
- No new mutation surface — the exec extension is read-only; record writing stays
  skill-owned.
- No breaking change to the existing `tracking-gate` contract consumed by
  `objective-next`; extensions are additive.

## Completion Criteria

- `refresh-targets` exists with tests and `objective-refresh` consumes it.
- `objective-update` and `objective-refresh` consume CLI-computed trunk/base/diff
  evidence with hand-rolled pipelines removed; `objective-next`'s gate is unchanged.
- The retro reconstruction operation exists with tests, `objective-retro` consumes it,
  and its Boundaries text reflects the sanctioned operation.
- `just` green and `areg check` OK with retrofitted skills verified via
  `areg skill show <name>`.

## Assumptions and Risks

- **Assumption — one evidence model serves three skills.** Tracking-gate's computed
  facts generalize to update/refresh needs with additive fields rather than a parallel
  operation; if the shapes genuinely diverge, prefer small sibling operations over one
  overloaded envelope.
- **Risk — retro archaeology is inherently fuzzy.** Post-merge reconstruction carries
  confidence and gaps; the CLI must report signals and let the skill judge, or it will
  fabricate completeness the retro skill explicitly warns against.
- **Risk — contract drift for existing consumers.** objective-next's no-hand-rolled-
  pipelines rule means any tracking-gate change ripples into skill text; keep changes
  additive and re-verify the consumer skills.

## Open Questions

- Whether update/refresh evidence is served by widening `tracking-gate` or by sibling
  operations sharing its internals.
- The reconstruction operation's name and envelope (settled at design time within this
  record).

## Closure

Closed 2026-07-20 as deferred before execution.

Outcome: no roadmap row was executed and no update was recorded since creation. The design remains fully preserved in this record: extend `ns objective exec` with a `refresh-targets` operation for objective-refresh, shared trunk/base/diff evidence for objective-update/refresh (widening `tracking-gate` or sibling operations — an open question settled at design time), and the retro-reconstruction pipeline, including deliberately amending the retro skill's Boundaries ban. The evidence base (the 2026-07-12 skill audit findings on objective-refresh, objective-update, and objective-retro) lives in the closed `skill-audit-remediation` record's references.

Restart pointer: the record's Scope, Risks (report-signals-not-judgment for retro; additive tracking-gate changes), and Open Questions are the complete restart state. If the hand-rolled evidence pipelines in the objective skill family start causing real drift or token cost, resume from here; nothing needs re-deriving.

Closure decision made in the 2026-07-20 open-objective portfolio review (created but never started; not in the active lanes).
