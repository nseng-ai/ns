# Wayfinder → Objective Ideation Adaptation

## Purpose

The Objective system's **ideation pattern** is an ns-native adaptation of Matt Pocock's
`wayfinder` skill. This document records that lineage: what was kept, what was
deliberately dropped and why, and what ns added. It exists so that when upstream
wayfinder changes, an agent can read this document plus the upstream diff and flow each
change into the Objective system deliberately — adopt, adapt, or reject — instead of
letting the two silently diverge. The update process is LM-driven; there is no
mechanical sync.

## Upstream basis

- Vendored copy: `.agents/skills/wayfinder/SKILL.md` (real directory — third-party
  vendored code; see `docs/conventions/skill-conventions.md`).
- Source: `mattpocock/skills`, upstream path `skills/engineering/wayfinder/`;
  `skills-lock.json` records the source and hash, and the commit-level pin lives in
  `docs/agents/matt-pocock-skills.md`. Upstream is under active development — expect it
  to move. The vendored copy carries one recorded fork: the tracker-doc line points at
  `docs/agents/issue-tracker.md` instead of upstream's `/setup-matt-pocock-skills`
  bootstrap.
- The vendored skill is kept `invoke-only` per ADR 0016 and is **not** the ns planning
  surface; the adaptation below is. General vendoring policy lives in
  `docs/agents/matt-pocock-skills.md`.

## Where the adaptation lives in ns

Canonical semantics live in exactly one place, with thin hooks elsewhere:

- **Canonical pattern spec** (recognition-level): `skills/incubating/objectives/objective/references/objective-patterns.md`,
  "Ideation Objective" section.
- **Canonical vocabulary**: root `CONTEXT.md` entries — Ideation Objective, Destination,
  Question Row, Frontier, Fog, Crystallization.
- **Creation reference**: `skills/incubating/objectives/objective-create/references/wayfinding-create.md`
  owns the charting rules (Destination-first, typed Question Rows, Fog held back);
  maintainers edit it during upstream syncs.
- **Step-skill hooks** (behavioral one-liners that defer to the pattern spec):
  `objective-next` recommends from the Frontier and recognizes Crystallization;
  `objective-update` resolves Question Rows and graduates Fog.

When flowing upstream changes, edit the canonical spec, vocabulary, and creation
reference; touch step-skill hooks only if the behavioral consequence for that step
changed.

## What was kept

| wayfinder concept                                                                                                                            | ns ideation counterpart                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Destination** — named first, shapes every ticket                                                                                           | **Destination** — thesis + completion criteria, settled before any rows are charted                                                                  |
| Ticket — one question, sized to one agent session                                                                                            | **Question Row** — a roadmap row that is an open decision or investigation                                                                           |
| Ticket types: `research` / `prototype` / `grilling` / `task`                                                                                 | Question Row types — the identical four                                                                                                              |
| Blocking edges between tickets; no other ordering                                                                                            | Explicit blocked-by references between rows; unordered beyond blocking                                                                               |
| **Frontier** — open, unblocked tickets, the edge of the known                                                                                | **Frontier** — open, unblocked Question Rows                                                                                                         |
| **Fog** — suspected questions too coarse to state precisely (upstream map section now titled "Not yet specified"; ns keeps the name **Fog**) | **Fog** — a marked cluster under `## Open Questions`, never pre-sliced                                                                               |
| Fog-or-ticket test: can you *state* it precisely, not answer it                                                                              | Fog-or-row test — same wording                                                                                                                       |
| Fog vs **Out of scope** split — fog gathers only toward the destination; out-of-scope work never graduates                                   | Fog is in-scope only; out-of-scope work lives in the record's non-goals prose, and a mis-scoped Question Row is dropped with a recorded decision     |
| **Plan, don't do** — tickets resolve decisions, not deliverables; the pull to do the work signals the map is done                            | Question Rows resolve decisions; only `task` rows do rather than decide; the pull to execute signals Crystallization                                 |
| **HITL/AFK** ticket attribute — human-in-the-loop vs agent-alone                                                                             | Prose guidance on Question Row types (grilling/prototype resolve only through live exchange; research agent-alone; task either), never machine state |
| No-map escape hatch — if breadth-first charting surfaces no fog, don't build the map                                                         | `objective-create`'s wayfinding reference declines to create an ideation Objective when charting surfaces no Fog                                     |
| Breadth-first charting — fan out, don't go deep on one thread                                                                                | Breadth-first initial roadmap                                                                                                                        |
| Resolve one ticket per session                                                                                                               | Resolve one Question Row per session                                                                                                                 |
| Resolution graduates fog into new tickets, may invalidate others                                                                             | Resolution graduates Fog into new rows, may invalidate other rows                                                                                    |

