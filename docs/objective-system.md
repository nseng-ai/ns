# Objective System

This document is the canonical operational specification for ASDL objectives.
`CONTEXT.md` defines the domain language; this file defines the markdown-only v1 mechanics.

## Purpose

An **Objective** is a checked-in **Durable Narrative Roadmap Record** for multi-session, multi-branch, or multi-PR work. It preserves human-readable context, ordered guidance, decisions, findings, blockers, and completion evidence.

An Objective is not a workflow controller, state machine, hidden agent store, or task database.

## Canonical Locations

Active Objective records live under the checked-in active root:

```text
.asdl/objectives/
```

Archived Objective records live under the checked-in archive root:

```text
.asdl/objective-archive/
```

Each objective is keyed by its directory slug. Active records use this shape:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md        # optional; existence means closed
```

Archived records preserve the same internal shape under `.asdl/objective-archive/<slug>/`.

Rules:

- `.asdl/objectives/` and `.asdl/objective-archive/` are first-class repository content and should be committed.
- The `<slug>` directory name is the stable objective identity in either root.
- The markdown title may change without changing objective identity.
- Command, product, branch, package, and prose renames do not imply Objective slug renames.
- Moving `.asdl/objectives/<old>/` to `.asdl/objectives/<new>/` or `.asdl/objective-archive/<old>/` to `.asdl/objective-archive/<new>/` is an explicit Objective slug migration and should stop normal Objective workflows until a user chooses the canonical identity.
- Moving `.asdl/objectives/<slug>/` to `.asdl/objective-archive/<slug>/` is Objective archive, not slug migration.
- Open/closed state and active/archived location are orthogonal: `closed.md` records closure state; root location controls whether normal active workflows discover the record.
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

For standing Objectives with no natural goal-met finish line, `## Completion Criteria` should describe retirement or closure criteria. Standing design rationale lives in [Standing Objectives & Objective Runners](pi/standing-objectives-and-runners.md); agent-facing guidance lives in `skills/objective/references/standing-objectives.md`.

Optional execution-friendly `## Definition of Progress` and `## Runner Policy` sections may be added for Objectives that should let `objective-next` offer confirmed execution. Ordinary Objectives may omit these sections. Policy is durable prose, not schema, lifecycle state, automation metadata, or a hidden queue.

Agent-facing progressive-disclosure details live in skill references: `skills/objective/references/execution-policy.md`, `skills/objective-create/references/execution-friendly-create.md`, and `skills/objective-next/references/confirmed-execution.md`.

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

Roadmap rows may include slice-local `Policy:` and `Evidence:` prose when the selected slice differs from Objective-level defaults or needs explicit validation expectations. Row-level `Policy:` notes may override Objective-level execution defaults for that row. They are prose guidance, not machine-readable state.

Allowed states:

- `[ ]` planned
- `[~]` active or partial
- `[x]` complete

Roadmap rows are semantic work guidance: deliverables, decisions, de-risking, implementation slices, documentation/product changes, or meaningful follow-up. Size roadmap rows and implementation slices by human-legible decision count and thesis clarity, not by diff size, file count, or line count. A broad mechanical rename or interface conversion can be one simple row when it expresses one clear decision; a tiny diff can still require multiple rows when it mixes unrelated decisions. Routine validation and CI/CD checks such as running `just`, tests, dprint, waiting for CI, or full repo validation are completion evidence, not standalone roadmap work. Record that evidence under the relevant roadmap row, in a Semantic Update, or in closure context. Validation can be roadmap work only when the Objective's scope is validation infrastructure, test coverage, CI behavior, release qualification, or a non-routine investigation where validation changes the Objective outcome.

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
- Closing an objective does not move its directory; archive/unarchive is a separate explicit operation.
- Closed active objectives are readable by `objective-current` but are not eligible for `objective-next` by default.
- Archived objectives are outside normal Objective discovery regardless of whether `closed.md` exists.
- There is no `objective-reopen` workflow in v1.

## Objective Selection

When an operation needs an existing active objective, resolve it in this order:

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If the user-provided path is under `.asdl/objective-archive/<slug>/`, stop and ask whether to unarchive before running active Objective workflows.
3. If no slug or path is explicit, list candidate objective directories under `.asdl/objectives/` and ask the user to choose. Use the operation's state filter when it has one, such as active objectives for active-objective workflows.
4. If no candidates exist, report that no objectives exist and suggest `objective-create` when appropriate.

Archived slugs remain reserved Objective identities. Do not silently create a new active Objective with the same slug as an archived record; ask whether to unarchive, inspect, or choose a different slug.

Operation-specific exception: when no slug or path is explicit, the user explicitly requested an Objective update, and the active-objective listing returns exactly one candidate, `objective-update` may present that objective as the only candidate. It must ask a short confirmation question before continuing to repo evidence or mutation. If update intent is ambiguous, ask a one-line invocation confirmation first. If multiple active objectives exist, still present the options and ask the user to choose.

