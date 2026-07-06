---
name: objective
description: "Conceptual questions about ns Objectives, Objective patterns (umbrella, orienting, ideation, standing), ns objective list, explicit Objective consolidation/subsumption guidance, and shared grounding with Objective command skills. Read-only."
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

The archive root mirrors this layout under `.ns/objective-archive/<slug>/`, preserving the `closed.md` marker when present. Do not use `docs/objectives/`.

**Slug identity.** The `<slug>` directory name is the durable Objective identity. Titles, command names, product names, prose, branches, and implementation packages may be renamed without changing the Objective slug. Do not move, delete, or recreate an Objective under a new slug unless the user explicitly asks for an Objective slug migration.

**Archive is a location move.** Archive state is represented by location: `ns objective archive <slug>` moves the whole record out of active discovery; `ns objective archive <slug> --unarchive` moves it back. Open and closed Objectives can both be archived. Archive/unarchive preserve the slug and every file in the record directory — an explicit location move for the same slug identity, not a slug migration.

## Objective skill family

`objective` is the umbrella/reference skill; per-operation procedures stay in the step skills. When a step skill triggers, use this `objective` skill first for shared model and safety rules, then follow the self-contained step workflow.

Use these step skills for explicit workflow requests:

- `objective-create`: create one new active Objective record. It does not update existing records, create an initial Semantic Update, or close anything.
- `objective-next`: recommend-first router for one selected open Objective. It reads and recommends by default; when stale tracking clearly blocks, it first routes into the explicit `objective-update` workflow for the same Objective, then continues; it also mutates through the confirmed execution path when durable Runner Policy allows it, or by continuing from a concrete current-session recommendation when the user explicitly says to execute it.
- `objective-update`: update exactly one selected active Objective; when its Closure Gate is clearly ready and the outcome/rationale are clear, it may close the Objective inline without a separate confirmation.
- `objective-refresh`: verified rebaseline for active Objective records. It may append Semantic Updates, and may close an Objective inline when the verified contract shows completion criteria clearly met with probe-backed evidence; it never commits record edits — it leaves them in the worktree.
- `objective-close`: explicit close only. It records `## Closure` and writes the Closure Marker without deleting checked-in history.
- `objective-stack-impl`: parent orchestration for implementing one Objective as small slices or a Graphite stack. It uses Objective updates as checkpoints, but does not own the general Objective lifecycle.
- `objective-runner-step`: parent playbook for exactly one verified runner step via `ns objective exec runner-begin`, a harness subagent, and `ns objective exec runner-finish`, including `--recover` decisions and Runner Checkpoint interpretation. It runs one step only and never updates tracking.
- `objective-autorun`: parent orchestration loop over repeated `objective-runner-step` invocations with a judgment checkpoint between steps. It delegates each step to the runner, routes tracking through `objective-update`, and never submits or pushes.
- `objective-review-briefing`: read-only producer for post-merge delivered-scope review briefings. It reconstructs an Objective's delivering PR/commit/file basis and stores a review-agnostic briefing in the objective-owned `objective-review` Branch Memory namespace; it does not mutate Objective records or run a review lens.

## Conditional references

- For standing / ongoing / no-natural-finish-line Objectives, read `references/standing-objectives.md`.
- For execution-friendly Objective policy, `## Definition of Progress`, `## Runner Policy`, row-level `Policy:`, or Objective runner concepts, read `references/execution-policy.md`.
- For Objective patterns — umbrella (formerly synthesis), child, autoobjective, orienting (formerly cross-cutting), ideation, or "which shape should this Objective take" — read `references/objective-patterns.md`.

## Files

### objective.md

Durable purpose, boundaries, criteria, assumptions, risks, open questions, optional execution policy, and closure context. Required headings: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`, plus `## Closure` only when closed.

`## Assumptions and Risks` captures assumptions that might be disproven and risks that need de-risking, mitigation, acceptance, or explicit follow-up. Keep it narrative and evidence-linked; do not turn it into IDs, owners, due dates, or a task database.

