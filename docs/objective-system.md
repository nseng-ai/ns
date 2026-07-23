# Objective System

This document is the canonical operational specification for ns objectives.
`CONTEXT.md` defines the domain language; this file defines the markdown-only v1 mechanics.

## Purpose

An **Objective** is a checked-in **Durable Narrative Roadmap Record** for multi-session, multi-branch, or multi-PR work. It preserves human-readable context, ordered guidance, decisions, findings, blockers, and completion evidence.

An Objective is not a workflow controller, state machine, hidden agent store, or task database.

## Canonical Locations

Objective records live under the checked-in active root:

```text
.ns/objectives/
```

Each objective is keyed by its directory slug. Records use this shape:

```text
.ns/objectives/<slug>/
  objective.md
  roadmap.md
  orientation.md   # optional; orienting active Objectives only
  updates/
  closed.md        # optional; existence means closed
```

Rules:

- `.ns/objectives/` is first-class repository content and should be committed.
- The `<slug>` directory name is the stable objective identity while the record exists in the checkout.
- The markdown title may change without changing objective identity.
- Command, product, branch, package, and prose renames do not imply Objective slug renames.
- Moving `.ns/objectives/<old>/` to `.ns/objectives/<new>/` is an explicit Objective slug migration and should stop normal Objective workflows until a user chooses the canonical identity.
- `closed.md` records closure state. Closed records remain in `.ns/objectives/` until a human deletes them.
- If a record should disappear from active checkout state, delete `.ns/objectives/<slug>/` through ordinary source control; recover it from git history if needed.
- Do not add UUIDs, registries, tombstones, slug reservations, or hidden attachment metadata. The only sanctioned YAML is optional Record Frontmatter at the top of `objective.md`, carrying exactly `blocked` and `edges` (ADR 0025; see Record Frontmatter below).
- V1 starts fresh from `.ns/objectives/`; `docs/objectives/` is not a canonical root and has no compatibility behavior.

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

Objectives also take recognizable prose-only **patterns** — Umbrella (formerly Synthesis; ADR 0030), Child, Standing, Autoobjective, Orienting (formerly cross-cutting), and Ideation. Patterns compose, are never a machine category or frontmatter key, and are recognized by reading the record; product surfaces that need a pattern's properties verify at dispatch time and refuse when unsatisfied. The agent-facing catalog lives in `skills/objective/references/objective-patterns.md`; canonical terms live in the root `CONTEXT.md`.

Optional execution-friendly `## Definition of Progress` and `## Runner Policy` sections may be added for Objectives that should let future `objective-next` runs proactively offer confirmed execution. Ordinary Objectives may omit these sections and remain recommendation-first; a user can still explicitly continue from a concrete current-session `objective-next` recommendation. Policy is durable prose, not schema, lifecycle state, automation metadata, or a hidden queue.

Agent-facing progressive-disclosure details live in skill references: `skills/objective/references/execution-policy.md`, `skills/objective-create/references/execution-friendly-create.md`, and `skills/objective-next/references/confirmed-execution.md`.

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

Rules:

- **Objective Edges** are undirected, kind-less, mirrored connections between two Objective records. Each endpoint lists the other under `edges:` as `{objective: <slug>, annotation: <sentence>}`, with the required **Edge Annotation** written from that record's perspective — the two sentences are deliberately different texts. Edge identity is the unordered slug pair; at most one edge between two records. Direction, causality, and relationship kind live in the prose, never the schema.
- **Blocked Sentence**: `blocked:` is prose-valued; its presence means the record is blocked (for any reason — another objective, an external gate) and its value says why. There is no boolean; blocked is a sub-state of open, not a lifecycle state. It is set and cleared only by skill judgment, never by machine auto-flip. `ns objective check` emits a non-failing warning when a blocked record has a closed edge counterpart, prompting that judgment.
- **Mutation is skill-owned.** There is no public CLI mutation surface; the `objective-create`, `objective-update`, and `objective-close` step skills own writing edges and judging Blocked Sentences (`objective-refresh` also re-judges Blocked Sentences whose gate is verifiably resolved, including through its inline close). Because edges are mirrored, an edge mutation is a two-file edit touching the counterpart record's frontmatter — the one sanctioned exception to one-Objective mutation boundaries, limited strictly to the counterpart's frontmatter block. Any close path — explicit `objective-close` or an inline close — must re-judge each edge counterpart's Blocked Sentence as part of closing.
- **Verification**: after any frontmatter edit, run `ns objective check <slug>` or `ns objective check --all`.

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

