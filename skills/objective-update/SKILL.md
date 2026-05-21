---
name: objective-update
description: "Command: objective-update"
---

# objective-update

Update Objective tracking for exactly one Objective.

For shared vocabulary and system-wide rules, use the `objective` skill when available; this command remains self-contained.

## Invocation intent

Run this workflow when the user explicitly asks to update Objective tracking, says branch or PR changes require an Objective update, invokes `$objective-update`, or provides a `<skill name="objective-update">` block as an action cue.

If the user only asks about the skill or pastes the skill with no clear update intent, ask one short confirmation question instead of passively acknowledging it: "Do you want me to run `objective-update` for the current branch now?"

## Required shape

Canonical root: `.asdl/objectives/<slug>/`.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- Update files: `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read and edit Markdown directly. Use `objective exec` for deterministic read mechanics (candidate listing, file inventory, closed-marker detection). Mutation remains direct.

## Resolve exactly one Objective

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `objective list --state open --format md` immediately.
3. If exactly one open Objective exists and the user explicitly requested an Objective update, present it as the only candidate and ask one short confirmation question before continuing: `Only one open Objective exists: <slug>. Run objective-update for this Objective?` Do not collect repo evidence or mutate Objective files until the user confirms.
4. If multiple open Objectives exist, present the options from that command's output in your reply and ask the user to choose one slug/path. Do not ask a generic "which Objective?" question before showing the enumerated options.
5. If no candidates exist, say so and suggest `objective-create` when appropriate.

The exactly-one confirmation path is only for explicit `objective-update` requests. If update intent is ambiguous, ask the invocation-intent confirmation question before presenting the only open Objective for confirmation.

Do not write a multi-Objective update. Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

After exactly one Objective is selected, branch, Graphite, local-diff, and PR facts may be considered as optional repo evidence for that selected Objective only. They never participate in Objective selection.

## Landed-state semantics

`objective-update` brings the selected Objective up to date as if the current git changes or current-branch PR changes have landed on the default branch. Treat the selected branch/PR diff as prospective trunk state, not as an ephemeral branch status report.

Frame the implementation change and the Objective edit as one atomic patch: the progress and the update about that progress land together. The goal is for the current branch's PR, if it exists, to be internally accurate immediately after merge.

- Ask: "If this branch/PR were merged now, what should the selected Objective say on the default branch?" Write that state.
- Do not require the implementation PR to have already merged, and do not keep a roadmap row `[~]` merely because the implementing PR is still open. If the selected evidence clearly completes the work, update the Objective to the state that should be true after that patch lands.
- It is normal for the Objective update to be in the same PR as the implementation. Do not treat missing pre-existing Objective changes as a blocker when `objective-update` is about to write them.
- Do not write branch changelogs. Mention branch names, PR numbers, review status, or merge status only when they are durable evidence, useful breadcrumbs, or materially affect confidence.
- Open/draft/unmerged PR state alone is not uncertainty. If the evidence itself is incomplete, failing, disputed, or otherwise uncertain in a way that affects whether the Objective state would be true after landing, ask or record the uncertainty as a risk/follow-up instead of inventing completion.

## Post-selection repo evidence

After loading the selected Objective and confirming it is not closed, collect available repo evidence fail-soft in this order:

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

3. Stack/base discovery:
   - If Graphite is available, run `gt branch info` and extract `Parent: <branch>` when present.
   - Else if current-branch PR evidence is available, use `baseRefName` from `gh pr view`.
   - Else use a plain-git default/trunk best effort from available repo refs.

4. Local branch evidence against the selected base, when a base is known:

   ```bash
   git log --oneline <base>..HEAD
   git diff --stat <base>...HEAD
   git diff --name-status <base>...HEAD
   ```

5. Optional PR evidence:

   ```bash
   gh pr view --json number,title,state,url,headRefName,baseRefName,files,commits
   ```

Do not require PR evidence when local committed branch evidence is sufficient. For stacked Graphite branches, prefer the Graphite parent as the diff/log base so lower-stack changes are not included. If all base discovery fails, still inspect recent commits and uncommitted status; ask only when evidence remains insufficient to write accurate Objective tracking.

Treat branch, Graphite, local-diff, and PR metadata only as evidence for the already selected Objective and for the landed-state projection. Do not update merely because a PR exists.

Update only when the selected Objective content clearly matches the user's request and repo evidence such as changed paths, branch commits, PR files, title, or commits. If the evidence is ambiguous, appears unrelated, or could map to multiple roadmap rows, ask instead of writing.

In the final response, mention whether PR evidence was considered, unavailable, or irrelevant. In durable Objective updates, avoid temporal absence statements like `No current-branch PR evidence was available` unless the absence itself is materially important. Prefer durable wording such as:

- `Evidence: local branch diff against <base>; full gate passed.`
- `PR evidence was not required; local branch commits were sufficient.`
- `PR #<n> corroborates the same file set and completion evidence.`

