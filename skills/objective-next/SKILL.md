---
name: objective-next
disable-model-invocation: true
description: "Recommend the next useful work for an active Objective. Use when asking what to do next on an existing Objective: 'what's next on this objective', 'recommend next work', 'next step for objective X'. Recommend-first by default; routes clear stale tracking through objective-update before continuing, and may route to confirmed execution when durable Objective policy allows it. To create a new Objective use objective-create."
---

# objective-next

Recommend the next useful work for an active Objective. When explicit Objective policy allows it, or when the user explicitly asks to execute a concrete `objective-next` recommendation from the current conversation, route to confirmed-execution guidance. If clear stale tracking blocks the recommendation, run the explicit `objective-update` workflow for the same Objective before continuing; ask first only when evidence or update scope is ambiguous. Always include a best-effort work-left estimate as remaining semantic steps, not calendar time.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this step remains self-contained for its own happy path.

## Required shape

Active root: `.sdl/objectives/<slug>/`. Archived records under `.sdl/objective-archive/<slug>/` are not active work candidates.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; optional execution policy; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only; semantic rows may include indented prose guidance.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `orientation.md`: optional, agent-facing standing rule; present only for cross-cutting Objectives.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read `objective.md`, `roadmap.md`, and `updates/` directly. Use `sdl objective exec` for deterministic mechanics like candidate listing, file inventory, closed-marker detection, and tracking-gate git evidence.

The Objective slug directory is durable identity. Command/product/prose renames do not imply an Objective slug rename.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.sdl/objectives/<slug>/`.
2. If the selected path is under `.sdl/objective-archive/`, stop and ask whether to unarchive before recommending next work.
3. If no slug or path is explicit, run `sdl objective list --minimal --format md` to enumerate active checkout-local open candidates and ask the user to choose.
4. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms. Changed-path evidence belongs only to the Tracking Gate after an Objective is selected.

## Tracking Gate

Before recommending work or offering execution, run:

```sh
sdl objective exec tracking-gate <slug> --format json
```

Use the JSON payload as deterministic evidence; do not hand-roll branch-base detection or shell pipelines for this gate. In particular:

- `git.trunkBranch` and `git.revisionRange` are the resolved branch-diff basis.
- `uncommitted.repository` reports whether the worktree has uncommitted changes.
- `uncommitted.objective` reports whether the selected Objective record has uncommitted changes.
- `branchDiff.objectiveChangedPaths` reports committed branch-diff changes under `.sdl/objectives/<slug>/`.
- `branchDiff.materialNonObjectivePaths` reports committed branch-diff changes outside that Objective record.
- `summary.*` gives booleans/nulls for quick gate decisions.

Then:

1. Inspect `materialNonObjectivePaths` plus uncommitted evidence for current-branch or worktree progress that plausibly advances the selected Objective.
2. Compare with `objectiveChangedPaths` and `uncommitted.objective` to decide whether corresponding Objective tracking appears present.
3. If meaningful current-branch or worktree progress for the selected Objective appears clearly unrecorded, treat the `objective-next` request as update-and-continue preauthorization: run `objective-update` for the same selected slug/path, then reread Objective and rerun `sdl objective exec tracking-gate <slug> --format json` before recommending work or offering execution.
4. If meaningful progress appears likely but evidence, Objective fit, or update scope is ambiguous, ask: `Run objective-update for <slug> now, then rerun objective-next?`
5. If the user declines or confirmation is pending, stop without a next-work recommendation or execution offer.
6. If evidence is absent or clearly unrelated, proceed with a concise note that names the resolved diff basis (for example `master...HEAD`) and whether material non-Objective paths were present.

The Tracking Gate check itself is read-only. Any file changes during this phase belong only to the explicit `objective-update` workflow that the gate routes into. If the tracking-gate command itself fails because the extension is unavailable or the git evidence cannot be collected, report the failure and ask whether to proceed with a degraded manual read; do not silently fall back to ad hoc shell.

## Conditional references

After selecting and reading the Objective, if the user asks to execute/advance/run work, gives a clear affirmative confirmation to a current-session recommendation, or if the selected Objective/roadmap row contains `## Runner Policy`, `## Definition of Progress`, row-level `Policy:`, or equivalent execution prose, read `references/confirmed-execution.md` before interpreting execution basis or offering/running execution.