### `orientation.md`

`orientation.md` is an optional agent-facing standing rule for orienting active Objectives whose direction unrelated agents must respect. Presence of a direct `.ns/objectives/<slug>/orientation.md` file is the opt-in flag; there is no separate registry. Direct `.ns/objectives/<slug>/closed.md` removes the orientation from the always-load set automatically. The file should keep durable `Direction` / `Getting to` guidance separate from temporary `What you see now` / `Avoid` guidance and leave lifecycle/graduation metadata in `roadmap.md`.

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
- `--skip-update-format-checks` is a compatibility option for explicitly reviewed immutable history; it does not relax this authoring contract for new updates. The checker still inventories and verifies readability of every update when the option is used.

### `closed.md`

`closed.md` is a **Closure Marker**. Its existence lets non-LM tooling identify closed objectives without interpreting prose.

Rules:

- Closure context belongs in `objective.md` under `## Closure`.
- `closed.md` may be minimal; its content is not the source of closure meaning.
- Closing an objective does not move or delete its directory.
- Closed objectives remain readable (for example via `ns objective exec read-objective`) but are not eligible for `objective-next` by default.
- A human may delete a closed record through source control when it should no longer appear in the checkout.
- There is no `objective-reopen` workflow in v1.

## Objective Selection

When an operation needs an existing active objective, resolve it in this order:

1. Use an explicit user-provided slug or path under `.ns/objectives/<slug>/`.
2. If no slug or path is explicit, list candidate objective directories under `.ns/objectives/` and ask the user to choose. Use the operation's state filter when it has one, such as active objectives for active-objective workflows.
3. If no candidates exist, report that no objectives exist and suggest `objective-create` when appropriate.

A previously deleted slug may be recreated when the user explicitly wants that identity again; source control history is the only historical link.

Operation-specific exception: when no slug or path is explicit, the user explicitly requested an Objective update, and the active-objective listing returns exactly one candidate, `objective-update` may present that objective as the only candidate. It must ask a short confirmation question before continuing to repo evidence or mutation. If update intent is ambiguous, ask a one-line invocation confirmation first. If multiple active objectives exist, still present the options and ask the user to choose.

Non-binding picker grouping exception: when a UI picker has already listed active objectives, it may use deterministic git facts to group changed active objectives first when direct changes under `.ns/objectives/<slug>/` are present compared with the repository trunk. If exactly one active objective is the only objective slug changed, the picker may label it as suggested. If multiple active objectives changed, the picker may show those changed active objectives in the first menu and offer a separate option to view the remaining active objectives. The user must still confirm a changed objective or choose another objective. If the diff is unavailable, empty, or contains no changed slugs that are active objectives, the picker should show the normal ordering with no suggestion.

Do not silently auto-select from candidate count or changed/touched files. Never infer objective ownership from branch names, PR titles, package names, roadmap keywords, or other hidden attachment mechanisms. Changed-path, branch, stack, or PR evidence may be used only by operation-specific checks after an objective is selected.

## Operations

V1 keeps Objective meaning in Markdown. Small CLI surfaces (`ns objective list`, `ns objective show`, `ns objective check`, and under `ns objective exec`: `list-candidates`, `read-objective`, `load-orientations`, `tracking-gate`, `runner-begin`, `runner-finish`, and `runner-subagent-usage`) ship deterministic mechanics that the skills delegate to. Narrative mutations remain direct Markdown edits, and the runner's local commit is runner-owned bookkeeping around a verified step (ADR 0024), not a prose mutation surface.

### `ns objective list`

Lists compact Objective records in the current checkout.

Contract:

- Read Objective records only from `.ns/objectives/` in the current working tree; deleted records are absent even when `--status all` is passed.
- Report checkout-local status from the active record: direct `.ns/objectives/<slug>/closed.md` means `closed`; an Objective record without direct `closed.md` means `open`.
- Do not treat nested files such as `.ns/objectives/<slug>/updates/closed.md` as closure markers.
- Default to active/open Objective records. Closed records are included only with `--status closed` or `--status all`.
- Provide a `--status {all,active,open,closed}` filter. The default is `active`.
- Provide a `--names` flag that emits Objective slugs only, one per line after the status filter is applied.
- Compute `latest_update_iso` from the newest committed update touching `.ns/objectives/<slug>/` when available; otherwise report `null`.
- Prefix the human and Markdown latest-update cell with `(x)` when the checkout has staged, unstaged, or untracked changes under `.ns/objectives/<slug>/`. A dirty record with no committed update renders `(x) —`.
- Render Record Frontmatter facts compactly: a `blocked:` sentence displays as blocked state text while lifecycle status remains `open`, and declared Objective Edges contribute an edge count. Missing, unreadable, or malformed frontmatter lists like a record with no frontmatter; `ns objective check` reports malformed frontmatter.
- Include a compact related-branch count for each record: the number of local non-trunk branches that `ns objective show <slug>` would list under Branches, subject to the same branch-walk ceiling. `list` shows counts only; `show` is the drill-down surface for branch names.
- Emit machine JSON as a Clinkr envelope whose `data` contains `trunk_branch`, `root_path`, `status_filter`, `names_only`, and `records`. Each record contains `slug`, `status`, `latest_update_iso`, `has_outstanding_changes`, optional `is_blocked` / `edge_count`, and optional `updated_branch_count` when at least one local non-trunk branch touches the record.
- Do not parse Markdown prose, summarize Objective bodies, list related branch names, choose a canonical branch, or depend on Graphite.
- The shipped command has no Graphite branch projection, third active status, current-branch mode, branch-attribution name view, or detail view. Use `ns objective show <slug>` for single-record details and related-branch attribution.

Shipped CLI:

- Run `ns objective list` for the default compact active/open Objective inventory.
- Run `ns objective list --format md` for markdown output.
- Run `ns objective list --format json` for the machine envelope.
- Run `ns objective list --status all` to include open and closed active-root Objective records.
- Run `ns objective list --status closed` for closed active-root Objective records.
- Run `ns objective list --status all --format md` for a Markdown table.
- Run `ns objective list --status closed --format json` for machine-readable closed records.
- Run `ns objective list --names` to print active slugs, one per line.

### `ns objective show`

Shows one Objective record in detail.

Contract:

- Resolve an explicit slug (or slug-like path) to one Objective record without mutating files. Missing or invalid slugs return structured non-ok result data rather than guessing a record.
- Report status and Blocked Sentence, latest update and update count, outstanding changes under the record path, root/path facts, and malformed-frontmatter messages when present.
- Attribute related local branches for this single record: local non-trunk branches whose `.ns/objectives` changes touch the shown slug are listed under Branches. If the branch walk ceiling is hit, human/Markdown output notes that branch attribution is truncated and JSON sets `updated_branches_truncated`.
- Render every Objective Edge declared by this record with this record's annotation plus the counterpart's back-edge annotation when available. Counterparts are resolved in the active root only; a deleted counterpart is `missing`, and malformed or unreadable counterpart frontmatter produces no back-edge annotation.
- Emit machine JSON as a Clinkr envelope whose ok `data` includes `slug`, `path`, `root_path`, `closed`, `blocked_sentence`, optional `frontmatter_malformed`, `latest_update_iso`, `update_count`, `has_outstanding_changes`, `updated_branches`, `updated_branches_truncated`, and `edges`.
- Support `--format md` and `--format json` like other Objective commands.
- Do not summarize Objective prose, choose a canonical implementation branch, or depend on Graphite.

Shipped CLI:

- Run `ns objective show <slug>` for the default human detail view.
- Run `ns objective show <slug> --format md` for Markdown detail output.
- Run `ns objective show <slug> --format json` for the machine envelope including branch attribution and edge details.

### `ns objective check`

Checks Objective record structure without interpreting prose meaning.

Contract:

- `ns objective check <slug>` checks one record: required files, required Markdown heading presence, and Record Frontmatter structure — edge shape, mirror lookups in counterpart records, non-empty Edge Annotations, non-empty Blocked Sentence, at most one edge per unordered slug pair, and no keys beyond `blocked` and `edges`.
- `ns objective check --all` sweeps every active-root record's Record Frontmatter and reports structural edge/blocked violations.
- Structural violations — dangling slug, missing mirror side, empty annotation, duplicate pair, malformed frontmatter, empty blocked sentence — are errors.
- One non-failing **warning** advisory: a record carrying a Blocked Sentence while at least one edge counterpart is closed is flagged, naming the closed counterpart(s). The advisory is deterministic marker state (blocked-present plus counterpart `closed.md`), not prose interpretation, and it never fails the check or the sweep; disposing of the Blocked Sentence stays skill judgment.
- Heading checks are presence-only structure; the command does not interpret prose meaning, roadmap state, or execution policy.
- `--skip-update-format-checks` omits Semantic Update title and required-heading rows for a per-slug check while retaining update inventory and readability checks. It is incompatible with `--all` and is intended only for an explicitly reviewed compatibility case; newly authored updates still require the standard title and headings.
- Supports `--format md` / `--format json` like the other Objective commands.
- Run it after any Record Frontmatter edit; the mutating step skills require this.

