# Initiative System

This document is the canonical operational specification for ASDL initiatives.
`CONTEXT.md` defines the domain language; this file defines the markdown-only v1 mechanics.

## Purpose

An **Initiative** is a checked-in **Durable Narrative Roadmap Record** for multi-session, multi-branch, or multi-PR work. It preserves human-readable context, ordered guidance, decisions, findings, blockers, and completion evidence.

An Initiative is not a workflow controller, state machine, hidden agent store, or task database.

## Canonical Location

Initiative records live under the checked-in root:

```text
.asdl/initiatives/
```

Each initiative is keyed by its directory slug:

```text
.asdl/initiatives/<slug>/
  initiative.md
  roadmap.md
  updates/
  closed.md        # optional; existence means closed
```

Rules:

- `.asdl/initiatives/` is first-class repository content and should be committed.
- The `<slug>` directory name is the stable initiative identity.
- The markdown title may change without changing initiative identity.
- Do not add YAML frontmatter, UUIDs, registries, or hidden attachment metadata.
- V1 starts fresh from `.asdl/initiatives/`; `docs/initiatives/` is not a canonical root and has no compatibility behavior.

## Documentation Surfaces

### `initiative.md`

`initiative.md` is the durable narrative record for the initiative's purpose, boundaries, and closure state.

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

When an initiative is closed, add:

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

## Initiative Impact

## Follow-Ups
```

Rules:

- An update should generally explain why `initiative.md` or `roadmap.md` changed.
- A meaningful update may exist without durable-file edits when the durable files remain correct after meaningful evidence was considered.
- Maintenance edits to `initiative.md` or `roadmap.md` do not require an update file when they add no new semantic information.
- Do not write ceremonial updates, status pings, branch changelogs, or multi-initiative updates.

### `closed.md`

`closed.md` is a **Closure Marker**. Its existence lets non-LM tooling identify closed initiatives without interpreting prose.

Rules:

- Closure context belongs in `initiative.md` under `## Closure`.
- `closed.md` may be minimal; its content is not the source of closure meaning.
- A closed initiative directory remains in place.
- Closed initiatives are readable by `initiative-current` but are not eligible for `initiative-next` by default.
- There is no `initiative-reopen` workflow in v1.

## Initiative Selection

When an operation needs an existing initiative, resolve it in this order:

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. If no slug or path is explicit, list candidate initiative directories under `.asdl/initiatives/` and ask the user to choose.
3. If no candidates exist, report that no initiatives exist and suggest `initiative-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer initiative ownership from branch names, PR titles, package names, roadmap keywords, or other hidden attachment mechanisms. Changed-path evidence may be used only by operation-specific checks after an initiative is selected.

## Operations

V1 keeps Initiative meaning in Markdown. A small `initiative exec` CLI surface (`list`, `read-initiative`) ships deterministic read mechanics that the skills delegate to; mutations remain direct Markdown edits.

### `initiative-create`

Creates a new initiative.

Contract:

- Require an explicit slug or explicit user confirmation of an LM-proposed slug.
- Create `.asdl/initiatives/<slug>/` with `initiative.md`, `roadmap.md`, and `updates/`.
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
- After each question, ask whether to continue or stop and create the Initiative with the context gathered so far.
- Focus on scope, completion criteria, assumptions, risks, sequencing, and closure evidence.

Shipped CLI:

- Duplicate detection: `initiative exec read-initiative <slug>` returns a `not_found` envelope when the slug has no record, and otherwise emits the existing record.

Future CLI pushdown candidates:

- Slug validation as a standalone command.
- Directory and heading scaffolding.
- Safe refusal when the target path already exists.

### `initiative-current`

Reads and summarizes the current state of an initiative.

Contract:

- Resolve the initiative using the selection rules.
- Read `initiative.md`, `roadmap.md`, recent `updates/`, and `closed.md` presence.
- Report assumptions and risks alongside completion criteria, open questions, roadmap state, and recent updates.
- Report whether the initiative is closed.
- Do not mutate files.

Shipped CLI:

- Candidate initiative listing: `initiative exec list`.
- Closed-marker detection and structured inventory: `initiative exec list` (per-record) and `initiative exec read-initiative <slug>` (per-record raw Markdown plus closed state and missing-file notes).

### `initiative-next`

Chooses the next useful work for an active initiative.

Contract:

- Resolve the initiative using the selection rules.
- Exclude closed initiatives by default.
- Read `initiative.md`, `roadmap.md`, and relevant updates.
- Apply the **Tracking Gate** before recommending next work.
- Prefer next work that clarifies active assumptions or de-risks unresolved risks when that is the smallest coherent step.
- If the Tracking Gate indicates likely unrecorded progress, stop and ask for an `initiative-update` instead of recommending next work.
- Do not mutate files.

Shipped CLI:

- Closed-initiative filtering: `initiative exec list` reports each record's closed state.

Future CLI pushdown candidates:

- Read-only branch/worktree evidence collection for an explicitly selected initiative.
- Changed-path classification for the selected initiative's Tracking Gate.
- A structured Tracking Gate report.

### `initiative-update`

Explicitly updates initiative tracking.

Contract:

- Update exactly one initiative per invocation.
- Do not span multiple initiatives in one update.
- Edit `initiative.md` and/or `roadmap.md` when durable narrative or ordered guidance has changed.
- Edit `## Assumptions and Risks` when an assumption is found incorrect or revised, a risk is de-risked or not de-risked, a risk materializes or is accepted, or new assumptions/risks emerge.
- Write a Semantic Update when there is meaningful semantic information to record.
- A Semantic Update may be written even when durable files do not change, if it records a meaningful finding, decision, blocker, assumption or risk change, completion evidence, changed plan, or follow-up.
- Maintenance-only edits to durable files do not require a Semantic Update.
- Do not update a closed initiative unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.

