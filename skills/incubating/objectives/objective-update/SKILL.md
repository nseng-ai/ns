---
name: objective-update
disable-model-invocation: true
description: "Update tracking for exactly one existing Objective after work or branch/PR changes — record a Semantic Update, edit roadmap/assumptions/risks, and auto-close only when completion criteria are clearly met. Use for 'update the objective', 'record this progress', 'this branch needs an objective update'. For a verified rebaseline of records use objective-refresh; for an explicit close use objective-close; for advice on what to do next without writing use objective-next."
---

# objective-update

Update Objective tracking for exactly one selected Objective. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, consolidation guidance, and safety boundaries.

`objective-update` owns the mutable one-Objective update workflow, including Closure Gate auto-close when clear. If the user asks to combine, merge, subsume, or consolidate Objectives, stop treating the request as ordinary `objective-update` and follow the `objective` skill's consolidation guidance.

## Invocation

Run when the user explicitly asks to update Objective tracking, record progress, says branch/PR changes need an Objective update, invokes `$objective-update`, or provides a `<skill name="objective-update">` block as an action cue.

Also run when `objective-next`'s Tracking Gate routes here for the same Objective; that skill owns the handoff trigger.

If the user only asks about the skill or pastes it with no clear update intent, ask: `Do you want me to run objective-update for the current branch now?`

## Mutation boundary

The umbrella skill owns the storage model, required headings, and status semantics — this skill does not restate them. Objective records are Markdown: read/edit them directly, using `ns objective exec` only for deterministic reads such as candidate listing, inventory, and closed-marker detection.

- Edit only the selected Objective's `objective.md`, `roadmap.md`, `orientation.md` (optional; only when not closing), `closed.md` when closing, and new files under `updates/`.
- Two sanctioned exceptions exist: mirrored edge mutations may edit counterpart frontmatter, and an inline close must propagate semantic impact to every edge-connected Objective per `objective-close`. Outside inline closure, the Record Frontmatter section below defines the narrow exception.
- Never move, delete, recreate, or normalize Objective slug directories during an update. The slug directory is durable identity; explicit slug migration is separate.
- Treat existing Semantic Updates as immutable historical records per the `objective` umbrella skill; create new update files instead of changing old ones.

## Select exactly one Objective

Select per the umbrella skill's Selection rules, including its objective-update one-candidate exception. When that exception applies, ask before evidence or mutation: `Only one active Objective exists: <slug>. Run objective-update for this Objective?` When multiple active Objectives exist, present the `ns objective list --format md` output and ask for one slug/path; do not ask a generic question before showing options.

Never write a multi-Objective update. After selection, branch, Graphite, local-diff, and PR facts may be evidence only; they never participate in selection.

## Landed-state authoring model

Write the selected Objective as if the current git changes or current-branch PR changes have landed on the default branch. Ask: `If this branch/PR were merged now, what should the selected Objective say on the default branch?`

- The implementation and Objective edit may land atomically in one PR; do not require merge first.
- Do not keep a roadmap row `[~]` merely because the implementing PR is open; if evidence completes it, write the post-landing state.
- Do not write branch changelogs or PR changelogs. Mention branch names, PR numbers, review status, or merge status only as durable evidence, useful breadcrumbs, or confidence qualifiers.
- Current branch or current PR evidence may support post-landing Objective content, but merge-state wording must stay status-aware per the umbrella skill's Objective PR evidence convention.
- Open, draft, or unmerged PR state alone is not uncertainty. If evidence is incomplete, failing, disputed, or otherwise uncertain, ask or record a risk/follow-up instead of inventing completion.

## Read and collect evidence after selection

First run `ns objective exec read-objective <slug> --format md` to confirm path, state, inventory, raw Markdown, and closed-marker presence. If `closed.md` exists, stop unless the user explicitly asked to amend the closed record; reopening a closed Objective happens only on an explicit user request through `objective-close`'s Reopen procedure — there is no separate public reopen command.

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

3. Base discovery: prefer `gt parent --no-interactive`; else use `baseRefName` from `gh pr view` when current-branch PR evidence is available; else use plain-git default/trunk best effort. Human-facing Graphite display output is never a machine topology source (see `docs/conventions/graphite-dependency-boundary.md`); use `gt parent --no-interactive`, `ns slot gt exec stack-branches`, or JSON/plumbing surfaces.
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

