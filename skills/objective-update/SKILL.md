---
name: objective-update
description: "Update tracking for exactly one existing Objective after work or branch/PR changes — record a Semantic Update, edit roadmap/assumptions/risks, and auto-close only when completion criteria are clearly met. Use for 'update the objective', 'record this progress', 'this branch needs an objective update'. For a non-closing rebaseline of records use objective-refresh; for an explicit close use objective-close; for advice on what to do next without writing use objective-next."
---

# objective-update

Update Objective tracking for exactly one selected Objective. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, consolidation guidance, and safety boundaries.

`objective-update` owns the mutable one-Objective update workflow, including Closure Gate auto-close when clear. Use `objective-refresh` for non-closing rebaseline, `objective-close` for explicit closure, and `objective-next` for recommendation-first routing. If the user asks to combine, merge, subsume, or consolidate Objectives, stop treating the request as ordinary `objective-update` and follow the `objective` skill's consolidation guidance.

## Invocation

Run when the user explicitly asks to update Objective tracking, record progress, says branch/PR changes need an Objective update, invokes `$objective-update`, or provides a `<skill name="objective-update">` block as an action cue.

Also run when `objective-next` selected a slug/path, its Tracking Gate blocks, and either the gate's clear-progress auto-update policy applies or the user otherwise confirms/preauthorizes updating that same Objective before continuing.

If the user only asks about the skill or pastes it with no clear update intent, ask: `Do you want me to run objective-update for the current branch now?`

## Objective record invariants

Active records live at `.sdl/objectives/<slug>/`. Archived records under `.sdl/objective-archive/<slug>/` are not active update candidates.

Required shape:

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` only when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/<timestamp>-<slug>.md`: `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: minimal Closure Marker; existence means closed, but closure meaning belongs in `objective.md` under `## Closure`.

Objective records are Markdown: read/edit them directly, using `objective exec` only for deterministic reads such as candidate listing, inventory, and closed-marker detection.

Mutation boundary:

- Edit only the selected Objective's `objective.md`, `roadmap.md`, `closed.md` when closing, and new files under `updates/`.
- Never move, delete, recreate, or normalize Objective slug directories during an update. The slug directory is durable identity; explicit slug migration is separate.
- Never edit, rewrite, amend, normalize, delete, move, or recreate an existing file under `updates/`. Existing Semantic Updates are immutable historical records.

## Select exactly one Objective

1. Resolve ambiguous invocation intent first.
2. Use an explicit user-provided slug/path under `.sdl/objectives/<slug>/` when present.
3. If the selected path is under `.sdl/objective-archive/`, stop and ask whether to unarchive before updating Objective tracking.
4. Otherwise run `objective list --minimal --format md` immediately.
5. If exactly one active Objective exists and update intent is explicit, ask before evidence or mutation: `Only one active Objective exists: <slug>. Run objective-update for this Objective?`
6. If multiple active Objectives exist, present the command output and ask for one slug/path; do not ask a generic question before showing options.
7. If none exist, say so and suggest `objective-create` when appropriate.

Never write a multi-Objective update. Never auto-select from candidate count, branch names, PR titles, package names, roadmap keywords, changed/touched files, or hidden attachment mechanisms. After selection, branch, Graphite, local-diff, and PR facts may be evidence only; they never participate in selection.

## Landed-state authoring model

Write the selected Objective as if the current git changes or current-branch PR changes have landed on the default branch. Ask: `If this branch/PR were merged now, what should the selected Objective say on the default branch?`

- The implementation and Objective edit may land atomically in one PR; do not require merge first.
- Do not keep a roadmap row `[~]` merely because the implementing PR is open; if evidence completes it, write the post-landing state.
- Do not write branch changelogs or PR changelogs. Mention branch names, PR numbers, review status, or merge status only as durable evidence, useful breadcrumbs, or confidence qualifiers.
- Current branch or current PR evidence may support post-landing Objective content, but actual merge-state wording must remain status-aware: use current PR, open PR, draft PR, or PR evidence unless explicit PR evidence confirms the PR is merged.
- Open, draft, or unmerged PR state alone is not uncertainty. If evidence is incomplete, failing, disputed, or otherwise uncertain, ask or record a risk/follow-up instead of inventing completion.

## Read and collect evidence after selection

First run `objective exec read-objective <slug> --format md` to confirm path, state, inventory, raw Markdown, and closed-marker presence. If `closed.md` exists, stop unless the user explicitly asked to amend the closed record; v1 has no reopen workflow.

For large Objectives, use the inventory/closed-state output, then focus on `objective.md`, `roadmap.md`, and recent updates only when needed. Do not spend context on old updates unless they materially affect the current change; old updates are historical evidence, not editable targets.

Collect fail-soft repo evidence:

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

3. Base discovery: prefer `gt parent --no-interactive`; else use `baseRefName` from `gh pr view` when current-branch PR evidence is available; else use plain-git default/trunk best effort. Do not parse human-facing `gt branch info`, `gt ls`, `gt ls --stack`, or `gt log` output for machine topology decisions; use `gt parent --no-interactive`, `slot gt exec stack-branches`, or JSON/plumbing surfaces for topology.
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

Use working-tree and branch `name-status` evidence as a path-integrity check. Stop before editing if the update would add, delete, move, or recreate a sibling `.sdl/objectives/<other-slug>/` directory, or existing local changes already do so without an explicit slug-migration request.

Update only when selected Objective content clearly matches the request and evidence. If evidence is ambiguous, unrelated, or maps to multiple roadmap rows, ask instead of writing. In durable Objective files, avoid temporal absence statements unless material; prefer stable evidence wording such as local branch diff, PR corroboration, or PR evidence not required.

## Write rules