Normal next-work recommendations do not require loading confirmed-execution guidance.

## Recommendation-continuation execution

A durable `## Runner Policy` is not required when the user explicitly asks to execute a concrete `objective-next` recommendation that is still in the current conversation.

Use this path only when all are true:

- the prior `objective-next` response selected the same Objective slug;
- it recommended one coherent next semantic step rather than a grab bag;
- it named enough scope, likely areas, and completion evidence to bound execution;
- the current user turn is a clear affirmative confirmation to execute that recommendation;
- requested work can stay within local repository edits, local validation, and meaningful Objective tracking unless the user separately asked for branch/commit/PR/external writes.

If any condition is missing or ambiguous, do not execute yet: reread the Objective, restate a bounded preview, and ask for confirmation or steering. This path is session-scoped execution basis, not hidden Objective state and not a substitute for durable policy when future sessions should proactively offer execution.

## Workflow

1. Exclude closed Objectives by default. If `closed.md` exists, stop and say it is closed.
2. Read `objective.md`, `roadmap.md`, `orientation.md` (if present), and relevant `updates/` files.
3. Apply the Tracking Gate by running `sdl objective exec tracking-gate <slug> --format json`. If it finds clear unrecorded current-branch progress for the selected Objective, perform the `objective-update` workflow for this same Objective, then restart from step 2 with refreshed files/evidence and a fresh tracking-gate run. If the gate is ambiguous and the user confirms update-and-continue, do the same.
4. Load conditional references only when their routing conditions apply.
5. Choose the smallest coherent next semantic step grounded in the Objective narrative, roadmap, active assumptions, and risks.
6. Form a best-effort work-left estimate: if the Objective narrative and roadmap make the remaining path clear, estimate the semantic steps remaining until Objective completion; if not, estimate the work remaining until the next discovery/decision step where additional work can be identified. Express this as step count, named slices, or coarse scope, not elapsed time.
7. Recommend only semantic Objective work; do not select generic validation-only rows such as `just`, tests, waiting for CI, or full repo validation unless validation/test/CI behavior or a non-routine validation investigation is itself the deliverable.
8. If only routine validation-only non-parked rows remain, say no substantive Objective work remains. Suggest running ordinary validation outside the roadmap, then using `objective-update` to record evidence and/or `objective-close` if completion criteria are satisfied.
9. If no active or planned semantic work remains, say the Objective may be ready for `objective-close` instead of inventing work.

## Recommend-only output

Use this path for ordinary `objective-next` recommendations, when the user only asked for advice, or when no safe execution basis exists.

- Recommend the next useful semantic step.
- Explain the narrative or roadmap basis, likely files/areas, active assumption or risk exercised, and completion evidence to record afterward.
- Include a best-effort work-left estimate: either remaining semantic steps/slices until Objective completion, or remaining work until the next discovery/decision step that will reveal additional work. Do not estimate calendar time.
- If execution was requested but neither durable policy nor recommendation-continuation basis makes execution safe, say what information or confirmation is missing. Mention durable `## Definition of Progress` / `## Runner Policy` only when future sessions should proactively offer execution for this Objective.
- Do not mutate files except through an explicit `objective-update` handoff.

## Stop / ask

- Objective selection is ambiguous or absent.
- The selected path is under `.sdl/objective-archive/`; ask whether to unarchive before recommending next work.
- The selected Objective is closed.
- The Tracking Gate finds likely unrecorded material progress but evidence, Objective fit, or update scope is ambiguous and confirmation to run `objective-update` is pending or declined.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `objective-update`.
- Execution basis is relevant but ambiguous for the selected slice; load `references/confirmed-execution.md` and recommend or steer instead of executing.
- Requested execution would exceed durable policy, recommendation-continuation scope, preview scope, validation boundaries, or permissions for external systems / write-capable actions.

## Verify

- Name the selected slug and identify the roadmap item or narrative basis for the recommendation, steering question, or execution preview.
- If recommendation-only or steer-first, ensure no files changed except through an explicit `objective-update` handoff; report any handoff output separately and confirm it stayed under the selected slug.
- If confirmed execution ran, verify and report according to `references/confirmed-execution.md`, including whether the basis was durable policy or recommendation-continuation confirmation.
- If Objective tracking changed, confirm it was meaningful and stayed under the selected slug.