Use working-tree and branch `name-status` evidence as a path-integrity check. Stop before editing if the update would add, delete, move, or recreate a sibling `.ns/objectives/<other-slug>/` directory, or existing local changes already do so without an explicit slug-migration request.

Update only when selected Objective content clearly matches the request and evidence. If evidence is ambiguous, unrelated, or maps to multiple roadmap rows, ask instead of writing. In durable Objective files, avoid temporal absence statements unless material; prefer stable evidence wording such as local branch diff, PR corroboration, or PR evidence not required.

## Write rules

Compare request, evidence, and selected Objective files; update durable Markdown only when meaning changed.

- Edit `objective.md` for durable narrative, boundaries, completion criteria, assumptions, risks, open questions, or closure-adjacent context.
- Update `## Assumptions and Risks` when evidence changes risk knowledge: mark assumptions incorrect/revised/still active; mark risks de-risked/not de-risked/materialized/accepted/still open; add new assumptions/risks that affect scope, sequencing, confidence, or completion evidence. Preserve useful history; do not silently delete disproven assumptions or de-risked risks.
- Edit `roadmap.md` when ordered guidance, checkbox state, status notes, completion evidence, or parked work changed.
- **Question Rows (ideation Objectives).** Resolving a Question Row records the resolved decision — a Semantic Update and/or a resolved-decisions entry in the record — and marks the row `[x]`, graduates any Fog the answer made specifiable into new typed Question Rows, and may invalidate other rows (mark and explain rather than silently delete). If an answer reveals a row sits beyond the Destination, rule it out of scope — drop the row with a recorded decision and note it in the record's non-goals prose — rather than resolving it. When the last Question Row resolves and only ordinary execution rows remain, note the Crystallization in the update. See the `objective` skill's Objective patterns reference (`references/objective-patterns.md`).

### Record Frontmatter: edges and the Blocked Sentence

This skill owns edge mutation and Blocked Sentence judgment for the selected Objective; Record Frontmatter definitions and semantics live in the `objective` umbrella skill.

- **Edges.** When evidence shows a durable inter-objective relationship appeared, changed meaning, or dissolved, add, reword, or remove the edge as the umbrella skill's mirrored two-file edit with a perspective-correct annotation on each side. Editing the counterpart's frontmatter is the sanctioned exception to the mutation boundary above.
- **Re-judge the record's own Blocked Sentence on every update.** Compare the current `blocked:` sentence (or its absence) against the evidence: set it when the record is now gated, reword it when stale, and clear it when the gate no longer holds. This is always skill judgment.
- **Verify.** After any frontmatter edit, run `ns objective check <slug>` or `ns objective check --all`; structural violations are errors and must be fixed before finishing.

### Immutable Semantic Updates

Write a new Semantic Update for a distinct finding, blocker, decision, risk change, completion event, or follow-up slice that materially changes roadmap state. For maintenance-only durable edits with no new semantic information, write no update and say so explicitly. If later evidence corrects, supersedes, or contextualizes an older update, write a new update that states the newer durable meaning and, when useful, notes older updates are historical records.

Existing updates are **immutable** — never amend one, for any reason; write a corrective update instead.

When a material Objective PR directly advances, de-risks, or completes the selected Objective, record it in the new Semantic Update as Objective PR evidence using the shared convention from the `objective` umbrella skill when helpful.

PR evidence remains optional; do not require GitHub evidence when local branch evidence is sufficient and the update does not claim PR, review, CI, or merge state.

### Verification evidence

Prefer command plus pass/fail over exact aggregate counts in durable Objective files. Record exact counts only when materially meaningful.

Fold routine validation into evidence on the relevant semantic row, Semantic Update, or closure context; the umbrella skill's roadmap validation-rows rule governs when validation may be roadmap work.

## Closure Gate

After normal evidence and durable edits, evaluate whether the selected Objective appears ready to close.