### `ns objective exec load-orientations`

Loads active Objective orientation files for agent onboarding.

Contract:

- Read active Objective records only from `.ns/objectives/` in the current working tree.
- Include only open records with a direct `orientation.md` file.
- Exclude records with direct `closed.md`; closure automatically removes them from the load set.
- Sort deterministically by slug.
- Do not parse Objective prose or orientation Markdown; emit headers and raw file contents.
- Markdown/default output is suitable for AGENTS.md onboarding: each record renders as `### .ns/objectives/<slug>/orientation.md` followed by the raw file content with trailing newlines normalized.
- JSON emits a Clinkr envelope whose `data` contains `rootPath`, `records`, and `recordCount`. Each record contains `slug`, `path`, and `content`.
- A missing active orientation set is `ok` with an empty `records` array.
- An unreadable detected orientation file fails the command rather than silently skipping a rule file.

Shipped CLI:

- Run `ns objective exec load-orientations` for default Markdown-compatible output.
- Run `ns objective exec load-orientations --format md` for explicit Markdown output.
- Run `ns objective exec load-orientations --format json` for the machine envelope.

### `objective-create`

Creates a new objective.

Contract:

- Require an explicit slug or explicit user confirmation of an LM-proposed slug.
- Create `.ns/objectives/<slug>/` with `objective.md`, `roadmap.md`, and `updates/`.
- Write LM-authored initial content using the standardized required headings, including a concrete `## Assumptions and Risks` section.
- Default to planning-only unless the user explicitly asks for execution-friendly/runner/autonomous behavior or the interview exposes execution policy as a real branch point.
- For planning-only Objectives, omit `## Definition of Progress` and `## Runner Policy` unless the user explicitly asks for them.
- For execution-friendly Objectives, write optional `## Definition of Progress` and `## Runner Policy` sections with at least: when direct execution is allowed; when to steer/ask first; what counts as keepable progress; validation boundaries and how work may be left; and what external systems, PR submission, publishing, deployment, or write APIs are out of scope unless explicitly previewed and confirmed.
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

- Active-root duplicate detection: `ns objective exec read-objective <slug>` returns a `not_found` envelope when the slug has no active-root record, and otherwise emits the existing active record. Check git history before reusing a slug that may have belonged to a deleted record.

Future CLI pushdown candidates:

- Slug validation as a standalone command.
- Directory and heading scaffolding.
- Safe refusal when the target path already exists.

### `objective-next`

Acts as the front door for advancing an active objective: recommend next work, steer planning, offer confirmed execution when explicit Objective policy allows it, or execute a concrete recommendation when the user gives a clear affirmative confirmation in the current conversation.

Contract:

- Resolve the objective using the selection rules.
- Exclude closed objectives by default.
- Read `objective.md`, `roadmap.md`, and relevant updates.
- Apply the **Tracking Gate** before recommending next work or offering execution.
- Prefer next work that clarifies active assumptions or de-risks unresolved risks when that is the smallest coherent step.
- Include a best-effort work-left estimate as remaining semantic steps/slices, not calendar time. If the remaining path is clear, estimate work until Objective completion; otherwise estimate work until the next discovery or decision step where additional work can be identified.
- If the Tracking Gate indicates clear material current-branch or worktree progress for the same selected objective that is absent from objective tracking, treat the `objective-next` request as update-and-continue preauthorization: run `objective-update`, reread the objective and repo evidence, then continue `objective-next`. Ask first only when evidence, objective fit, or update scope is ambiguous; if confirmation is then pending or declined, stop without a recommendation or execution offer.
- Direct execution offers for future/proactive runs require explicit Objective prose policy, such as `## Runner Policy` plus enough `## Definition of Progress` guidance, or row-level `Policy:` prose that clearly permits direct execution for the selected slice.
- A clear affirmative confirmation may execute the current session's concrete `objective-next` recommendation without adding durable Runner Policy, when the previous response selected the same Objective, named one coherent semantic step, bounded likely scope, and described completion evidence. If any of those are missing or ambiguous, restate a bounded preview and ask before executing.
- Do not infer durable execution permission from roadmap concreteness alone. Missing durable policy means future sessions should recommend by default; it does not block a user-confirmed continuation of the current concrete recommendation.
- When policy says to steer first, ask one concrete question or recommend a planning/grilling/readback step instead of executing.
- When durable policy allows direct execution, present an inline execution preview and wait for explicit affirmative confirmation before material action. When the recommendation-continuation conditions are met, the user's affirmative response may be that confirmation.
- The preview should state selected slug, execution basis, bounded scope, likely files/areas, the best-effort work-left estimate, how the work will be left, validation, external systems or write-capable actions, stop/ask conditions, Objective tracking expectations, and PR submission status. PR submission, publishing, deployment, write APIs, and other external writes require explicit Runner Policy, explicit user request, or confirmed preview scope.
- Do not use hidden ledgers, task files, private queues, Branch Memory run state, alternate Objective stores, or new Objective lifecycle states.
- In recommendation-only or steer-first paths, do not mutate files except through an explicit `objective-update` handoff. In confirmed execution, mutate only within the confirmed preview scope and write Objective tracking only for meaningful impact.

