# Objective System

This document is the canonical operational specification for ASDL objectives.
`CONTEXT.md` defines the domain language; this file defines the markdown-only v1 mechanics.

## Purpose

An **Objective** is a checked-in **Durable Narrative Roadmap Record** for multi-session, multi-branch, or multi-PR work. It preserves human-readable context, ordered guidance, decisions, findings, blockers, and completion evidence.

An Objective is not a workflow controller, state machine, hidden agent store, or task database.

## Canonical Location

Objective records live under the checked-in root:

```text
.asdl/objectives/
```

Each objective is keyed by its directory slug:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md        # optional; existence means closed
```

Rules:

- `.asdl/objectives/` is first-class repository content and should be committed.
- The `<slug>` directory name is the stable objective identity.
- The markdown title may change without changing objective identity.
- Command, product, branch, package, and prose renames do not imply Objective slug renames.
- Moving `.asdl/objectives/<old>/` to `.asdl/objectives/<new>/` is an explicit Objective slug migration and should stop normal Objective workflows until a user chooses the canonical identity.
- Do not add YAML frontmatter, UUIDs, registries, or hidden attachment metadata.
- V1 starts fresh from `.asdl/objectives/`; `docs/objectives/` is not a canonical root and has no compatibility behavior.

## Documentation Surfaces

### `objective.md`

`objective.md` is the durable narrative record for the objective's purpose, boundaries, and closure state.

Required headings:

```md
# <Title>

## Thesis

## Scope

## Non-Goals

## Completion Criteria

## Assumptions and Risks

## Open Questions
```

`## Assumptions and Risks` records assumptions that might be disproven and risks that need de-risking, mitigation, acceptance, or explicit follow-up. Keep entries human-readable and evidence-linked. Do not add IDs, owners, due dates, lifecycle metadata, or automation semantics.

When an objective is closed, add:

```md
## Closure
```

Additional narrative sections are allowed when they clarify the work, but avoid turning this file into a task database or branch log.

### `roadmap.md`

`roadmap.md` is ordered work guidance.

Required headings:

```md
# Roadmap

## Work

## Parked
```

Use lightweight checkbox notation as narrative roadmap status:

```md
- [x] Completed work item.
  - Evidence: `path/to/artifact` or concise proof.
- [~] In-progress or partially landed work item.
  - Status: what is done vs. what remains.
- [ ] Planned work item.
  - Notes: sequencing, constraints, or context.
```

Allowed states:

- `[ ]` planned
- `[~]` active or partial
- `[x]` complete

Do not add task IDs, owners, priority fields, due dates, lifecycle metadata, or automation semantics.

### `updates/`

`updates/` contains **Semantic Updates**. An update file records meaningful information such as a finding, decision, blocker, assumption invalidation, risk de-risking or surfacing, completion evidence, changed plan, or follow-up.

Update filenames should be timestamped and human-readable:

```text
updates/YYYY-MM-DDTHHMMSSZ-short-slug.md
```

Required headings:

```md
# <Update Title>

## Summary

## Objective Impact

## Follow-Ups
```

Rules:

- An update should generally explain why `objective.md` or `roadmap.md` changed.
- A meaningful update may exist without durable-file edits when the durable files remain correct after meaningful evidence was considered.
- Maintenance edits to `objective.md` or `roadmap.md` do not require an update file when they add no new semantic information.
- Do not write ceremonial updates, status pings, branch changelogs, or multi-objective updates.

### `closed.md`

`closed.md` is a **Closure Marker**. Its existence lets non-LM tooling identify closed objectives without interpreting prose.

Rules:

- Closure context belongs in `objective.md` under `## Closure`.
- `closed.md` may be minimal; its content is not the source of closure meaning.
- A closed objective directory remains in place.
- Closed objectives are readable by `objective-current` but are not eligible for `objective-next` by default.
- There is no `objective-reopen` workflow in v1.

## Objective Selection

When an operation needs an existing objective, resolve it in this order:

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, list candidate objective directories under `.asdl/objectives/` and ask the user to choose. Use the operation's state filter when it has one, such as open objectives for active-objective workflows.
3. If no candidates exist, report that no objectives exist and suggest `objective-create` when appropriate.

Operation-specific exception: when no slug or path is explicit, the user explicitly requested an Objective update, and the open-objective listing returns exactly one candidate, `objective-update` may present that objective as the only candidate. It must ask a short confirmation question before continuing to repo evidence or mutation. If update intent is ambiguous, ask a one-line invocation confirmation first. If multiple open objectives exist, still present the options and ask the user to choose.

Non-binding picker grouping exception: when a UI picker has already listed open objectives, it may use deterministic git facts to group changed open objectives first when direct changes under `.asdl/objectives/<slug>/` are present compared with the repository trunk. If exactly one open objective is the only objective slug changed, the picker may label it as suggested. If multiple open objectives changed, the picker may show those changed open objectives in the first menu and offer a separate option to view the remaining open objectives. The user must still confirm a changed objective or choose another objective. If the diff is unavailable, empty, or contains no changed slugs that are open objectives, the picker should show the normal ordering with no suggestion.

