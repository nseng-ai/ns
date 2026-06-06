---
name: objective-update
description: "Command: objective-update"
---

# objective-update

Update Objective tracking for exactly one Objective.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this step remains self-contained for its own happy path.

## Invocation intent

Run when the user explicitly asks to update Objective tracking, says branch/PR changes need an Objective update, invokes `$objective-update`, or provides a `<skill name="objective-update">` block as an action cue.

Also run when `objective-next` has selected a slug/path, its Tracking Gate blocks, and the user confirms or preauthorizes updating that same Objective before continuing.

If the user only asks about the skill or pastes it with no clear update intent, ask: `Do you want me to run objective-update for the current branch now?`

## Required shape

Active root: `.asdl/objectives/<slug>/`. Archived records under `.asdl/objective-archive/<slug>/` are not active update candidates.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- Update files: `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional minimal Closure Marker; existence means closed; closure meaning belongs in `objective.md` under `## Closure`.

Objective records are Markdown. Read/edit Markdown directly. Use `objective exec` for deterministic reads: candidate listing, inventory, closed-marker detection. Mutate only `objective.md`, `roadmap.md`, `closed.md` when closing, and newly-created files under `updates/`.

The selected slug directory is durable identity and immutable during an update: edit titles, prose, and roadmap rows in place; never move, delete, recreate, or normalize slug directories. Existing Semantic Updates are immutable historical records: never edit, rewrite, amend, normalize, delete, or recreate an existing file under `updates/`. Treat an explicit slug migration as a separate decision handled before any update work.

## Resolve exactly one Objective

1. Use an explicit user-provided slug/path under `.asdl/objectives/<slug>/`.
2. If the selected path is under `.asdl/objective-archive/`, stop and ask whether to unarchive before updating Objective tracking.
3. Otherwise run `objective list --format md` immediately.
4. If exactly one active Objective exists and update intent is explicit, ask before evidence/mutation: `Only one active Objective exists: <slug>. Run objective-update for this Objective?`
5. If multiple active Objectives exist, present the command output and ask for one slug/path. Do not ask a generic question before showing options.
6. If none exist, say so and suggest `objective-create` when appropriate.

If update intent is ambiguous, ask the invocation-intent confirmation before any only-open-Objective confirmation.

Never write a multi-Objective update. Never auto-select from candidate count, branch names, PR titles, package names, roadmap keywords, changed/touched files, or hidden attachment mechanisms.

If the user explicitly asks to combine, merge, subsume, or consolidate Objectives, stop treating the request as ordinary `objective-update` and follow the `objective` skill's Objective consolidation guidance. Consolidation may intentionally edit a survivor record and close subsumed records, but it must still preserve slug directories and immutable historical updates.

After selection, branch/Graphite/local-diff/PR facts may be evidence for that Objective only; they never participate in selection.

## Landed-state semantics

Bring the selected Objective up to date as if the current git changes or current-branch PR changes have landed on the default branch. Treat branch/PR diff as prospective trunk state, not as an ephemeral branch status report.

Ask: `If this branch/PR were merged now, what should the selected Objective say on the default branch?` Write that state.

- The implementation and Objective edit may land atomically in one PR.
- Do not require the implementation PR to be merged.
- Do not keep a roadmap row `[~]` merely because the implementing PR is open; if evidence completes it, write the post-landing state.
- Do not write branch changelogs. Mention branch names, PR numbers, review status, or merge status only as durable evidence, useful breadcrumbs, or confidence qualifiers.
- Open/draft/unmerged PR state alone is not uncertainty. If evidence is incomplete, failing, disputed, or otherwise uncertain, ask or record a risk/follow-up instead of inventing completion.

## Post-selection repo evidence

After loading the selected Objective and confirming it is not closed, collect fail-soft evidence in this order:

1. Working tree:

   ```bash
   git status --short
   git diff --stat
   ```

2. Current branch and recent commits:

   ```bash
   git branch --show-current
   git log --oneline --decorate -5
   ```

