---
name: objective
description: "Conceptual questions about ns Objectives, Objective patterns (umbrella, orienting, ideation, standing, steelthread), ns objective list, explicit Objective consolidation/subsumption guidance, and shared grounding with Objective command skills. Read-only."
---

# objective

Read-only grounding for Objective skills: shared vocabulary, storage model, selection rules, status semantics, safety boundaries, and family-wide policy. Do not mutate files from this skill — every mutation procedure lives in the step skills.

## Concept

An Objective is a checked-in durable narrative roadmap for multi-session, multi-branch, or multi-PR work.

Active root:

```text
.ns/objectives/<slug>/
  objective.md
  roadmap.md
  orientation.md  # optional; open Objectives only
  updates/
  closed.md  # optional marker
```

Do not use `docs/objectives/`.

**Slug identity.** The `<slug>` directory name is the durable Objective identity while the record exists in the checkout. Titles, command names, product names, prose, branches, and implementation packages may be renamed without changing the Objective slug. Do not move, delete, or recreate an Objective under a new slug unless the user explicitly asks for an Objective slug migration.

**Deletion is source-controlled.** Closing an Objective does not delete it. If a record should leave active checkout state, delete `.ns/objectives/<slug>/` through ordinary source control and recover it from git history if needed. Do not add tombstones, registries, or a separate parking location.

## Objective skill family

`objective` is the umbrella/reference skill; per-operation procedures stay in the step skills. Family policy, stated once here: when a step skill triggers, load this `objective` skill first for shared model and safety rules; each step skill is then self-contained for its own happy path. Pattern creation procedures are delta-only conditional references owned by `objective-create` (`references/<pattern>-create.md`), loaded when the interview settles on a pattern.

Use these step skills for explicit workflow requests:

- `objective-create`: create one new active Objective record; it never updates or closes existing ones. Its interview offers the Objective patterns (wayfinding, steelthread, standing, umbrella, autoobjective, readme-driven-development); each pattern's creation procedure lives in its `references/<pattern>-create.md`.
- `objective-list`: list direct open records by slug and `open`/`blocked` lifecycle only.
- `objective-next`: recommend-first router for one selected open Objective; its Tracking Gate and confirmed-execution paths live in that skill.
- `objective-update`: update exactly one selected active Objective; may close inline when its Closure Gate is clearly met.
- `objective-refresh`: verified rebaseline for active Objective records; may close inline on probe-backed evidence, and never commits record edits.
- `objective-close`: explicit close only — records `## Closure` and the Closure Marker without deleting checked-in history.
- `objective-runner-step`: parent playbook for exactly one verified runner step; it never updates tracking.
- `objective-autorun`: parent orchestration loop over repeated `objective-runner-step` invocations; also the path for implementing one Objective as a small Graphite stack.

## Conditional references

- For standing / ongoing / no-natural-finish-line Objectives, read `references/standing-objectives.md`.
- For execution-friendly Objective policy, `## Definition of Progress`, `## Runner Policy`, row-level `Policy:`, or Objective runner concepts, read `references/execution-policy.md`.
- For `## Prompt Guidance`, row-level `Prompt:` prose, or shaping the prompts produced for an Objective (the `objective-next` prompt factory), read `references/prompt-guidance.md`.
- For Objective patterns — umbrella (formerly synthesis), subobjective (synonym: child), autoobjective, orienting (formerly cross-cutting), ideation, steelthread, or "which shape should this Objective take" — read `references/objective-patterns.md`.

## Files

### objective.md

Durable purpose, boundaries, criteria, assumptions, risks, open questions, optional execution policy, and closure context. Required headings: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`, plus `## Closure` only when closed.

`## Assumptions and Risks` captures assumptions that might be disproven and risks that need de-risking, mitigation, acceptance, or explicit follow-up. Keep it narrative and evidence-linked; do not turn it into IDs, owners, due dates, or a task database.