Do not silently auto-select from candidate count or changed/touched files. Never infer objective ownership from branch names, PR titles, package names, roadmap keywords, or other hidden attachment mechanisms. Changed-path, branch, stack, or PR evidence may be used only by operation-specific checks after an objective is selected.

## Operations

V1 keeps Objective meaning in Markdown. Small CLI surfaces (`objective list` and `objective exec read-objective`) ship deterministic read mechanics that the skills delegate to; mutations remain direct Markdown edits.

### `objective list`

Lists Objective status for the local repository by inspecting local branch tips.

Contract:

- Inspect local branch tips without checking out branches.
- Report Objective status from git-tracked path presence at each branch tip: direct `.asdl/objectives/<slug>/closed.md` means `closed`; otherwise the Objective is `open` on that branch.
- Do not treat nested files such as `.asdl/objectives/<slug>/updates/closed.md` as closure markers.
- Default to an Objective-level list view with status, latest branch by tip timestamp (ties by branch name), latest tip age, branch count, and max ahead-of-trunk count.
- Provide a detail view that groups by Objective slug and reports branch, status, tip age, and ahead-of-trunk count.
- Provide a `--status {all,open,closed}` filter. The default is `all`; active-objective workflows should pass `--status open`.
- Provide a `--current` filter that restricts the list to Objectives associated with the current branch.
- Provide a `--names` flag that emits Objective slugs only, one per line after the status/current filters are applied.
- Do not parse Markdown, summarize Objective bodies, show latest updates, choose a canonical branch, or list branches without Objective records matching the selected status filter.
- Use pure git facts, not Graphite.

Shipped CLI:

- Run `objective list` for the default status inventory list view.
- Run `objective list --status open` for active/open Objective candidates.
- Run `objective list --status closed` for closed Objective records.
- Run `objective list --view detail` for per-branch details.
- Run `objective list --current` to filter to Objectives associated with the current branch.
- Run `objective list --status open --names` to print open slugs, one per line.

### `objective-create`

Creates a new objective.

Contract:

- Require an explicit slug or explicit user confirmation of an LM-proposed slug.
- Create `.asdl/objectives/<slug>/` with `objective.md`, `roadmap.md`, and `updates/`.
- Write LM-authored initial content using the standardized headings, including a concrete `## Assumptions and Risks` section.
- Do not create an initial update file; the initial durable files are the birth record.
- Do not create `closed.md`.

User interview:

- Before writing, conduct a user interview inspired by [Matt Pocock's `grill-me` skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md).
- Interview the user relentlessly about every aspect until shared understanding is reached.
- Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.
- Explore repository evidence for answerable questions before asking the user.
- Ask one unresolved question at a time.
- Include a recommended answer with each question.
- After each question, ask whether to continue or stop and create the Objective with the context gathered so far.
- Focus on scope, completion criteria, assumptions, risks, sequencing, and closure evidence.

Shipped CLI:

- Duplicate detection: `objective exec read-objective <slug>` returns a `not_found` envelope when the slug has no record, and otherwise emits the existing record.

Future CLI pushdown candidates:

- Slug validation as a standalone command.
- Directory and heading scaffolding.
- Safe refusal when the target path already exists.

### `objective-current`

Reads and summarizes the current state of an objective.

Contract:

- Resolve the objective using the selection rules.
- Read `objective.md`, `roadmap.md`, recent `updates/`, and `closed.md` presence.
- Report assumptions and risks alongside completion criteria, open questions, roadmap state, and recent updates.
- Report whether the objective is closed.
- Do not mutate files.

Shipped CLI:

- Candidate objective listing: `objective list`.
- Closed-marker detection and structured inventory: `objective list` (per-record) and `objective exec read-objective <slug>` (per-record raw Markdown plus closed state and missing-file notes).

### `objective-next`

Chooses the next useful work for an active objective.

Contract:

- Resolve the objective using the selection rules.
- Exclude closed objectives by default.
- Read `objective.md`, `roadmap.md`, and relevant updates.
- Apply the **Tracking Gate** before recommending next work.
- Prefer next work that clarifies active assumptions or de-risks unresolved risks when that is the smallest coherent step.
- If the Tracking Gate indicates likely unrecorded progress, ask whether to run `objective-update` for the same selected objective before recommending next work. If the user confirms or explicitly preauthorized update-and-continue, perform that update, reread the objective and repo evidence, then continue `objective-next`; otherwise stop without a recommendation.
- Do not mutate files except through that explicit `objective-update` handoff.

Shipped CLI:

- Active candidate filtering: `objective list --status open` lists open candidates; `objective list` reports each record's closed state.

Future CLI pushdown candidates:

- Read-only branch evidence collection and changed-path classification for an explicitly selected objective.
- A structured Tracking Gate report (the LM still authors the materiality interpretation).

### `objective-update`

Explicitly updates objective tracking.

Contract:

- Update exactly one objective per invocation.
- Do not span multiple objectives in one update.
- For explicit update requests with exactly one open objective and no explicit slug/path, the operation may present that objective as the only candidate but must get confirmation before continuing.
- After selection, local working-tree changes, committed branch diffs, Graphite stack parent context, and optional PR metadata may be used as evidence for the selected objective. PR evidence is not required when local committed branch evidence is sufficient.
- Edit `objective.md` and/or `roadmap.md` when durable narrative or ordered guidance has changed.
- Edit `## Assumptions and Risks` when an assumption is found incorrect or revised, a risk is de-risked or not de-risked, a risk materializes or is accepted, or new assumptions/risks emerge.
- Write a Semantic Update when there is meaningful semantic information to record.
- A Semantic Update may be written even when durable files do not change, if it records a meaningful finding, decision, blocker, assumption or risk change, completion evidence, changed plan, or follow-up.
- Maintenance-only edits to durable files do not require a Semantic Update.
- Do not update a closed objective unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.

Future CLI pushdown candidates:

- Timestamped update filename generation.
- Path validation and one-objective enforcement.
- Closed-marker guardrails.
- Detection of whether the selected objective's durable files changed.

### `objective-close`

Records an objective as complete or intentionally abandoned while preserving its checked-in history.

Contract:

- Resolve the objective using the selection rules.
- Update `objective.md` with `## Closure` context, including remaining assumptions, risks, caveats, and follow-ups when relevant.
- Write `closed.md` as an existence-only Closure Marker.
- Leave the objective directory in place.
- Do not delete or archive the objective.
- Do not create a reopen mechanism in v1.

Future CLI pushdown candidates:

- Closed-marker creation.
- Refusal when already closed unless the user asks to amend closure context.
- Verification that `objective.md` contains a `## Closure` section.

## Tracking Gate

The **Tracking Gate** is a read-only check phase used by `objective-next`. Its purpose is to avoid recommending new work when branch or worktree evidence suggests meaningful objective progress has not been recorded.

Markdown-only v1 behavior:

- Inspect current uncommitted changes and branch diff when available.
- Look for material non-objective changes that plausibly advance the selected objective.
- Look for corresponding changes under `.asdl/objectives/<slug>/`.
- If material objective progress appears unrecorded, block next-work recommendation and ask whether to run `objective-update` for the same selected objective.
- If the user confirms or preauthorized update-and-continue, perform the explicit update workflow, reread the objective and repo evidence, and then continue `objective-next`.
- If confirmation is pending or declined, stop without a next-work recommendation.
- If evidence is absent, ambiguous, or clearly unrelated, proceed with a concise note.

The Tracking Gate check must not mutate files, auto-refresh objective state, or perform hidden reconciliation. When it blocks, `objective-next` may offer a user-confirmed handoff to `objective-update`; any file changes belong to that explicit update workflow, not to the read-only gate.

Deterministic git comparison and changed-path scope facts for the Tracking Gate are left as future CLI work; collection of branch evidence and semantic materiality both remain LM/human-authored in v1.

## PR Tracking Policy

A pull request that materially advances an Objective should include the corresponding objective tracking change before it lands. The tracking change may be an edit to `objective.md`, an edit to `roadmap.md`, a Semantic Update, or a combination of these.

Enforcement is unresolved in markdown-only v1. Future enforcement could be implemented through PR checks, review policy, or CLI preflight tooling.

## Future CLI Pushdown Principle

Future CLI tooling should own deterministic mechanics and facts, not objective meaning.

Good CLI responsibilities:

- Validate slugs and paths. _(partially shipped: `objective exec read-objective` rejects empty, `.`, `..`, and slash-bearing slugs.)_
- List candidate objectives across local branch tips. _(shipped: `objective list`.)_
- Detect closed markers. _(shipped: `objective list` and `objective exec read-objective` both report closed state.)_
- Scaffold required files and headings. _(future.)_
- Detect missing `## Assumptions and Risks` sections. _(future.)_
- Generate timestamped update filenames. _(future.)_
- Report changed-path facts for an explicitly selected objective. _(future.)_
- Collect read-only Tracking Gate evidence. _(future.)_
- Enforce one-objective-per-update guardrails. _(future.)_

Responsibilities that should remain LM/human-authored:

- Writing narrative prose.
- Ferreting out assumptions and risks from ambiguous plans.
- Deciding whether evidence is semantically meaningful.
- Explaining why durable files changed or did not change.
- Choosing roadmap wording and next-work recommendations.
- Summarizing closure context.