Shipped CLI:

- Active candidate filtering: `ns objective list` lists active-root open candidates by default; `ns objective list --status all` reports active-root closed records too.
- Deterministic Tracking Gate evidence: `ns objective exec tracking-gate <slug> --format json` (the LM still authors the materiality interpretation).

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
- Leave the objective directory in `.ns/objectives/<slug>/`.
- Do not delete the objective implicitly. If the user wants the record outside active checkout state, delete it separately through source control.
- Do not create a reopen mechanism in v1.

Future CLI pushdown candidates:

- Closed-marker creation.
- Refusal when already closed unless the user asks to amend closure context.
- Verification that `objective.md` contains a `## Closure` section.

### Source-control deletion

If a record should leave active checkout state, delete `.ns/objectives/<slug>/` through ordinary source control. Git history is the recovery mechanism.

### `ns objective exec tracking-gate`

Collects deterministic Tracking Gate evidence for one explicitly selected slug.

Contract:

- Resolve the trunk branch and branch-diff basis (`git.trunkBranch`, `git.revisionRange`) from checkout-local git facts.
- Report uncommitted worktree evidence (`uncommitted.repository`, `uncommitted.objective`) and committed branch-diff evidence split into `branchDiff.objectiveChangedPaths` (under `.ns/objectives/<slug>/`) and `branchDiff.materialNonObjectivePaths` (outside it), plus `summary.*` booleans/nulls for quick gate decisions.
- Read-only: collect facts only; the LM authors the materiality interpretation and any update-and-continue routing.
- Supports `--format md` / `--format json` like the other Objective commands.

### Objective Runner (`runner-begin` / `runner-finish`)

`ns objective exec runner-begin` and `ns objective exec runner-finish` are the deterministic bookends of one verified Objective Runner step: begin checks preconditions (LBYL) and emits step facts plus the subagent prompt; finish validates the subagent report fail-closed, runs the verification gate, creates the runner-owned local-only commit with provenance trailers, and prints the Runner Checkpoint. The implementation child and the step remain absolutely external-write-forbidden.

ADR 0037 permits a separate conditional action by trusted parent orchestration only after a committed checkpoint: the parent reads runner-attested facts, records and commits any material Objective tracking, and supplies a typed cumulative summary before invoking publication. Eligibility requires both durable Runner Policy permission and exact human-confirmed launch attestation, bound for one invocation to the selected Objective, current non-trunk branch, existing PR, and launch/last-published heads. The CLI must not parse Runner Policy or persist authorization. Binding drift refuses before mutation; a branch-push failure is fatal to publication, while push success followed by PR-description failure is a reported successful-partial outcome that a later full cumulative update can heal without rollback.

The parent-owned managed section contains the Objective slug, ordered Runner commits and validation outcomes, material tracking commits when present, and parent-judged escalatable decisions. It replaces one slug-bound region while preserving all other PR prose. No permission or publication artifact reaches the implementation child, and this exception does not include PR creation, stack submission/restacking, force-push, merge/land, deployment, or arbitrary external writes.