Closure-ready means the Objective is not already closed; outcome is clear (`completed` or intentionally `abandoned`); completion criteria or abandonment rationale are evidenced; no active non-parked roadmap work remains; important risks/open questions are resolved, accepted, or carried as follow-ups/caveats; and concise `## Closure` prose can record outcome, evidence, caveats, and follow-ups.

Do not close merely because roadmap checkboxes are all `[x]`, or from any selection hint.

If closure-ready after an explicit `objective-update`, close automatically inline per the full `objective-close` semantics — including its connected-Objective propagation — without a separate closure confirmation when outcome and rationale are clear.

If closure readiness, outcome, or rationale is ambiguous, leave `closed.md` absent and report that closure was skipped because the Closure Gate was not clear. Do not create a duplicate Semantic Update solely for closure; create one only when closure introduces distinct semantic information beyond the normal update. Never amend an existing update for closure.

## Workflow

1. Resolve exactly one active Objective.
2. Run `ns objective exec read-objective <slug> --format md`; stop if closed unless explicit amend-closed-record intent is present.
3. Collect post-selection repo evidence and perform the path-integrity check.
4. Compare request, evidence, and Objective files to identify durable tracking changes.
5. Edit `objective.md` if narrative, boundaries, criteria, assumptions, risks, open questions, or closure-adjacent context changed.
6. Edit `roadmap.md` if ordered guidance, checkbox state, evidence, or parked work changed.
7. Re-judge the record's own Blocked Sentence and mutate edges when evidence warrants, per Record Frontmatter above.
8. Create a new Semantic Update only when semantically warranted; otherwise say no update was written.
9. Apply the Closure Gate.
10. If not closing and `orientation.md` exists, re-derive it against the now-current state using the umbrella `objective` skill's orientation re-derivation rule. If the Objective has become orienting (its direction now binds unrelated agents) and lacks one, add `orientation.md` using the umbrella format. Do not author or re-derive `orientation.md` when closing — `closed.md` drops it from the load set.
11. Report per Verify.

## Stop / ask

Stop or ask when:

- selection is ambiguous/absent after presenting `ns objective list --format md`, or the selected path is outside `.ns/objectives/<slug>/`;
- update intent is still ambiguous, or only-open confirmation is pending;
- the request would update multiple Objectives;
- the selected Objective is closed without amend intent, or closure outcome/rationale is unclear;
- slug-directory mutation would occur, or an existing Semantic Update would be modified;
- the request asks for anything the umbrella skill's Non-goals ban;
- information is insufficient for accurate durable narrative, assumptions/risks, or Semantic Update content.

For existing update mutation, explain that updates are immutable and offer to write a new corrective update when appropriate. For unclear closure, leave the Objective open unless the user clarifies.

## Verify

- Changed Objective files all live under exactly one `.ns/objectives/<slug>/` directory, with no added, deleted, moved, or recreated sibling Objective slug directories. Exceptions: mirrored edge mutations may change counterpart Record Frontmatter; when the selected Objective closes inline, the full close-time connected-Objective propagation contract may also update affected counterparts' durable tracking and add counterpart-local Semantic Updates.
- If Record Frontmatter was edited (own record or a counterpart), `ns objective check <slug>` or `ns objective check --all` was run and reports no structural errors.
- New update file, if any, has a timestamped, human-readable filename under that Objective's `updates/` directory.
- No existing file under the selected Objective's `updates/` directory was edited, deleted, moved, normalized, or recreated.
- Required headings remain present in edited durable files, including `## Assumptions and Risks`.
- If closure was performed, confirm `objective.md` contains `## Closure` and `closed.md` exists; if not, confirm no `closed.md` was created by this invocation.
- If `orientation.md` was re-derived or newly added, confirm it was done only because the Objective is orienting and not closing, and that it follows the format; `orientation.md` remains optional.
- Final response includes: selected Objective slug/path; durable files edited; whether a new Semantic Update was created or intentionally not written; confirmation that existing Semantic Updates were not modified; local uncommitted changes considered; local committed branch diff considered with base branch if known; PR evidence considered/unavailable/irrelevant; Graphite parent considered/unavailable/irrelevant; Closure Gate result (`not evaluated`, `not ready`, `auto-closed`, or `skipped-unclear`) and whether `closed.md` was written; when auto-closed, every connected Objective's disposition and files changed; verification run or skipped.