Non-binding picker grouping exception: when a UI picker has already listed active objectives, it may use deterministic git facts to group changed active objectives first when direct changes under `.asdl/objectives/<slug>/` are present compared with the repository trunk. If exactly one active objective is the only objective slug changed, the picker may label it as suggested. If multiple active objectives changed, the picker may show those changed active objectives in the first menu and offer a separate option to view the remaining active objectives. The user must still confirm a changed objective or choose another objective. If the diff is unavailable, empty, or contains no changed slugs that are active objectives, the picker should show the normal ordering with no suggestion.

Do not silently auto-select from candidate count or changed/touched files. Never infer objective ownership from branch names, PR titles, package names, roadmap keywords, or other hidden attachment mechanisms. Changed-path, branch, stack, or PR evidence may be used only by operation-specific checks after an objective is selected.

## Operations

V1 keeps Objective meaning in Markdown. Small CLI surfaces (`objective list`, `objective archive`, `objective exec read-objective`, and `objective exec runner-subagent-usage`) ship deterministic mechanics that the skills delegate to. Narrative mutations remain direct Markdown edits; archive/unarchive is a shipped directory-move mutation that does not edit Objective prose.

### `objective list`

Lists Objective records in the current checkout.

Contract:

- Read active Objective records only from `.asdl/objectives/` in the current working tree; archived records under `.asdl/objective-archive/` are excluded even when `--status all` is passed.
- Report checkout-local status from the active record: direct `.asdl/objectives/<slug>/closed.md` means `closed`; an Objective record without direct `closed.md` means `open`.
- Do not treat nested files such as `.asdl/objectives/<slug>/updates/closed.md` as closure markers.
- Default to active/open Objective records. Closed records are included only with `--status closed` or `--status all`.
- Provide a `--status {all,active,open,closed}` filter. The default is `active`.
- Provide a `--names` flag that emits Objective slugs only, one per line after the status filter is applied.
- Compute `latest_update_iso` from the newest committed update touching `.asdl/objectives/<slug>/` when available; otherwise report `null`.
- Prefix the human and Markdown latest-update cell with `(x)` when the checkout has staged, unstaged, or untracked changes under `.asdl/objectives/<slug>/`. A dirty record with no committed update renders `(x) —`.
- Emit machine JSON as a Clinkr envelope whose `data` contains `trunk_branch`, `root_path`, `status_filter`, `names_only`, and `records`. Each record contains `slug`, `status`, and `latest_update_iso`; JSON remains raw and does not expose formatted latest-update text or dirty state.
- Do not parse Markdown prose, summarize Objective bodies, project records across branches, choose a canonical branch, or depend on Graphite.
- The shipped command has no branch projection, third active status, current-branch mode, or detail view.

Shipped CLI:

- Run `objective list` for the default active/open Objective inventory.
- Run `objective list --format md` for markdown output.
- Run `objective list --format json` for the machine envelope.
- Run `objective list --status all` to include open and closed active-root Objective records.
- Run `objective list --status closed` for closed active-root Objective records.
- Run `objective list --names` to print active slugs, one per line.

Related Graphite projection: `objective gt stacks` reports Objective work distributed across local Graphite-tracked stack branches. Its observable contract is specified separately in [Objective GT stacks](specs/objective-gt-stacks.md).

### `objective-create`

Creates a new objective.

Contract:

- Require an explicit slug or explicit user confirmation of an LM-proposed slug.
- Create `.asdl/objectives/<slug>/` with `objective.md`, `roadmap.md`, and `updates/`.
- Write LM-authored initial content using the standardized required headings, including a concrete `## Assumptions and Risks` section.
- Default to planning-only unless the user explicitly asks for execution-friendly/runner/autonomous behavior or the interview exposes execution policy as a real branch point.
- For planning-only Objectives, omit `## Definition of Progress` and `## Runner Policy` unless the user explicitly asks for them.
- For execution-friendly Objectives, write optional `## Definition of Progress` and `## Runner Policy` sections with at least: when direct execution is allowed; when to steer/ask first; what counts as keepable progress; validation/materialization boundaries; and external side-effect policy.
- Keep initial roadmap rows substantive; put routine validation expectations under semantic rows as expected evidence instead of standalone validation-only items.
- Use indented `Policy:` and `Evidence:` prose under roadmap rows when slice-local policy or validation expectations differ from Objective-level defaults.
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
- Focus on scope, completion criteria, assumptions, risks, sequencing, closure evidence, and durable execution policy only when requested or surfaced as relevant.

Shipped CLI:

- Active-root duplicate detection: `objective exec read-objective <slug>` returns a `not_found` envelope when the slug has no active-root record, and otherwise emits the existing active record. Archived records should still be checked before reusing a slug.

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

- Candidate objective listing: `objective list` (active root only).
- Closed-marker detection and structured inventory: `objective list` (per-record) and `objective exec read-objective <slug>` (active-root per-record raw Markdown plus closed state and missing-file notes).

### `objective-next`

Acts as the front door for advancing an active objective: recommend next work, steer planning, or offer confirmed execution when explicit Objective policy allows it.

