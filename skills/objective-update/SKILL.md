---
name: objective-update
description: "Command: objective-update"
---

# objective-update

Update Objective tracking for exactly one Objective.

Use the `objective` skill for shared vocabulary/system rules when available. This command remains self-contained.

## Invocation intent

Run when the user explicitly asks to update Objective tracking, says branch/PR changes need an Objective update, invokes `$objective-update`, or provides a `<skill name="objective-update">` block as an action cue.

Also run when `objective-next` has selected a slug/path, its Tracking Gate blocks, and the user confirms or preauthorizes updating that same Objective before continuing.

If the user only asks about the skill or pastes it with no clear update intent, ask: `Do you want me to run objective-update for the current branch now?`

## Required shape

Canonical root: `.asdl/objectives/<slug>/`.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- Update files: `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional minimal Closure Marker; existence means closed; closure meaning belongs in `objective.md` under `## Closure`.

Objective records are Markdown. Read/edit Markdown directly. Use `objective exec` for deterministic reads: candidate listing, inventory, closed-marker detection. Mutate files directly.

The selected Objective slug directory is immutable during `objective-update`. Command/product/prose renames are ordinary Objective edits inside `.asdl/objectives/<slug>/`; update titles, prose, roadmap rows, and Semantic Updates in place. Do not move, delete, recreate, or normalize Objective slug directories as part of an update. If the user explicitly wants an Objective slug migration, stop and handle that as a separate, explicit migration decision before any normal update work.

## Resolve exactly one Objective

1. Use an explicit user-provided slug/path under `.asdl/objectives/<slug>/`.
2. Otherwise run `objective list --format md` immediately.
3. If exactly one active Objective exists and update intent is explicit, ask before evidence/mutation: `Only one active Objective exists: <slug>. Run objective-update for this Objective?`
4. If multiple active Objectives exist, present the command output and ask for one slug/path. Do not ask a generic question before showing options.
5. If none exist, say so and suggest `objective-create` when appropriate.

If update intent is ambiguous, ask the invocation-intent confirmation before any only-open-Objective confirmation.

Never write a multi-Objective update. Never auto-select from candidate count, branch names, PR titles, package names, roadmap keywords, changed/touched files, or hidden attachment mechanisms.

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

Final response must say whether PR evidence was considered, unavailable, or irrelevant. In durable Objective files, avoid temporal absence statements unless materially important. Prefer durable wording:

- `Evidence: local branch diff against <base>; full gate passed.`
- `PR evidence was not required; local branch commits were sufficient.`
- `PR #<n> corroborates the same file set and completion evidence.`

## Objective read scope

Run `objective exec read-objective <slug> --format md` to confirm path, state, inventory, raw Markdown, and closed-marker presence.

For large Objectives, use that output for inventory/closed state, then focus on:

- `.asdl/objectives/<slug>/objective.md`
- `.asdl/objectives/<slug>/roadmap.md`
- the relevant existing update file when amending one
- recent updates only when needed for context

Do not spend context on old updates unless they materially affect the current change.

## Amend vs new Semantic Update

Amend an existing update when correcting stale/incorrect evidence for the same semantic event, fixing same-branch/PR verification wording or counts, or avoiding a duplicate shipped/progress update for the same roadmap row.

Write a new update for a distinct finding, blocker, decision, risk change, completion event, or follow-up slice that materially changes roadmap state.

## Closure Gate

After normal update evidence and durable Objective edits, evaluate whether the selected Objective appears ready to close.

Closure-ready means the Objective is not already closed; the outcome is clear (`completed` or intentionally `abandoned`); completion criteria or abandonment rationale are evidenced; no active non-parked roadmap work remains; important risks/open questions are resolved, accepted, or carried as follow-ups/caveats; and a concise `## Closure` can record outcome, evidence, caveats, and follow-ups.

Never close automatically. Never close merely because roadmap checkboxes are all `[x]`, or from branch names, PR titles, package names, candidate count, or other selection hints. If closure-ready, ask: `Objective <slug> appears ready to close as <completed|abandoned>. Close it now?` Include a one- or two-line rationale when helpful.

If the user confirms, perform `objective-close` semantics inline: add/update `## Closure` in `objective.md`, write minimal `closed.md`, keep the Objective directory in place, and put closure meaning in `objective.md` rather than `closed.md`. If the user already explicitly requested update-and-close in this invocation, treat confirmation as granted only when outcome and rationale are clear.

