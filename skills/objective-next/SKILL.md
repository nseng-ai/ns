---
name: objective-next
description: "Command: objective-next"
---

# objective-next

Recommend the next useful work for an active Objective. When explicit Objective policy allows it, route to confirmed-execution guidance before offering execution. If stale tracking blocks the recommendation, request an explicit `objective-update` handoff for the same Objective before continuing. Always include a best-effort work-left estimate as remaining semantic steps, not calendar time.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this step remains self-contained for its own happy path.

## Required shape

Active root: `.asdl/objectives/<slug>/`. Archived records under `.asdl/objective-archive/<slug>/` are not active work candidates.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; optional execution policy; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only; semantic rows may include indented prose guidance.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read `objective.md`, `roadmap.md`, and `updates/` directly. Use `objective exec` for deterministic mechanics like candidate listing, file inventory, and closed-marker detection.

The Objective slug directory is durable identity. Command/product/prose renames do not imply an Objective slug rename.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If the selected path is under `.asdl/objective-archive/`, stop and ask whether to unarchive before recommending next work.
3. If no slug or path is explicit, run `objective list --minimal --format md` to enumerate active checkout-local open candidates and ask the user to choose.
4. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms. Changed-path evidence belongs only to the Tracking Gate after an Objective is selected.

## Tracking Gate

Before recommending work or offering execution:

1. Inspect uncommitted changes and branch diff when available.
2. Look for material non-Objective changes that plausibly advance the selected Objective.
3. Look for corresponding changes under `.asdl/objectives/<slug>/`.
4. If meaningful progress appears likely but unrecorded, ask: `Run objective-update for <slug> now, then rerun objective-next?`
5. If the user confirms, or has explicitly preauthorized update-and-continue, run `objective-update` for the same selected slug/path, then reread Objective and repo evidence and re-apply this gate before recommending work or offering execution.
6. If the user declines or confirmation is pending, stop without a next-work recommendation or execution offer.
7. If evidence is absent, ambiguous, or clearly unrelated, proceed with a concise note.

The Tracking Gate itself is read-only. Any file changes during this phase belong only to the explicit `objective-update` handoff.

## Conditional references

After selecting and reading the Objective, if the user asks to execute/advance/run work, or if the selected Objective/roadmap row contains `## Runner Policy`, `## Definition of Progress`, row-level `Policy:`, or equivalent execution prose, read `references/confirmed-execution.md` before interpreting policy or offering execution.

Normal next-work recommendations do not require loading confirmed-execution guidance.

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

Use this path for ordinary `objective-next` recommendations, when the user only asked for advice, or when no durable policy permits direct execution.

- Recommend the next useful semantic step.
- Explain the narrative or roadmap basis, likely files/areas, active assumption or risk exercised, and completion evidence to record afterward.
- Include a best-effort work-left estimate: either remaining semantic steps/slices until Objective completion, or remaining work until the next discovery/decision step that will reveal additional work. Do not estimate calendar time.
- If execution was requested but policy is missing or incomplete, include a concise policy-upgrade note: adding durable `## Definition of Progress` and `## Runner Policy` prose enables future execution offers.
- Do not offer a one-time confirmation that bypasses missing durable policy.
- Do not mutate files except through an explicit `objective-update` handoff.

## Stop / ask

- Objective selection is ambiguous or absent.
- The selected path is under `.asdl/objective-archive/`; ask whether to unarchive before recommending next work.
- The selected Objective is closed.
- The Tracking Gate finds likely unrecorded material progress and confirmation to run `objective-update` is pending or declined.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `objective-update`.
- Execution policy is relevant but ambiguous for the selected slice; load `references/confirmed-execution.md` and recommend or steer instead of executing.
- Requested execution would exceed durable policy, preview scope, validation boundaries, or permissions for external systems / write-capable actions.

## Verify

- Name the selected slug and identify the roadmap item or narrative basis for the recommendation, steering question, or execution preview.
- If recommendation-only or steer-first, ensure no files changed except through an explicit `objective-update` handoff; report any handoff output separately and confirm it stayed under the selected slug.
- If confirmed execution ran, verify and report according to `references/confirmed-execution.md`.
- If Objective tracking changed, confirm it was meaningful and stayed under the selected slug.