Core step design lives in ADR 0040 (Objective Runner; formerly numbered 0022) and ADR 0024 (decomposed begin/finish); the conditional parent publication contract lives in ADR 0037. The parent-facing step contract lives in `skills/objective-runner-step/SKILL.md`, and the loop around repeated steps in `skills/objective-autorun/SKILL.md`. The legacy blocking `ns objective exec runner-step` remains only during the transition and is scheduled for deletion.

### `ns objective exec runner-subagent-usage`

Summarizes Pi runner-subagent JSONL session files for Objective run digest workflows.

Contract:

- Accept explicit session file paths.
- Report per-session status, assistant response count, model references, token totals, cost totals, and aggregate totals.
- Do not interpret Objective meaning or mutate Objective records.

## Tracking Gate

The **Tracking Gate** is a read-only check phase used by `objective-next`. Its purpose is to avoid recommending new work when branch or worktree evidence suggests meaningful objective progress has not been recorded.

Behavior:

- Collect deterministic evidence with `ns objective exec tracking-gate <slug> --format json`; do not hand-roll branch-base detection or shell pipelines for this gate.
- Look for material non-objective changes (`branchDiff.materialNonObjectivePaths`, uncommitted evidence) that plausibly advance the selected objective.
- Look for corresponding changes under `.ns/objectives/<slug>/` (`branchDiff.objectiveChangedPaths`, `uncommitted.objective`).
- If material objective progress appears clearly unrecorded for the same selected objective, block next-work recommendation, perform the explicit `objective-update` workflow, reread the objective and repo evidence, and then continue `objective-next`.
- If material progress appears likely but evidence, objective fit, or update scope is ambiguous, ask whether to run `objective-update` for the same selected objective.
- If ambiguous-case confirmation is pending or declined, stop without a next-work recommendation.
- If evidence is absent or clearly unrelated, proceed with a concise note.

The Tracking Gate check itself must not mutate files, auto-refresh objective state, or perform hidden reconciliation. It runs before both recommendation and execution-offer paths. When it clearly blocks, `objective-next` routes into the explicit `objective-update` workflow for the same selected objective; when it ambiguously blocks, it may offer a user-confirmed handoff to `objective-update`. Any file changes belong to that explicit update workflow, not to the read-only gate check.

Deterministic git comparison and changed-path scope facts ship as `ns objective exec tracking-gate`; semantic materiality interpretation remains LM/human-authored.

## PR Tracking Policy

A pull request that materially advances an Objective should include the corresponding objective tracking change before it lands. The tracking change may be an edit to `objective.md`, an edit to `roadmap.md`, a Semantic Update, or a combination of these.

Enforcement is unresolved in markdown-only v1. Future enforcement could be implemented through PR checks, review policy, or CLI preflight tooling.

## Future CLI Pushdown Principle

Future CLI tooling should own deterministic mechanics and facts, not objective meaning.

Good CLI responsibilities:

- Validate slugs and paths. *(partially shipped: `ns objective exec read-objective` rejects empty, `.`, `..`, and slash-bearing slugs.)*
- List candidate objectives from checkout-local active-root records. *(shipped: `ns objective list`.)*
- Detect closed markers. *(shipped for active-root records: `ns objective list`, `ns objective exec read-objective`, and `ns objective exec load-orientations` use direct `closed.md` presence.)*
- Load active Objective orientation files for agent onboarding. *(shipped: `ns objective exec load-orientations`.)*
- Source-control deletion and recovery remains ordinary git behavior, not Objective-specific CLI state.
- Summarize runner-subagent session usage for Objective run digestion. *(shipped: `ns objective exec runner-subagent-usage`.)*
- Scaffold required files and headings. *(future.)*
- Detect missing required files, headings, and Record Frontmatter structure. *(shipped: `ns objective check`.)*
- Generate timestamped update filenames. *(future.)*
- Report changed-path facts and collect read-only Tracking Gate evidence for an explicitly selected objective. *(shipped: `ns objective exec tracking-gate`.)*
- Own the deterministic bookends of a verified runner step. *(shipped: `ns objective exec runner-begin` / `runner-finish`.)*
- Enforce one-objective-per-update guardrails. *(future.)*

Responsibilities that should remain LM/human-authored:

- Writing narrative prose.
- Ferreting out assumptions and risks from ambiguous plans.
- Deciding whether evidence is semantically meaningful.
- Explaining why durable files changed or did not change.
- Choosing roadmap wording and next-work recommendations.
- Interpreting Runner Policy, Definition of Progress, row-level `Policy:` notes, and execution permission.
- Summarizing closure context.