Optional execution policy sections may make an Objective execution-friendly for future `objective-next` proactive execution offers after preview and confirmation. They are durable prose policy, not schema, lifecycle state, or a hidden task queue. Objectives may omit them and remain planning/recommendation-first; a user can still explicitly continue from a concrete current-session `objective-next` recommendation.

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
- **Mutation is skill-owned.** There is no public CLI mutation surface; the `objective-create`, `objective-update`, and `objective-close` step skills own writing edges and judging Blocked Sentences. Because edges are mirrored, an edge mutation is a two-file edit: it edits the counterpart record's frontmatter too — the one sanctioned exception to one-Objective mutation boundaries, limited strictly to the counterpart's frontmatter.
- **Verification**: after any frontmatter edit, run `ns objective check <slug>` (per-slug check validates that record's edges including mirror lookups) or `ns objective check --all` (repo-wide structural sweep). Structural violations — dangling slug, missing mirror side, empty annotation, duplicate pair, malformed frontmatter, empty blocked sentence — are errors.

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

Optional branch names, URLs, or explicit status words may be included only when useful as evidence or breadcrumbs. Use `merged` wording only when merge state has been confirmed by PR evidence; otherwise use status-aware wording such as current PR, open PR, draft PR, or PR evidence. PR evidence is not a separate ledger, `prs.md`, machine-readable registry, schema, hidden state, or workflow driver.

### orientation.md

Optional, agent-facing standing rule (≈8 content lines) stating where this part of the system is going vs. what an agent sees in the code now, and what to avoid. It is present only for orienting Objectives whose direction an unrelated agent must respect — presence of the file is the opt-in flag, not a list. Durable `Direction`/`Getting to` lines are positionally separate from the temporary `What you see now`/`Avoid` lines; lifecycle/graduation metadata stays in `roadmap.md`, never here.

Re-deriving `orientation.md` means preserving or correcting the durable `Direction`/`Getting to` lines and shrinking or removing the temporary `What you see now`/`Avoid` lines as the migration lands, with lifecycle/graduation metadata staying in `roadmap.md` as above.

AGENTS.md always-loads the `orientation.md` of every active (non-`closed.md`) Objective through `ns objective exec load-orientations --format md`; deterministic inventory and closed-marker mechanics stay in the Objective CLI, and the file drops from the load set automatically on close.

### closed.md

A minimal Closure Marker. Its existence means closed; closure meaning belongs in `objective.md`.

## Selection

1. Use an explicit user-provided slug or path under `.ns/objectives/<slug>/`.
2. If the selected path is under `.ns/objective-archive/`, stop and ask whether to unarchive before running active-Objective workflows.
3. If no slug or path is explicit, run `ns objective list --format md` to enumerate active checkout-local Objectives (`open` records in `.ns/objectives/`) and ask the user to choose.
4. If no candidates exist, say so and suggest `objective-create` when appropriate.

Objective selection must come from an explicit slug/path or checkout-local `ns objective list` inventory. Do not silently auto-select from candidate count or changed/touched files. Never infer from branch name, PR, package, roadmap keyword, or hidden attachment metadata — this includes branch names shown by `ns objective list`. Changed-path, branch, stack, or PR evidence belongs only to operation-specific checks after an Objective is selected.

`objective-update` has one narrow exception: when the user explicitly requests an Objective update, no slug/path is explicit, and exactly one active Objective exists, it may present that Objective as the only candidate. It must ask for confirmation before continuing to repo evidence or mutation. If update intent is ambiguous or multiple active Objectives exist, ask instead.

A picker UI may use deterministic git facts to group changed active Objectives first when direct changes under `.ns/objectives/<slug>/` are present compared with repository trunk. If exactly one active Objective is the only Objective slug changed, the picker may label it as suggested. If multiple active Objectives changed, the picker may show those changed active Objectives in the first menu and offer a separate option to view the remaining active Objectives. The user must still confirm a changed Objective or choose another Objective. If the diff is unavailable, empty, or contains no changed slugs that are active Objectives, show the normal ordering with no suggestion.

## Repository status

`ns objective list` is the default checkout-local Objective status inventory: active open records in `.ns/objectives/`, showing per-record status, latest update, related local-branch count, and Objective Edge count. It does not parse Objective prose or infer status from branches, and it has no Graphite branch projection, current-branch mode, or third active status. Related-branch names and edge-annotation detail are no longer on `list`; use `ns objective show <slug>` for a single record.

- `--status all` means all statuses in the active root only — archived records under `.ns/objective-archive/` are physically outside active discovery. Closed Objectives display as `✓ closed` only when included with `--status closed` or `--status all`.
- `--names`: emits filtered active-root slugs, one per line; use it only for machine-readable active-slug extraction.

`ns objective show <slug>` is the single-record detail view: status and Blocked Sentence, latest update and outstanding-changes state, the local branches whose changes touch the record, and every Objective Edge with both this record's annotation and the counterpart's back-edge annotation plus its active/archived/missing state. It is read-only and takes `--format md` / `--format json` like the other Objective commands.

## Tracking Gate

Before `objective-next` recommends work or offers confirmed execution, check read-only whether material progress appears present in repo changes but absent from the selected Objective. If current-branch or worktree evidence clearly shows material unrecorded progress for that same selected Objective, treat the `objective-next` request as update-and-continue preauthorization: perform the explicit Objective Update workflow, reread the Objective and repo evidence, and then continue `objective-next`. Ask first when evidence, Objective fit, or update scope is ambiguous. Changed-path evidence collection and materiality judgment both remain skill/agent responsibilities in v1.

## Objective consolidation

When the user explicitly asks to combine, merge, subsume, or consolidate Objectives, treat it as an explicit lifecycle operation, not a normal `objective-update` for one selected Objective.

Safe consolidation rules:

- Choose one surviving canonical Objective. If survivor/subsumed roles are unclear, ask.
- Slug identity holds: keep every Objective slug directory in place, and do not move, delete, recreate, or merge slug directories unless the user separately asks for a slug migration.
- Historical `updates/` files remain immutable provenance; do not merge, rewrite, move, or delete them.
- Edit the surviving Objective's `objective.md` and `roadmap.md` to absorb the active scope, roadmap rows, risks, and open questions that should remain live.
- Close each subsumed Objective with `objective-close` semantics: add `## Closure` to its `objective.md`, write minimal `closed.md`, and put the subsumption rationale in closure prose.
- Write new Semantic Updates in the survivor and each subsumed record explaining the consolidation decision, where active tracking moved, and any follow-ups.
- Archive only if the user explicitly asks to retire the closed record from active-root status after closure.

## Non-goals

- Not a task database, workflow controller, or branch attachment system.
- No YAML/frontmatter beyond Record Frontmatter carrying exactly `blocked` and `edges` (the sanctioned exception; see Record Frontmatter above), and no UUIDs, registries, hidden state, or state machine.
- V1 keeps Objective *meaning* in Markdown; CLI tooling (`ns objective list`, `ns objective exec read-objective`) owns only deterministic facts such as record inventory, file presence, and closed-marker presence. Do not parse Markdown headings, roadmap checkboxes, execution policy, or prose meaning in CLI code.