If closure is declined, ambiguous, or unclear, leave `closed.md` absent and report that closure was offered/skipped or not offered. Do not create a duplicate Semantic Update solely for closure; create or amend one only when closure introduces distinct semantic information beyond the normal update.

## Verification evidence

Prefer command plus pass/fail over exact aggregate counts in durable Objective files. Record exact counts only when materially meaningful.

- Good: `Verification: targeted reviewer suite passed; full just passed.`
- Avoid: `Verification: full just passed (1285 passed)` unless that count is required.

The final response may include exact command output when useful; durable Objective files should not churn because unrelated test counts changed.

## Workflow

1. Run `objective exec read-objective <slug> --format md` per Objective read scope.
2. If closed, stop unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.
3. Collect post-selection repo evidence.
4. Confirm Objective path integrity: normal update edits must remain under the selected `.asdl/objectives/<slug>/` directory and must not add/delete/move sibling Objective slug directories.
5. Compare user request, evidence, and existing Objective files to decide what durable tracking changed.
6. Edit `objective.md` for durable narrative, boundaries, completion criteria, assumptions, risks, open questions, or closure-adjacent context.
7. Update `## Assumptions and Risks` when evidence changes risk knowledge:
   - mark assumptions incorrect, revised, or still active;
   - mark risks de-risked, not de-risked, materialized, accepted, or still open;
   - add new assumptions/risks that affect scope, sequencing, confidence, or completion evidence;
   - preserve useful history; do not silently delete disproven assumptions or de-risked risks.
8. Edit `roadmap.md` when ordered guidance, checkbox state, status notes, completion evidence, or parked work changed.
9. Create or amend a Semantic Update for meaningful findings, decisions, blockers, assumption/risk changes, completion evidence, plan changes, or follow-ups.
10. Apply the Closure Gate. If closure-ready, ask for confirmation unless the user already explicitly granted update-and-close permission in this invocation.
11. If closure is confirmed, add/update `## Closure` in `objective.md` and write minimal `closed.md` using `objective-close` semantics. If closure is declined, ambiguous, or not ready, leave the Objective open.
12. Explain why durable files changed, why they remained correct, and whether closure was not evaluated, not ready, offered, declined/skipped, or completed.
13. For maintenance-only durable edits with no new semantic information, do not create/amend an update file; say so explicitly.

## Stop / ask

- Objective selection is ambiguous or absent after presenting `objective list --format md` options.
- Update intent remains ambiguous after the invocation-intent confirmation.
- The exactly-one open Objective confirmation is pending.
- The request would update more than one Objective.
- The selected Objective is closed and the user did not explicitly ask to amend its closed record; v1 has no reopen workflow.
- Closure appears ready but confirmation is pending.
- Closure outcome/rationale is unclear after normal update evidence; leave open unless the user clarifies.
- The update would add, delete, move, recreate, or normalize any Objective slug directory instead of editing the selected slug in place.
- The user asks for a ceremonial status ping, branch changelog, registry, YAML/frontmatter, UUID, hidden metadata, or state-machine behavior.
- Information is insufficient for accurate durable narrative, assumptions/risks, or Semantic Update content.

## Verify

- Changed Objective files all live under exactly one `.asdl/objectives/<slug>/` directory, with no added, deleted, moved, or recreated sibling Objective slug directories.
- New update file, if any, has a timestamped, human-readable filename under that Objective's `updates/` directory.
- Amended update file, if any, is the existing Semantic Update for the same event, not a duplicate.
- Required headings remain present in edited durable files, including `## Assumptions and Risks`.
- If closure was performed, confirm `objective.md` contains `## Closure` and `closed.md` exists under the selected Objective directory.
- If closure was not performed, confirm no `closed.md` was created by this invocation.
- Final response includes: selected Objective slug/path; durable files edited; whether a Semantic Update was created, amended, or intentionally not written; local uncommitted changes considered; local committed branch diff considered with base branch if known; PR evidence considered/unavailable/irrelevant; Graphite parent considered/unavailable/irrelevant; closure gate result (not evaluated, not ready, offered, declined/skipped, or completed) and whether `closed.md` was written; verification run or skipped.