3. Base discovery:
   - Prefer Graphite when available: run `gt branch info` and extract `Parent: <branch>`.
   - Else use `baseRefName` from `gh pr view` when current-branch PR evidence is available.
   - Else use a plain-git default/trunk best effort from available refs.

4. Local branch evidence when base is known:

   ```bash
   git log --oneline <base>..HEAD
   git diff --stat <base>...HEAD
   git diff --name-status <base>...HEAD
   ```

5. Optional PR evidence:

   ```bash
   gh pr view --json number,title,state,url,headRefName,baseRefName,files,commits
   ```

Do not require PR evidence when local committed branch evidence is sufficient. For stacked Graphite branches, prefer the Graphite parent as base so lower-stack changes are excluded. If base discovery fails, inspect recent commits and uncommitted status; ask only if evidence remains insufficient.

Use working-tree and branch `name-status` evidence as an Objective path integrity check. If the update would add, delete, move, or recreate a sibling `.asdl/objectives/<other-slug>/` directory, or if existing local changes already do so without an explicit slug-migration request, stop before editing and ask the user to resolve the slug identity/path move first.

Update only when selected Objective content clearly matches the user request and evidence. If evidence is ambiguous, unrelated, or maps to multiple roadmap rows, ask instead of writing.

In durable Objective files, avoid temporal absence statements unless materially important. Prefer durable wording:

- `Evidence: local branch diff against <base>; full gate passed.`
- `PR evidence was not required; local branch commits were sufficient.`
- `PR #<n> corroborates the same file set and completion evidence.`

## Objective read scope

Run `objective exec read-objective <slug> --format md` to confirm path, state, inventory, raw Markdown, and closed-marker presence.

For large Objectives, use that output for inventory/closed state, then focus on:

- `.asdl/objectives/<slug>/objective.md`
- `.asdl/objectives/<slug>/roadmap.md`
- recent updates only when needed for context

Do not spend context on old updates unless they materially affect the current change. When reading old updates, treat them as immutable historical evidence, not editable targets.

## Immutable Semantic Updates

Existing files under `.asdl/objectives/<slug>/updates/` are immutable. Do not amend an existing update for stale evidence, corrected counts, renamed concepts, same-branch/PR verification wording, duplicate shipped/progress wording, typo cleanup, formatting cleanup, or any other reason.

Write a new update for a distinct finding, blocker, decision, risk change, completion event, or follow-up slice that materially changes roadmap state. If later evidence corrects, supersedes, or contextualizes an older update, write a new update that states the newer durable meaning and, when useful, explicitly notes that older updates are historical records.

## Closure Gate

After normal update evidence and durable Objective edits, evaluate whether the selected Objective appears ready to close.

Closure-ready means the Objective is not already closed; the outcome is clear (`completed` or intentionally `abandoned`); completion criteria or abandonment rationale are evidenced; no active non-parked roadmap work remains; important risks/open questions are resolved, accepted, or carried as follow-ups/caveats; and a concise `## Closure` can record outcome, evidence, caveats, and follow-ups.

Do not close merely because roadmap checkboxes are all `[x]`, or from any selection hint. If closure-ready after an explicit objective-update run, close it automatically: perform `objective-close` semantics inline by adding/updating `## Closure` in `objective.md`, writing minimal `closed.md`, keeping the Objective directory in place, and putting closure meaning in `objective.md` rather than `closed.md`. The closure outcome and rationale must be clear from the selected Objective and evidence; if they are clear, do not ask for separate closure confirmation.

If closure readiness, outcome, or rationale is ambiguous or unclear, leave `closed.md` absent and report that closure was skipped because the Closure Gate was not clear. Do not create a duplicate Semantic Update solely for closure; create a new one only when closure introduces distinct semantic information beyond the normal update. Never amend an existing update for closure.

## Verification evidence

Prefer command plus pass/fail over exact aggregate counts in durable Objective files. Record exact counts only when materially meaningful.

