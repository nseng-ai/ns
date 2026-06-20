---
name: objective
description: "Use for conceptual questions about asdl Objectives, objective list, explicit Objective consolidation/subsumption guidance, and as shared grounding with Objective command skills. Read-only."
---

# objective

Read-only grounding for Objective skills. Do not mutate files from this skill.

## Concept

An Objective is a checked-in durable narrative roadmap for multi-session, multi-branch, or multi-PR work.

Active root:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md  # optional marker
```

The archive root mirrors this layout under `.asdl/objective-archive/<slug>/`; the `closed.md` marker is preserved when present. Do not use `docs/objectives/`.

Archive state is represented by location. `objective archive <slug>` moves the whole record out of active discovery; `objective archive <slug> --unarchive` moves it back. Open and closed Objectives can both be archived. Archive/unarchive preserve the slug and every file in the record directory.

## Objective skill family

`objective` is the umbrella/reference skill for shared Objective vocabulary, storage model, selection rules, status semantics, safety boundaries, and cross-cutting policy. Per-operation procedures stay in the step skills.

Use these step skills for explicit workflow requests:

- `objective-create`: create one new active Objective record. It does not update existing records, create an initial Semantic Update, or close anything.
- `objective-next`: recommend-first router for one selected open Objective. It reads and recommends by default; it mutates only through an explicit confirmed `objective-update` handoff for stale tracking, or through the confirmed execution path when durable Runner Policy allows it.
- `objective-update`: update exactly one selected active Objective; when its Closure Gate is clearly ready and the outcome/rationale are clear, it may close the Objective inline without a separate confirmation.
- `objective-refresh`: non-closing verified rebaseline for active Objective records. It may append Semantic Updates but never creates `closed.md` or `## Closure`.
- `objective-close`: explicit close only. It records `## Closure` and writes the Closure Marker without deleting checked-in history.
- `objective-stack-impl`: parent orchestration for implementing one Objective as small slices or a Graphite stack. It uses Objective updates as checkpoints, but does not own the general Objective lifecycle.

When a step skill triggers, use this `objective` skill first for shared model and safety rules, then follow the self-contained step workflow.

## Conditional references

- For standing / ongoing / no-natural-finish-line Objectives, read `references/standing-objectives.md`.
- For execution-friendly Objective policy, `## Definition of Progress`, `## Runner Policy`, row-level `Policy:`, or Objective runner concepts, read `references/execution-policy.md`.

## Slug identity

The `<slug>` directory name is the durable Objective identity. Titles, command names, product names, prose, branches, and implementation packages may be renamed without changing the Objective slug. Do not move, delete, or recreate an Objective under a new slug unless the user explicitly asks for an Objective slug migration. Archive/unarchive is an explicit location move for the same slug identity, not a slug migration.

## Objective consolidation

When the user explicitly asks to combine, merge, subsume, or consolidate Objectives, treat it as an explicit lifecycle operation, not a normal `objective-update` for one selected Objective.

Safe consolidation rules:

- Choose one surviving canonical Objective. If survivor/subsumed roles are unclear, ask.
- Keep every Objective slug directory in place. Do not move, delete, recreate, or merge slug directories unless the user separately asks for a slug migration.
- Do not merge, rewrite, move, or delete historical `updates/` files. Existing Semantic Updates remain immutable provenance.
- Edit the surviving Objective's `objective.md` and `roadmap.md` to absorb the active scope, roadmap rows, risks, and open questions that should remain live.
- Close each subsumed Objective with `objective-close` semantics: add `## Closure` to its `objective.md`, write minimal `closed.md`, and put the subsumption rationale in closure prose.
- Write new Semantic Updates in the survivor and each subsumed record explaining the consolidation decision, where active tracking moved, and any follow-ups.
- Archive only if the user explicitly asks to retire the closed record from active-root status after closure.

## Files

`objective.md` contains durable purpose, boundaries, criteria, assumptions, risks, open questions, optional execution policy, and closure context. Required headings:

- `# <Title>`
- `## Thesis`
- `## Scope`
- `## Non-Goals`
- `## Completion Criteria`
- `## Assumptions and Risks`
- `## Open Questions`
- `## Closure` only when closed

Optional execution policy sections may make an Objective execution-friendly for `objective-next` after preview and confirmation. They are durable prose policy, not schema, lifecycle state, or a hidden task queue. Objectives may omit them and remain planning/recommendation-only.

