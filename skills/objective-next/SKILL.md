---
name: objective-next
disable-model-invocation: true
description: "Prompt factory for an active Objective: emits a decision packet ending in the next proposed prompt, or an explicit decline with routing. Routes stale tracking through objective-update before continuing, and may route to confirmed execution when durable Objective policy allows it. To create a new Objective use objective-create."
---

# objective-next

A prompt factory for an active Objective: judge the next useful semantic step, then serialize it as a decision packet whose final element is a proposed prompt — or an explicit decline naming why and where to route instead. The sections below own gating, routing, and execution behavior.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, safety boundaries, and family policy.

## Resolve the Objective

Resolve exactly one Objective per the umbrella skill's Selection rules; the umbrella also owns the storage model and required file shapes — this skill does not restate them. Read `objective.md`, `roadmap.md`, and `updates/` directly; use `ns objective exec` for deterministic mechanics like candidate listing, closed-marker detection, and tracking-gate git evidence. Changed-path evidence belongs only to the Tracking Gate after an Objective is selected.

## Tracking Gate

Before recommending work or offering execution, run:

```sh
ns objective exec tracking-gate <slug> --format json
```

Use the JSON payload as deterministic evidence; do not hand-roll branch-base detection or shell pipelines for this gate. In particular:

- `git.trunkBranch` and `git.revisionRange` are the resolved branch-diff basis.
- `uncommitted.repository` reports whether the worktree has uncommitted changes.
- `uncommitted.objective` reports whether the selected Objective record has uncommitted changes.
- `branchDiff.objectiveChangedPaths` reports committed branch-diff changes under `.ns/objectives/<slug>/`.
- `branchDiff.materialNonObjectivePaths` reports committed branch-diff changes outside that Objective record.
- `summary.*` gives booleans/nulls for quick gate decisions.

Then:

1. Inspect `materialNonObjectivePaths` plus uncommitted evidence for current-branch or worktree progress that plausibly advances the selected Objective.
2. Compare with `objectiveChangedPaths` and `uncommitted.objective` to decide whether corresponding Objective tracking appears present.
3. If meaningful current-branch or worktree progress for the selected Objective appears clearly unrecorded, treat the `objective-next` request as update-and-continue preauthorization: run `objective-update` for the same selected slug/path, then reread Objective and rerun `ns objective exec tracking-gate <slug> --format json` before recommending work or offering execution.
4. If meaningful progress appears likely but evidence, Objective fit, or update scope is ambiguous, ask: `Run objective-update for <slug> now, then rerun objective-next?`
5. If the user declines or confirmation is pending, stop without a next-work recommendation or execution offer.
6. If evidence is absent or clearly unrelated, proceed with a concise note that names the resolved diff basis (for example `master...HEAD`) and whether material non-Objective paths were present.

The Tracking Gate check itself is read-only. Any file changes during this phase belong only to the explicit `objective-update` workflow that the gate routes into. If the tracking-gate command itself fails because the extension is unavailable or the git evidence cannot be collected, report the failure and ask whether to proceed with a degraded manual read; do not silently fall back to ad hoc shell.

## Blocked Objectives

A `blocked:` sentence in Record Frontmatter means the record is blocked, not closed (semantics: the umbrella skill); it is neither a reason to stop nor something to ignore.

1. Read the Blocked Sentence and the record's `edges:` entries. Edges are mirrored and kind-less; direction and causality live only in the Edge Annotation prose.
2. Judge which edge counterpart, if any, the Blocked Sentence points at. If one plausibly does, read that counterpart's `objective.md` and `roadmap.md` enough to name the concrete work that would unblock the selected Objective.
3. Shape the recommendation with judgment rather than a fixed rule:
   - If a counterpart Objective would unblock this one, recommend advancing it — name the counterpart slug and the specific unblocking step — alongside any work within the selected Objective the blocker does not gate.
   - If the blocker is external and no counterpart applies, say so, and recommend only non-gated work or state that no useful work remains until the gate clears.
   - If evidence shows the Blocked Sentence is stale (the blocker already satisfied), route through the `objective-update` workflow for the selected Objective to clear it, then continue.
4. Execution paths stay scoped to the selected slug. To execute unblocking work under a counterpart Objective, restart Objective resolution with that counterpart as the explicit selection; do not silently switch Objectives mid-flow.

## Conditional references

After selecting and reading the Objective, if the user asks to execute/advance/run work, gives a clear affirmative confirmation to a current-session recommendation, or if the selected Objective/roadmap row contains `## Runner Policy`, `## Definition of Progress`, row-level `Policy:`, or equivalent execution prose, read `references/confirmed-execution.md` before interpreting execution basis or offering/running execution.

If the selected Objective is an ideation record — its roadmap is a Frontier of typed Question Rows rather than executable slices — read the `objective` skill's Objective patterns reference (`references/objective-patterns.md`).

## Recommendation-continuation execution

