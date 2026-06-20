---
name: objective-next
description: "Recommend the next useful work for an active Objective. Use when asking what to do next on an existing Objective: 'what's next on this objective', 'recommend next work', 'next step for objective X'. Recommend-first and read-only by default; may route to confirmed objective-update for stale tracking or confirmed execution when durable Objective policy allows it. To create a new Objective use objective-create."
---

# objective-next

Recommend the next useful work for an active Objective. When explicit Objective policy allows it, or when the user explicitly asks to execute a concrete `objective-next` recommendation from the current conversation, route to confirmed-execution guidance. If stale tracking blocks the recommendation, request an explicit `objective-update` handoff for the same Objective before continuing. Always include a best-effort work-left estimate as remaining semantic steps, not calendar time.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this step remains self-contained for its own happy path.

## Required shape

Active root: `.sdl/objectives/<slug>/`. Archived records under `.sdl/objective-archive/<slug>/` are not active work candidates.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; optional execution policy; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only; semantic rows may include indented prose guidance.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read `objective.md`, `roadmap.md`, and `updates/` directly. Use `objective exec` for deterministic mechanics like candidate listing, file inventory, and closed-marker detection.

The Objective slug directory is durable identity. Command/product/prose renames do not imply an Objective slug rename.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.sdl/objectives/<slug>/`.
2. If the selected path is under `.sdl/objective-archive/`, stop and ask whether to unarchive before recommending next work.
3. If no slug or path is explicit, run `objective list --minimal --format md` to enumerate active checkout-local open candidates and ask the user to choose.
4. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms. Changed-path evidence belongs only to the Tracking Gate after an Objective is selected.

## Tracking Gate

Before recommending work or offering execution:

1. Inspect uncommitted changes and branch diff when available.
2. Look for material non-Objective changes that plausibly advance the selected Objective.
3. Look for corresponding changes under `.sdl/objectives/<slug>/`.
4. If meaningful progress appears likely but unrecorded, ask: `Run objective-update for <slug> now, then rerun objective-next?`
5. If the user confirms, or has explicitly preauthorized update-and-continue, run `objective-update` for the same selected slug/path, then reread Objective and repo evidence and re-apply this gate before recommending work or offering execution.
6. If the user declines or confirmation is pending, stop without a next-work recommendation or execution offer.
7. If evidence is absent, ambiguous, or clearly unrelated, proceed with a concise note.

The Tracking Gate itself is read-only. Any file changes during this phase belong only to the explicit `objective-update` handoff.

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
2. Read `objective.md`, `roadmap.md`, and relevant `updates/` files.
3. Apply the Tracking Gate. If it triggers and the user confirms or preauthorized update-and-continue, perform the `objective-update` handoff for this same Objective, then restart from step 2 with refreshed files/evidence.
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
- The Tracking Gate finds likely unrecorded material progress and confirmation to run `objective-update` is pending or declined.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `objective-update`.
- Execution basis is relevant but ambiguous for the selected slice; load `references/confirmed-execution.md` and recommend or steer instead of executing.
- Requested execution would exceed durable policy, recommendation-continuation scope, preview scope, validation boundaries, or permissions for external systems / write-capable actions.

## Verify

- Name the selected slug and identify the roadmap item or narrative basis for the recommendation, steering question, or execution preview.
- If recommendation-only or steer-first, ensure no files changed except through an explicit `objective-update` handoff; report any handoff output separately and confirm it stayed under the selected slug.
- If confirmed execution ran, verify and report according to `references/confirmed-execution.md`, including whether the basis was durable policy or recommendation-continuation confirmation.
- If Objective tracking changed, confirm it was meaningful and stayed under the selected slug.