`## Assumptions and Risks` captures assumptions that might be disproven and risks that need de-risking, mitigation, acceptance, or explicit follow-up. Keep it narrative and evidence-linked; do not turn it into IDs, owners, due dates, or a task database.

`roadmap.md` contains ordered guidance. Required headings:

- `# Roadmap`
- `## Work`
- `## Parked`

Use only `[ ]`, `[~]`, and `[x]` statuses.

Roadmap rows represent semantic Objective work: deliverables, decisions, de-risking, implementation slices, documentation/product changes, or meaningful follow-up. Size roadmap work by human-legible decision count and thesis clarity, not by diff size, file count, or line count. Routine validation/CI/CD checks such as `just`, tests, dprint, waiting for CI, or full repo validation are completion evidence; record them in roadmap notes, Semantic Updates, or closure context instead of standalone rows. Validation may be roadmap work only when validation/test/CI behavior, release qualification, or a non-routine validation investigation is the Objective deliverable. Execution policy notes in roadmap rows are prose, not machine state.

`updates/` contains immutable Semantic Updates: meaningful findings, decisions, blockers, assumption changes, risk de-risking or surfacing, completion evidence, plan changes, or follow-ups. No ceremonial pings or branch changelogs. Never edit, rewrite, amend, normalize, or delete an existing update file during Objective tracking. If later evidence supersedes, corrects, or contextualizes an older update, create a new update that references the historical record instead of modifying it. Required headings:

- `# <Update Title>`
- `## Summary`
- `## Objective Impact`
- `## Follow-Ups`

`closed.md` is a minimal Closure Marker. Its existence means closed; closure meaning belongs in `objective.md`.

## Selection

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `objective list --minimal --format md` to enumerate active checkout-local Objectives (`open` records in `.asdl/objectives/`) and ask the user to choose. Use `objective list --names` only for machine-readable active-slug extraction.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

`objective-update` has one narrow exception: when the user explicitly requests an Objective update, no slug/path is explicit, and exactly one active Objective exists, it may present that Objective as the only candidate. It must ask for confirmation before continuing to repo evidence or mutation. If update intent is ambiguous or multiple active Objectives exist, ask instead.

A picker UI may use deterministic git facts to group changed active Objectives first when direct changes under `.asdl/objectives/<slug>/` are present compared with repository trunk. If exactly one active Objective is the only Objective slug changed, the picker may label it as suggested. If multiple active Objectives changed, the picker may show those changed active Objectives in the first menu and offer a separate option to view the remaining active Objectives. The user must still confirm a changed Objective or choose another Objective. If the diff is unavailable, empty, or contains no changed slugs that are active Objectives, show the normal ordering with no suggestion.

Do not silently auto-select from candidate count or changed/touched files. Never infer from branch name, PR, package, roadmap keyword, or hidden attachment metadata. Objective selection must come from an explicit slug/path or checkout-local `objective list` inventory. Changed-path, branch, stack, or PR evidence belongs only to operation-specific checks after an Objective is selected.

## Repository status

Use `objective list` for the default checkout-local Objective status inventory, filtered to active open records in `.asdl/objectives/`, with local branch attribution included. Archived records under `.asdl/objective-archive/` are physically outside active discovery. `objective list --status all` means all statuses in the active root only, not archived records. Closed Objectives display as `✓ closed` only when included with `--status closed` or `--status all`. The default list command has local branch attribution, but no Graphite branch projection, current-branch mode, detail view, or third active status. Do not treat listed branch names as Objective selection. Use `objective list --minimal` when you need the compact Objective/status/latest-update view without branch attribution. Use `objective list --names` to emit filtered active-root slugs, one per line. It does not parse Objective prose or infer status from branches.

## Tracking Gate

Before `objective-next` recommends work or offers confirmed execution, check read-only whether material progress appears present in repo changes but absent from the selected Objective. If so, ask whether to run `objective-update` for the same selected Objective before recommending or executing new work. If the user confirms or preauthorized update-and-continue, perform the explicit Objective Update workflow, reread the Objective and repo evidence, and then continue `objective-next`. Changed-path evidence collection and materiality judgment both remain skill/agent responsibilities in v1.

## Non-goals

- Not a task database, workflow controller, or branch attachment system.
- No YAML/frontmatter, UUIDs, registries, hidden state, or state machine.
- V1 keeps Objective *meaning* in Markdown; CLI tooling (`objective list`, `objective exec read-objective`) owns only deterministic facts such as record inventory, file presence, and closed-marker presence. Do not parse Markdown headings, roadmap checkboxes, execution policy, or prose meaning in CLI code.