A durable `## Runner Policy` is not required when the user explicitly asks to execute a concrete `objective-next` recommendation that is still in the current conversation. A decision packet's proposed prompt, confirmed by the user, is the canonical form of this basis: the prompt already carries the bounded scope, a starting location, and the completion evidence the conditions below require.

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
3. Apply the Tracking Gate (section above).
4. Load conditional references only when their routing conditions apply.
5. If Record Frontmatter carries a `blocked:` sentence, apply the Blocked Objectives guidance: traverse the record's edges to find the counterpart Objective that would unblock it, if one exists, and let that shape the recommendation.
6. Choose the smallest coherent next semantic step grounded in the Objective narrative, roadmap, active assumptions, and risks. The step may be agent-alone or human-steered; when open, unblocked candidates of both kinds exist, prefer the one that requires human intervention (grilling, prototype, live decisions, steering) — resolving human-gated questions de-risks and sharpens the Objective so the remaining work can run autonomously sooner. Deviate only when a specific hazard or dependency makes an agent-alone row clearly more urgent, and say why. On an ideation Objective, recommend from the **Frontier**: one open, unblocked Question Row (rows are unordered beyond blocking; resolve one per session). If the Frontier is empty and only ordinary execution rows remain, say the record has **crystallized** and recommend ordinary execution work instead.
7. Form a best-effort work-left estimate: if the Objective narrative and roadmap make the remaining path clear, estimate the semantic steps remaining until Objective completion; if not, estimate the work remaining until the next discovery/decision step where additional work can be identified. Express this as step count, named slices, or coarse scope, not elapsed time.
8. Recommend only semantic Objective work; validation-only rows follow the umbrella skill's roadmap validation-rows rule.
9. If only routine validation-only non-parked rows remain, emit a Declined packet: no substantive Objective work remains. Suggest running ordinary validation outside the roadmap, then using `objective-update` to record evidence and/or `objective-close` if completion criteria are satisfied.
10. If no active or planned semantic work remains, emit a Declined packet routing to `objective-close` instead of inventing work.

## Decision packet

The factory's terminal artifact. Use this path for ordinary `objective-next` runs, when the user only asked for advice, or when no safe execution basis exists. Emit the packet in this order — context before proposal, so the human judges with context rather than anchoring on the prompt:

1. **Basis** — the roadmap row or narrative grounding, and the active assumption or risk the step exercises.
2. **Work-left estimate** — the step-7 estimate.
3. **Alternatives** — other open, unblocked candidates and why they lost to the proposed step.
4. **Off-ramps** — what confirming, steering, deferring, or picking an alternative each means.
5. **Proposed prompt** — a few sentences, self-contained and cold-start safe: it names the scope, a starting location, and the completion evidence, so it can run unmodified in a fresh session, a dispatched subagent, or an interactive session with the human in the loop (a grilling or live-decision prompt is still a prompt). Remember that agents can discover things on their own. For example, prefer listing a single folder to a list of files within that folder. Keep it minimal. Cite durable artifacts — the Objective slug, the roadmap row, paths, references — rather than replicating their content. Self-contained means free of *conversation* context, not a briefing that restates the record. Incorporate the record's `## Prompt Guidance` and the selected row's `Prompt:` prose when present (the `objective` skill's `references/prompt-guidance.md` owns their semantics); they shape serialization only, never step selection or execution permission.

Default to exactly one proposed prompt. When two or more open candidates are genuinely co-equal — defensibly different directions rather than a ranked list where one clearly won — element 5 may instead present a small labeled set, each prompt self-contained under the same rules, with element 3 saying what picking each one commits to. Confirmation selects exactly one; a set is never authorization to run more than one.

When the correct next move is not promptable work, the factory declines instead of prompting: element 5 becomes **Declined** with the reason and routing — run `objective-update` first, advance counterpart `<slug>`, the external gate must clear, or the Objective looks ready for `objective-close`. A decline is a valid packet, not a failure.

In every packet:

- If execution was requested but neither durable policy nor recommendation-continuation basis makes execution safe, say what information or confirmation is missing. Mention durable `## Definition of Progress` / `## Runner Policy` only when future sessions should proactively offer execution for this Objective.
- Do not mutate files except through an explicit `objective-update` handoff.

## Stop / ask

- Objective selection is ambiguous or absent.
- The selected path is outside `.ns/objectives/<slug>/`; ask for an active Objective slug or path before recommending next work.
- The selected Objective is closed.
- The Tracking Gate finds likely unrecorded material progress but evidence, Objective fit, or update scope is ambiguous and confirmation to run `objective-update` is pending or declined.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `objective-update`.
- Execution basis is relevant but ambiguous for the selected slice; load `references/confirmed-execution.md` and recommend or steer instead of executing.
- Requested execution would advance work the Blocked Sentence clearly gates; steer toward the unblocking counterpart Objective or the external gate instead.
- Requested execution would exceed durable policy, recommendation-continuation scope, preview scope, validation boundaries, or permissions for external systems / write-capable actions.

## Verify

- Name the selected slug and identify the roadmap item or narrative basis for the packet, steering question, or execution preview.
- Confirm the decision packet ends with either a proposed prompt or an explicit Declined element, and that a proposed prompt is self-contained: a cold session could run it without this conversation. Confirm it stayed short, citing durable artifacts rather than replicating them.
- If the record is blocked, confirm the response named the Blocked Sentence and either the unblocking counterpart Objective or why no edge counterpart applies.
- If recommendation-only or steer-first, ensure no files changed except through an explicit `objective-update` handoff; report any handoff output separately and confirm it stayed under the selected slug.
- If confirmed execution ran, verify and report according to `references/confirmed-execution.md`, including whether the basis was durable policy or recommendation-continuation confirmation.
- If Objective tracking changed, confirm it was meaningful and stayed under the selected slug.