Optional execution policy sections may make an Objective execution-friendly for future `objective-next` proactive execution offers after preview and confirmation. They are durable prose policy, not schema, lifecycle state, or a hidden task queue. Objectives may omit them and remain planning/recommendation-first; a user can still explicitly continue from a concrete current-session `objective-next` recommendation.

Separately, any Objective — regardless of pattern or execution policy — may carry an optional `## Prompt Guidance` section shaping how prompts produced for it are serialized; it grants no execution permission and never selects the next step (see `references/prompt-guidance.md`).

### Record Frontmatter

`objective.md` may begin with optional **Record Frontmatter**: a YAML block carrying exactly two keys, `blocked` and `edges`, and nothing else (ADR 0025). Most records have no frontmatter; readers behave identically either way.

```yaml
---
blocked: First external publish is gated on checkout-free distribution landing.
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Consumed as a hard dependency; must land before this ships externally.
---
```

- **Objective Edges** are undirected, kind-less, mirrored connections between two Objective records. Each endpoint lists the other under `edges:` as `{objective: <slug>, annotation: <sentence>}`. The **Edge Annotation** is required on both sides and written from that record's perspective — the two sentences are deliberately different texts. Edge identity is the unordered slug pair; at most one edge between two records. Direction, causality, and relationship kind live in the prose, never the schema.
- **Blocked Sentence**: `blocked:` is prose-valued; its presence means the record is blocked (for any reason — another objective, an external gate) and its value says why. There is no boolean, and blocked is a sub-state of open, not a lifecycle state. It is set and cleared only by skill judgment, never by machine auto-flip.
- **Mutation is skill-owned.** There is no public CLI mutation surface; the `objective-create`, `objective-update`, and `objective-close` step skills own writing edges and judging Blocked Sentences. Because edges are mirrored, an edge mutation is a two-file edit: it edits the counterpart record's frontmatter too — the ordinary sanctioned exception to one-Objective mutation boundaries, limited strictly to the counterpart's frontmatter. Objective Close has one broader exception: closing an Objective requires a semantic impact review of every edge-connected Objective and may update each affected active counterpart's durable tracking. The `objective-close` skill owns that bounded close-time propagation.
- **Frontmatter Verification**: after any frontmatter edit, verify structure. When the exact `ns objective check` operation is available under the capability-adaptation rule below, run `ns objective check <slug>` (per-slug check validates that record's edges including mirror lookups) or `ns objective check --all` (repo-wide structural sweep). Otherwise perform the **portable edge inspection**: read the frontmatter of every record the edit touched plus each declared counterpart, and confirm the block carries only `blocked` and/or `edges`, every declared edge has a counterpart entry naming this record with a non-empty perspective-correct annotation, no slug pair appears twice, every referenced slug is an existing record directory, and any `blocked:` value is a non-empty sentence. The inspection is best-effort evidence; deterministic structural checking is an enhanced guarantee claimable only when `check` ran. Structural violations — dangling slug, missing mirror side, empty annotation, duplicate pair, malformed frontmatter, empty blocked sentence — are errors under either mechanic. `check` also emits one non-failing **warning** when a record carries a Blocked Sentence while an edge counterpart is closed; the warning is deterministic marker state (blocked-present plus counterpart `closed.md`; the portable edge inspection can observe the same condition by reading counterpart Closure Markers), and disposing of it — clear, reword, or deliberately keep — is skill judgment for the close/update/refresh workflows, never a machine auto-flip.

### roadmap.md

Ordered guidance. Required headings: `# Roadmap`, `## Work`, `## Parked`. Use only `[ ]`, `[~]`, and `[x]` statuses.

Roadmap rows represent semantic Objective work: deliverables, decisions, de-risking, implementation slices, documentation/product changes, or meaningful follow-up. Size roadmap work by human-legible decision count and thesis clarity, not by diff size, file count, or line count. Execution policy notes in roadmap rows are prose, not machine state.

Routine validation/CI/CD checks such as `just`, tests, dprint, waiting for CI, or full repo validation are completion evidence; record them in roadmap notes, Semantic Updates, or closure context instead of standalone rows. Validation may be roadmap work only when validation/test/CI behavior, release qualification, or a non-routine validation investigation is the Objective deliverable.

### updates/

Immutable Semantic Updates: meaningful findings, decisions, blockers, assumption changes, risk de-risking or surfacing, completion evidence, plan changes, or follow-ups. No ceremonial pings or branch changelogs. Never edit, rewrite, amend, normalize, or delete an existing update file during Objective tracking; if later evidence supersedes, corrects, or contextualizes an older update, create a new update that references the historical record instead of modifying it. Required headings: `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.

### Objective PR evidence

Objective PR evidence is durable evidence from material Objective PRs: PRs that directly advance, de-risk, or complete the selected Objective. Record it when it helps explain progress, completion evidence, risk reduction, closure-adjacent decisions, or useful breadcrumbs; do not record every associated branch or PR as a changelog. Detailed PR evidence belongs in new Semantic Updates, and closure-relevant PR evidence belongs in `objective.md` `## Closure` prose when an Objective closes. Use this Markdown bullet convention when a list is clearer than prose:

```markdown
- PR #123: <short summary/title> — <Objective impact>
```

Optional branch names, URLs, or explicit status words may be included only when useful as evidence or breadcrumbs. Use `merged` wording only when merge state has been confirmed by PR evidence; otherwise use status-aware wording such as current PR, open PR, draft PR, or PR evidence.

### orientation.md

Optional, agent-facing standing rule (≈8 content lines) stating where this part of the system is going vs. what an agent sees in the code now, and what to avoid. It is present only for orienting Objectives whose direction an unrelated agent must respect — presence of the file is the opt-in flag, not a list. Durable `Direction`/`Getting to` lines are positionally separate from the temporary `What you see now`/`Avoid` lines — re-derivation preserves or corrects the durable lines and shrinks or removes the temporary ones as the migration lands; lifecycle/graduation metadata stays in `roadmap.md`, never here.

AGENTS.md always-loads the `orientation.md` of every active (non-`closed.md`) Objective through `ns objective exec load-orientations --format md`; deterministic inventory and closed-marker mechanics stay in the Objective CLI, and the file drops from the load set automatically on close.

### closed.md

A minimal Closure Marker. Its existence means closed; closure meaning belongs in `objective.md`.

### Close-time connected-Objective propagation

Objective Close is a graph-aware tracking transaction, not only a marker write: every Objective Edge on the closing record gets an explicit impact disposition — `updated`, `unchanged`, or `already closed` — and an `updated` active counterpart's durable tracking is edited to its post-closure state. This is the bounded exception to ordinary one-Objective update scope; every close path (explicit or inline) carries it, and the `objective-close` skill owns the procedure.

## Optional capability adaptation

The seven portable skills have complete CLI-free procedures. An optional `ns objective` operation may replace a mechanical step only after a look-before-use probe of that exact operation succeeds. Probe the operation's help surface (for example, `ns objective list --help` before using `ns objective list`); detecting `ns`, another Objective subcommand, or an Objective package is insufficient. If the exact operation is unavailable, fails its probe, or cannot be probed safely, continue with the portable procedure without pretending the enhanced guarantee exists.

Capability adaptation changes mechanics and evidence, never Objective record semantics. Narrative judgment and Markdown authoring remain skill-owned. Enhanced facts such as Git freshness, structural checking, orientation loading, and machine-readable envelopes may be claimed only when the concrete operation producing them ran successfully.

## Selection

1. Use an explicit user-provided slug or path under `.ns/objectives/<slug>/`.
2. If no slug or path is explicit, enumerate direct record directories under `.ns/objectives/`, exclude records with a direct `closed.md`, and ask the user to choose. When the exact `ns objective list` operation is available under the capability-adaptation rule, `ns objective list --format md` may perform this inventory.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

Objective selection must come from an explicit slug/path or checkout-local active-record inventory. Do not silently auto-select from candidate count or changed/touched files. Never infer from branch name, PR, package, roadmap keyword, or hidden attachment metadata — this includes branch names shown by enhanced list output. Changed-path, branch, stack, or PR evidence belongs only to operation-specific checks after an Objective is selected.

The one sanctioned selection exception is `objective-update`: with exactly one active candidate, it may present that candidate but must obtain confirmation before proceeding. Its terms live in that skill.

A picker UI may group changed active Objectives first and label a single changed record as suggested; the user must still confirm a changed Objective or choose another. The full non-binding picker grouping spec lives in `docs/objective-system.md` under Objective Selection.

## Repository status

Use `objective-list` for the portable checkout-local inventory: direct open records in `.ns/objectives/`, labeled only `open` or `blocked`. When its exact capability probe succeeds, `ns objective list` is the enhanced inventory, adding latest update, related local-branch count, and Objective Edge count. It does not parse Objective prose or infer status from branches; when the exact show operation is also available, `ns objective show <slug>` provides related-branch names and edge-annotation detail for one record.

- `--status all` means all statuses in the active root only. Closed Objectives display as `✓ closed` only when included with `--status closed` or `--status all`.
- `--names`: emits filtered active-root slugs, one per line; use it only for machine-readable active-slug extraction.

`ns objective show <slug>` is the single-record detail view: status and Blocked Sentence, latest update and outstanding-changes state, the local branches whose changes touch the record, and every Objective Edge with both this record's annotation and the counterpart's back-edge annotation plus its active/missing state. It is read-only and takes `--format md` / `--format json` like the other Objective commands.

## Tracking Gate

Before `objective-next` recommends work or offers confirmed execution, it checks whether material progress is present in repo changes but unrecorded in the selected Objective. The gate is an `ns` enhancement: mechanics live in `objective-next`'s Tracking Gate, and evidence comes from `ns objective exec tracking-gate <slug> --format json` (never hand-rolled pipelines) after that exact operation's probe succeeds; materiality judgment stays with the agent. Without that capability, portable `objective-next` is record-only — it recommends from Objective Markdown without claiming Git freshness. Clear unrecorded progress for the selected Objective is update-and-continue preauthorization (run the Objective Update workflow, reread, continue); ask first when evidence, fit, or update scope is ambiguous.

## Objective consolidation

When the user explicitly asks to combine, merge, subsume, or consolidate Objectives, treat it as an explicit lifecycle operation, not a normal `objective-update` for one selected Objective.

Safe consolidation rules:

- Choose one surviving canonical Objective. If survivor/subsumed roles are unclear, ask.
- Slug identity holds: keep every Objective slug directory in place, and do not move, delete, recreate, or merge slug directories unless the user separately asks for a slug migration.
- Historical `updates/` files remain immutable provenance; do not merge, rewrite, move, or delete them.
- Edit the surviving Objective's `objective.md` and `roadmap.md` to absorb the active scope, roadmap rows, risks, and open questions that should remain live.
- Close each subsumed Objective with `objective-close` semantics: add `## Closure` to its `objective.md`, write minimal `closed.md`, and put the subsumption rationale in closure prose.
- Write new Semantic Updates in the survivor and each subsumed record explaining the consolidation decision, where active tracking moved, and any follow-ups.
- Delete through source control only if the user explicitly asks to remove the closed record from active checkout state after closure.

## Non-goals

- Not a task database, workflow controller, or branch attachment system.
- No YAML/frontmatter beyond Record Frontmatter carrying exactly `blocked` and `edges` (the sanctioned exception; see Record Frontmatter above), and no UUIDs, registries, hidden state, or state machine.
- V1 keeps Objective *meaning* in Markdown; CLI tooling (`ns objective list`, `ns objective exec read-objective`) owns only deterministic facts such as record inventory, file presence, and closed-marker presence. Do not parse Markdown headings, roadmap checkboxes, execution policy, or prose meaning in CLI code.