Compare request, evidence, and selected Objective files; update durable Markdown only when meaning changed.

- Edit `objective.md` for durable narrative, boundaries, completion criteria, assumptions, risks, open questions, or closure-adjacent context.
- Update `## Assumptions and Risks` when evidence changes risk knowledge: mark assumptions incorrect/revised/still active; mark risks de-risked/not de-risked/materialized/accepted/still open; add new assumptions/risks that affect scope, sequencing, confidence, or completion evidence. Preserve useful history; do not silently delete disproven assumptions or de-risked risks.
- Edit `roadmap.md` when ordered guidance, checkbox state, status notes, completion evidence, or parked work changed.

### Immutable Semantic Updates

Write a new Semantic Update for a distinct finding, blocker, decision, risk change, completion event, or follow-up slice that materially changes roadmap state. For maintenance-only durable edits with no new semantic information, write no update and say so explicitly. If later evidence corrects, supersedes, or contextualizes an older update, write a new update that states the newer durable meaning and, when useful, notes older updates are historical records.

Never amend an existing update for stale evidence, corrected counts, renamed concepts, same-branch/PR verification wording, duplicate shipped/progress wording, typo cleanup, formatting cleanup, closure, or any other reason.

When a material Objective PR directly advances, de-risks, or completes the selected Objective, record it in the new Semantic Update as Objective PR evidence using the shared bullet convention when helpful:

```markdown
- PR #123: <short summary/title> — <Objective impact>
```

PR evidence remains optional; do not require GitHub evidence when local branch evidence is sufficient and the update does not claim PR, review, CI, or merge state. Do not record every associated branch/PR. Use merged PR wording only after `gh pr view` or other explicit evidence confirms merge state.

### Verification evidence

Prefer command plus pass/fail over exact aggregate counts in durable Objective files. Record exact counts only when materially meaningful.

Do not add or preserve routine validation-only roadmap rows merely to keep Objective tracking open. Fold routine validation into evidence on the relevant semantic row, Semantic Update, or closure context. Validation may remain roadmap work only when validation/test/CI behavior, release qualification, or non-routine validation investigation is the Objective deliverable.

## Closure Gate

After normal evidence and durable edits, evaluate whether the selected Objective appears ready to close.

Closure-ready means the Objective is not already closed; outcome is clear (`completed` or intentionally `abandoned`); completion criteria or abandonment rationale are evidenced; no active non-parked roadmap work remains; important risks/open questions are resolved, accepted, or carried as follow-ups/caveats; and concise `## Closure` prose can record outcome, evidence, caveats, and follow-ups.

Do not close merely because roadmap checkboxes are all `[x]`, or from any selection hint.

If closure-ready after an explicit `objective-update`, close automatically with `objective-close` semantics inline: add/update `## Closure` in `objective.md`, write minimal `closed.md`, keep the Objective directory in place, and put closure meaning in `objective.md`, not `closed.md`. Do not ask for separate closure confirmation when outcome and rationale are clear.

If closure readiness, outcome, or rationale is ambiguous, leave `closed.md` absent and report that closure was skipped because the Closure Gate was not clear. Do not create a duplicate Semantic Update solely for closure; create one only when closure introduces distinct semantic information beyond the normal update. Never amend an existing update for closure.

## Workflow

1. Resolve exactly one active Objective.
2. Run `objective exec read-objective <slug> --format md`; stop if closed unless explicit amend-closed-record intent is present.
3. Collect post-selection repo evidence and perform the path-integrity check.
4. Compare request, evidence, and Objective files to identify durable tracking changes.
5. Edit `objective.md` if narrative, boundaries, criteria, assumptions, risks, open questions, or closure-adjacent context changed.
6. Edit `roadmap.md` if ordered guidance, checkbox state, evidence, or parked work changed.
7. Create a new Semantic Update only when semantically warranted; otherwise say no update was written.
8. Apply the Closure Gate.
9. Report per Verify.

## Stop / ask

Stop or ask when selection is ambiguous/absent after presenting `objective list --minimal --format md`; the selected path is archived; update intent is still ambiguous; only-open confirmation is pending; the request would update multiple Objectives; the selected Objective is closed without amend intent; closure outcome/rationale is unclear; slug-directory mutation would occur; an existing Semantic Update would be modified; the user asks for ceremonial status ping, branch changelog, registry, YAML/frontmatter, UUID, hidden metadata, or state-machine behavior; or information is insufficient for accurate durable narrative, assumptions/risks, or Semantic Update content.

For archived paths, ask whether to unarchive before updating Objective tracking. For existing update mutation, explain that updates are immutable and offer to write a new corrective update when appropriate. For unclear closure, leave the Objective open unless the user clarifies.

## Verify

- Changed Objective files all live under exactly one `.sdl/objectives/<slug>/` directory, with no added, deleted, moved, or recreated sibling Objective slug directories.
- New update file, if any, has a timestamped, human-readable filename under that Objective's `updates/` directory.
- No existing file under the selected Objective's `updates/` directory was edited, deleted, moved, normalized, or recreated.
- Required headings remain present in edited durable files, including `## Assumptions and Risks`.
- If closure was performed, confirm `objective.md` contains `## Closure` and `closed.md` exists; if not, confirm no `closed.md` was created by this invocation.
- Final response includes: selected Objective slug/path; durable files edited; whether a new Semantic Update was created or intentionally not written; confirmation that existing Semantic Updates were not modified; local uncommitted changes considered; local committed branch diff considered with base branch if known; PR evidence considered/unavailable/irrelevant; Graphite parent considered/unavailable/irrelevant; Closure Gate result (`not evaluated`, `not ready`, `auto-closed`, or `skipped-unclear`) and whether `closed.md` was written; verification run or skipped.