Contract:

- Resolve the objective using the selection rules.
- Exclude closed objectives by default.
- Read `objective.md`, `roadmap.md`, and relevant updates.
- Apply the **Tracking Gate** before recommending next work or offering execution.
- Prefer next work that clarifies active assumptions or de-risks unresolved risks when that is the smallest coherent step.
- If the Tracking Gate indicates likely unrecorded progress, ask whether to run `objective-update` for the same selected objective before recommending or executing next work. If the user confirms or explicitly preauthorized update-and-continue, perform that update, reread the objective and repo evidence, then continue `objective-next`; otherwise stop without a recommendation or execution offer.
- Direct execution offers require explicit Objective prose policy, such as `## Runner Policy` plus enough `## Definition of Progress` guidance, or row-level `Policy:` prose that clearly permits direct execution for the selected slice.
- Do not infer execution permission from roadmap concreteness alone. If policy is missing or incomplete, recommend only and include a policy-upgrade note.
- When policy says to steer first, ask one concrete question or recommend a planning/grilling/readback step instead of executing.
- When policy allows direct execution, present an inline execution preview and wait for explicit affirmative confirmation before material action.
- The preview should state selected slug, policy basis, bounded scope, likely files/areas, materialization shape, validation, external side effects, stop/ask conditions, Objective tracking expectations, and PR submission status. PR submission and external side effects require explicit Runner Policy or confirmed preview scope.
- Do not use hidden ledgers, task files, private queues, Branch Memory run state, alternate Objective stores, or new Objective lifecycle states.
- In recommendation-only or steer-first paths, do not mutate files except through an explicit `objective-update` handoff. In confirmed execution, mutate only within the confirmed preview scope and write Objective tracking only for meaningful impact.

Shipped CLI:

- Active candidate filtering: `objective list` lists active-root open candidates by default; `objective list --status all` reports active-root closed records too.

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
- Leave the objective directory in its current root.
- Do not delete the objective or archive it implicitly; use `objective archive` separately when the user wants the record outside active discovery.
- Do not create a reopen mechanism in v1.

Future CLI pushdown candidates:

- Closed-marker creation.
- Refusal when already closed unless the user asks to amend closure context.
- Verification that `objective.md` contains a `## Closure` section.

### `objective archive`

Moves an Objective record between active and archived roots without editing Objective Markdown.

Contract:

- `objective archive <slug>` moves `.asdl/objectives/<slug>/` to `.asdl/objective-archive/<slug>/`.
- `objective archive <slug> --unarchive` moves `.asdl/objective-archive/<slug>/` back to `.asdl/objectives/<slug>/`.
- Preserve the slug and all files, including `closed.md` when present.
- Refuse invalid slugs, missing source directories, non-directory sources, and existing destinations.
- Do not infer closure from archive state and do not infer archive state from closure.
- Do not merge active and archived directories; a destination collision requires human resolution.

Shipped CLI:

- Run `objective archive <slug>` to remove a record from normal active discovery.
- Run `objective archive <slug> --unarchive` to make an archived record active again.

### `objective exec runner-subagent-usage`

Summarizes Pi runner-subagent JSONL session files for Objective stack digest workflows.

Contract:

- Accept explicit session file paths.
- Report per-session status, assistant response count, model references, token totals, cost totals, and aggregate totals.
- Do not interpret Objective meaning or mutate Objective records.

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

The Tracking Gate check must not mutate files, auto-refresh objective state, or perform hidden reconciliation. It runs before both recommendation and execution-offer paths. When it blocks, `objective-next` may offer a user-confirmed handoff to `objective-update`; any file changes belong to that explicit update workflow, not to the read-only gate.

Deterministic git comparison and changed-path scope facts for the Tracking Gate are left as future CLI work; collection of branch evidence and semantic materiality both remain LM/human-authored in v1.

## PR Tracking Policy

A pull request that materially advances an Objective should include the corresponding objective tracking change before it lands. The tracking change may be an edit to `objective.md`, an edit to `roadmap.md`, a Semantic Update, or a combination of these.

Enforcement is unresolved in markdown-only v1. Future enforcement could be implemented through PR checks, review policy, or CLI preflight tooling.

## Future CLI Pushdown Principle

Future CLI tooling should own deterministic mechanics and facts, not objective meaning.

Good CLI responsibilities:

- Validate slugs and paths. _(partially shipped: `objective exec read-objective` rejects empty, `.`, `..`, and slash-bearing slugs.)_
- List candidate objectives from checkout-local active-root records. _(shipped: `objective list`.)_
- Detect closed markers. _(shipped for active-root records: `objective list` and `objective exec read-objective` both report closed state.)_
- Move Objective records between active and archived roots without editing prose. _(shipped: `objective archive`.)_
- Summarize runner-subagent session usage for Objective stack digestion. _(shipped: `objective exec runner-subagent-usage`.)_
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
- Interpreting Runner Policy, Definition of Progress, row-level `Policy:` notes, and execution permission.
- Summarizing closure context.