- Good: `Verification: targeted reviewer suite passed; full just passed.`
- Avoid: `Verification: full just passed (1285 passed)` unless that count is required.

The final response may include exact command output when useful; durable Objective files should not churn because unrelated test counts changed.

- Do not add or preserve routine validation-only roadmap rows merely to keep Objective tracking open.
- When an existing row is merely routine validation and no longer carries semantic Objective work, fold its result into evidence on the relevant semantic row, Semantic Update, or closure context instead of maintaining it as work.
- Validation may remain roadmap work when the Objective is about validation/test/CI infrastructure, release qualification, or a non-routine validation investigation.

## Workflow

1. Run `objective exec read-objective <slug> --format md` per Objective read scope.
2. If closed, stop unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.
3. Collect post-selection repo evidence, including the path-integrity check.
4. Compare user request, evidence, and existing Objective files to decide what durable tracking changed.
5. Edit `objective.md` for durable narrative, boundaries, completion criteria, assumptions, risks, open questions, or closure-adjacent context.
6. Update `## Assumptions and Risks` when evidence changes risk knowledge:
   - mark assumptions incorrect, revised, or still active;
   - mark risks de-risked, not de-risked, materialized, accepted, or still open;
   - add new assumptions/risks that affect scope, sequencing, confidence, or completion evidence;
   - preserve useful history; do not silently delete disproven assumptions or de-risked risks.
7. Edit `roadmap.md` when ordered guidance, checkbox state, status notes, completion evidence, or parked work changed.
8. Create a new Semantic Update per Immutable Semantic Updates. For maintenance-only durable edits with no new semantic information, write none and say so explicitly. Never amend an existing update file.
9. Apply the Closure Gate. If closure-ready with a clear outcome and rationale, perform closure inline automatically; otherwise leave the Objective open and report why closure was skipped.
10. Report per Verify: why durable files changed or stayed correct, and the closure-gate result.

## Stop / ask

- Objective selection is ambiguous or absent after presenting `objective list --format md` options.
- The selected path is under `.asdl/objective-archive/`; ask whether to unarchive before updating Objective tracking.
- Update intent remains ambiguous after the invocation-intent confirmation.
- The exactly-one open Objective confirmation is pending.
- The request would update more than one Objective.
- The selected Objective is closed and the user did not explicitly ask to amend its closed record; v1 has no reopen workflow.
- Closure outcome/rationale is unclear; leave open unless the user clarifies.
- The update would add, delete, move, recreate, or normalize any Objective slug directory instead of editing the selected slug in place.
- The request would edit, rewrite, amend, normalize, delete, or recreate an existing Semantic Update file under `updates/`; instead explain that updates are immutable and offer to write a new corrective update when appropriate.
- The user asks for a ceremonial status ping, branch changelog, registry, YAML/frontmatter, UUID, hidden metadata, or state-machine behavior.
- Information is insufficient for accurate durable narrative, assumptions/risks, or Semantic Update content.

## Verify

- Changed Objective files all live under exactly one `.asdl/objectives/<slug>/` directory, with no added, deleted, moved, or recreated sibling Objective slug directories.
- New update file, if any, has a timestamped, human-readable filename under that Objective's `updates/` directory.
- No existing file under the selected Objective's `updates/` directory was edited, deleted, moved, normalized, or recreated.
- Required headings remain present in edited durable files, including `## Assumptions and Risks`.
- If closure was performed, confirm `objective.md` contains `## Closure` and `closed.md` exists under the selected Objective directory; if not, confirm no `closed.md` was created by this invocation.
- Final response includes: selected Objective slug/path; durable files edited; whether a new Semantic Update was created or intentionally not written; confirmation that existing Semantic Updates were not modified; local uncommitted changes considered; local committed branch diff considered with base branch if known; PR evidence considered/unavailable/irrelevant; Graphite parent considered/unavailable/irrelevant; closure gate result (not evaluated, not ready, auto-closed, or skipped-unclear) and whether `closed.md` was written; verification run or skipped.