Future CLI pushdown candidates:

- Timestamped update filename generation.
- Path validation and one-initiative enforcement.
- Closed-marker guardrails.
- Detection of whether the selected initiative's durable files changed.

### `initiative-close`

Records an initiative as complete or intentionally abandoned while preserving its checked-in history.

Contract:

- Resolve the initiative using the selection rules.
- Update `initiative.md` with `## Closure` context, including remaining assumptions, risks, caveats, and follow-ups when relevant.
- Write `closed.md` as an existence-only Closure Marker.
- Leave the initiative directory in place.
- Do not delete or archive the initiative.
- Do not create a reopen mechanism in v1.

Future CLI pushdown candidates:

- Closed-marker creation.
- Refusal when already closed unless the user asks to amend closure context.
- Verification that `initiative.md` contains a `## Closure` section.

## Tracking Gate

The **Tracking Gate** is a read-only check used by `initiative-next`. Its purpose is to avoid recommending new work when branch or worktree evidence suggests meaningful initiative progress has not been recorded.

Markdown-only v1 behavior:

- Inspect current uncommitted changes and branch diff when available.
- Look for material non-initiative changes that plausibly advance the selected initiative.
- Look for corresponding changes under `.asdl/initiatives/<slug>/`.
- If material initiative progress appears unrecorded, block next-work recommendation and ask the user to run `initiative-update`.
- If evidence is absent, ambiguous, or clearly unrelated, proceed with a concise note.

The Tracking Gate must not mutate files, auto-refresh initiative state, or perform hidden reconciliation.

The exact deterministic git comparison and scope algorithm are intentionally left as future CLI work. Semantic materiality — whether a given diff plausibly advances the selected Initiative — remains LM/human-authored in v1.

## PR Tracking Policy

A pull request that materially advances an Initiative should include the corresponding initiative tracking change before it lands. The tracking change may be an edit to `initiative.md`, an edit to `roadmap.md`, a Semantic Update, or a combination of these.

Enforcement is unresolved in markdown-only v1. Future enforcement could be implemented through PR checks, review policy, or CLI preflight tooling.

## Future CLI Pushdown Principle

Future CLI tooling should own deterministic mechanics and facts, not initiative meaning.

Good CLI responsibilities:

- Validate slugs and paths. _(partially shipped: `initiative exec read-initiative` rejects empty, `.`, `..`, and slash-bearing slugs.)_
- List candidate initiatives. _(shipped: `initiative exec list`.)_
- Detect closed markers. _(shipped: `initiative exec list` and `initiative exec read-initiative` both report closed state.)_
- Scaffold required files and headings. _(future.)_
- Detect missing `## Assumptions and Risks` sections. _(future.)_
- Generate timestamped update filenames. _(future.)_
- Report changed-path facts for an explicitly selected initiative. _(future.)_
- Collect read-only Tracking Gate evidence. _(future.)_
- Enforce one-initiative-per-update guardrails. _(future.)_

Responsibilities that should remain LM/human-authored:

- Writing narrative prose.
- Ferreting out assumptions and risks from ambiguous plans.
- Deciding whether evidence is semantically meaningful.
- Explaining why durable files changed or did not change.
- Choosing roadmap wording and next-work recommendations.
- Summarizing closure context.