## Objective read scope

Run `objective exec read-objective <slug> --format md` to confirm path, state, file inventory, raw Markdown, and closed-marker presence. For large Objectives, use that output for inventory and closed state, then focus detailed reading on:

- `.asdl/objectives/<slug>/objective.md`
- `.asdl/objectives/<slug>/roadmap.md`
- the relevant existing update file, when amending one
- the most recent updates only when they are needed for context

Do not spend context on every old update unless it materially affects the current Objective change.

## Amend vs new Semantic Update

Amend an existing update when:

- correcting stale or incorrect evidence for the same semantic event;
- fixing verification wording or counts for an update created on the same branch/PR;
- avoiding a duplicate shipped/progress update for the same roadmap row.

Write a new update when:

- there is a distinct new finding, blocker, decision, risk change, or completion event;
- the previous related update has already landed and the new information changes Objective meaning;
- a follow-up slice materially changes roadmap state.

## Verification evidence

Prefer command plus pass/fail over exact aggregate counts in durable Objective files. Record exact counts only when they are materially meaningful.

- Good: `Verification: targeted reviewer suite passed; full just passed.`
- Avoid: `Verification: full just passed (1285 passed)` unless that count is required.

The final response may include exact command output when useful, but durable Objective files should not churn because unrelated test counts changed.

## Workflow

1. Run `objective exec read-objective <slug> --format md` as described in Objective read scope.
2. If closed, stop unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.
3. Collect post-selection repo evidence as described above.
4. Compare the user's request, repo evidence, and existing Objective files to decide what durable tracking changed.
5. Edit `objective.md` when durable narrative, boundaries, completion criteria, assumptions, risks, open questions, or closure-adjacent context changed.
6. Update `## Assumptions and Risks` when evidence changes risk knowledge:
   - Mark an assumption incorrect, revised, or still active when new evidence bears on it.
   - Mark a risk de-risked, not de-risked, materialized, accepted, or still open with concise evidence or rationale.
   - Add newly discovered assumptions or risks when they affect scope, sequencing, confidence, or completion evidence.
   - Preserve useful history in the prose; do not silently delete disproven assumptions or de-risked risks without explanation.
7. Edit `roadmap.md` when ordered guidance, checkbox state, status notes, completion evidence, or parked work changed.
8. Create or amend a Semantic Update for meaningful information: finding, decision, blocker, assumption invalidation, risk de-risking or surfacing, completion evidence, changed plan, or follow-up.
9. Explain why durable files changed, or why they intentionally remained correct after meaningful evidence was considered.
10. For maintenance-only durable edits with no new semantic information, do not create or amend an update file; say that explicitly.

## Stop / ask

- Objective selection is ambiguous or absent after presenting the `objective list --state open --format md` options.
- Update intent is ambiguous after the invocation-intent confirmation question.
- The exactly-one open Objective confirmation is pending.
- The request would update more than one Objective.
- The selected Objective is closed and the user has not explicitly asked to amend its closed record.
- The user asks for a ceremonial status ping, branch changelog, registry, YAML/frontmatter, UUID, hidden metadata, or state-machine behavior.
- There is not enough information to write accurate durable narrative, assumptions/risks, or Semantic Update content.

## Verify

- Confirm changed Objective files all live under exactly one `.asdl/objectives/<slug>/` directory.
- If a new update file was written, confirm its filename is timestamped, human-readable, and under that Objective's `updates/` directory.
- If an update file was amended, confirm it is the existing Semantic Update for the same event rather than a duplicate.
- Confirm required headings remain present in edited durable files, including `## Assumptions and Risks`.
- Final response includes:
  - selected Objective slug/path;
  - durable files edited;
  - whether a Semantic Update was created, amended, or intentionally not written;
  - local uncommitted changes considered;
  - local committed branch diff considered, including base branch if known;
  - PR evidence considered, unavailable, or irrelevant;
  - Graphite parent considered, unavailable, or irrelevant;
  - verification run or skipped.