## What was deliberately dropped

Each drop is a standing decision; an upstream change that deepens a dropped area is
rejected by default unless the rationale below no longer holds.

- **The issue-tracker backend** — the map issue, child issues, `wayfinder:map` /
  `wayfinder:<type>` labels, native blocking relationships, tracker frontier queries.
  Objectives are git-native Markdown records; the umbrella skill's non-goals forbid a
  task database, registry, or hidden state. Rows and blocked-by references are prose in
  `roadmap.md`.
- **The separate map artifact and "Decisions so far" index.** `objective.md` carries
  the Destination; `roadmap.md` carries the rows; immutable Semantic Updates carry
  resolved decisions and provenance. No index issue exists to maintain.
- **Claim/assignee concurrency protocol.** Objective mutation is single-writer under the
  step skills' one-Objective boundaries; there is no concurrent-session claiming to
  model.
- **Refer-by-name discipline.** Upstream needs it because tickets are scattered issues
  referenced by id; ns rows live in one file and are self-describing prose.
- **Resolution mechanics** (answer as resolution comment, close the issue, append map
  pointer). Mapped to: Semantic Update and/or a Resolved Decisions entry, mark the row
  `[x]`.
- **The `/prototype` skill dependency.** As of the v1.1 refresh `prototype` *is*
  vendored, but ideation prose still describes the intended artifact generically rather
  than binding to the skill.
- **Tracker-doc indirection (v1.1).** Upstream now tells agents the tracker "should have
  been provided" and routes missing trackers through `/setup-matt-pocock-skills`.
  Rejected: the tracker backend is a deliberate drop (Objectives are the ns planning
  surface), and the vendored copy carries the recorded one-line fork instead.
- **Out-of-scope as a map section.** The conceptual split (fog is in-scope only) was
  adopted, but the dedicated "Out of scope" map section maps to existing Objective
  non-goals prose, not a new heading contract.

## What ns added or changed

- **Crystallization** — the named phase exit (Frontier empties, only ordinary execution
  rows remain). Upstream describes the condition ("until no tickets remain") but does
  not name it. ns-only concept; nothing upstream to sync it against.
- **Pattern, not workflow.** Upstream wayfinder is a standalone invocable workflow; the
  ns adaptation is a prose-only Objective *pattern* that composes with the other
  patterns (standing, orienting, autoobjective) and adds no machine category, marker, or
  status.
- **Fog placement** — under `## Open Questions` in `objective.md`, not a map-body
  section. ns also keeps the name **Fog** for the canonical vocabulary; upstream renamed
  its map section to "Not yet specified" while keeping the fog-of-war concept.

## LM-driven update process

When the vendored wayfinder copy is refreshed (or an upstream change is otherwise
noticed):

1. Diff the old vendored `SKILL.md` against the new one; work concept-by-concept, not
   line-by-line.
2. Classify each conceptual change against this document:
   - **Adopt** — it improves a kept concept: flow it into
     `objective-patterns.md` and the `CONTEXT.md` vocabulary entries.
   - **Adapt** — it is tracker- or workflow-specific: translate it through the mapping
     table (issue → row, map → record, resolution comment → Semantic Update) before
     flowing it.
   - **Reject** — it deepens a deliberately dropped area or conflicts with Objective
     non-goals (no task database, no markers, Record Frontmatter stays `blocked` +
     `edges`). Record notable rejections here so the next sync doesn't relitigate them.
3. Update this document — the kept/dropped/added tables must describe the *current*
   upstream, or the next sync starts from a stale map.
4. Re-check the creation reference (`skills/incubating/objectives/objective-create/references/wayfinding-create.md`)
   and the step-skill hooks (`objective-next`, `objective-update`) only if a flowed
   change alters what that step does.
5. Never let a dropped concept re-enter as machine state; the promotion path for any
   machine-verified property remains the tag-plus-checkers system named in
   `objective-patterns.md`.
