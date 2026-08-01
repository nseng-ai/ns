---
name: objective-next
disable-model-invocation: true
description: "Prompt factory for an active Objective: emits a decision packet ending in one proposed prompt, or an explicit decline with routing. To create a new Objective use objective-create."
---

# objective-next

A prompt factory for an active Objective: judge the next useful semantic step, then serialize it as a decision packet whose final element is a proposed prompt — or an explicit decline naming why and where to route instead.

Part of the Objective skill family. Load the `objective` umbrella skill first for shared vocabulary, Selection rules, storage model, and safety boundaries; this skill does not restate them.

## Workflow

1. Resolve exactly one Objective per the umbrella skill's Selection rules. Exclude closed Objectives by default: if `closed.md` exists, stop and say it is closed.
2. Read `objective.md`, `roadmap.md`, `orientation.md` (if present), and relevant `updates/` files directly; use `ns objective exec` for deterministic mechanics such as candidate listing, closed-marker detection, and tracking-gate git evidence. Changed-path evidence belongs only to the Tracking Gate after an Objective is selected.
3. Apply the Tracking Gate (section below).
4. Load conditional references (section below) only when their routing conditions apply.
5. If Record Frontmatter carries a `blocked:` sentence, apply `references/blocked-objectives.md` and let the unblocking counterpart Objective, if one exists, shape the recommendation.
6. Choose the smallest coherent next semantic step grounded in the Objective narrative, roadmap, active assumptions, and risks. The step may be agent-alone or human-steered; when open, unblocked candidates of both kinds exist, prefer the one that requires human intervention (grilling, prototype, live decisions, steering) — resolving human-gated questions de-risks and sharpens the Objective so the remaining work can run autonomously sooner. Deviate only when a specific hazard or dependency makes an agent-alone row clearly more urgent, and say why. On an ideation Objective, recommend from the **Frontier**: one open, unblocked Question Row (rows are unordered beyond blocking; resolve one per session). If the Frontier is empty and only ordinary execution rows remain, say the record has **crystallized** and recommend ordinary execution work instead.
7. Form a best-effort work-left estimate: if the narrative and roadmap make the remaining path clear, estimate the semantic steps remaining until Objective completion; if not, estimate the work remaining until the next discovery/decision step where additional work can be identified. Express it as step count, named slices, or coarse scope, never elapsed time.
8. Recommend only semantic Objective work; validation-only rows follow the umbrella skill's roadmap validation-rows rule.
9. If only routine validation-only non-parked rows remain, emit a Declined packet: no substantive Objective work remains. Suggest running ordinary validation outside the roadmap, then using `objective-update` to record evidence and/or `objective-close` if completion criteria are satisfied.
10. If no active or planned semantic work remains, emit a Declined packet routing to `objective-close` instead of inventing work.
11. Emit the decision packet (section below).

## Tracking Gate

Before recommending work or offering execution, run:

```sh
ns objective exec tracking-gate <slug> --format json
```

Use the JSON payload as deterministic evidence; do not hand-roll branch-base detection or shell pipelines for this gate. In particular:

- `git.trunkBranch` / `git.revisionRange` — the resolved branch-diff basis.
- `uncommitted.repository` / `uncommitted.objective` — uncommitted changes in the worktree and in the selected Objective record.
- `branchDiff.objectiveChangedPaths` — committed branch-diff changes under `.ns/objectives/<slug>/`.
- `branchDiff.materialNonObjectivePaths` — committed branch-diff changes outside that Objective record.
- `summary.*` — booleans/nulls for quick gate decisions.

Then:

1. Inspect `materialNonObjectivePaths` plus uncommitted evidence for current-branch or worktree progress that plausibly advances the selected Objective.
2. Compare with `objectiveChangedPaths` and `uncommitted.objective` to decide whether corresponding Objective tracking appears present.
3. If meaningful progress for the selected Objective appears clearly unrecorded, treat the `objective-next` request as update-and-continue preauthorization: run `objective-update` for the same selected slug/path, then reread the Objective and rerun the tracking-gate command before recommending work or offering execution.
4. If meaningful progress appears likely but evidence, Objective fit, or update scope is ambiguous, ask: `Run objective-update for <slug> now, then rerun objective-next?`
5. If the user declines or confirmation is pending, stop without a next-work recommendation or execution offer.
6. If evidence is absent or clearly unrelated, proceed silently; do not narrate gate mechanics in the decision packet.

The Tracking Gate check itself is read-only; any file changes during this phase belong only to the explicit `objective-update` workflow the gate routes into. If the tracking-gate command fails because the extension is unavailable or git evidence cannot be collected, report the failure and ask whether to proceed with a degraded manual read; do not silently fall back to ad hoc shell.

## Conditional references

- **Execution** — if the user asks to execute/advance/run work, gives a clear affirmative confirmation to a current-session recommendation, or the selected Objective/roadmap row contains `## Runner Policy`, `## Definition of Progress`, row-level `Policy:`, or equivalent execution prose, read `references/confirmed-execution.md` before interpreting execution basis or offering/running execution. It owns both execution bases (durable policy and recommendation-continuation), preview and confirmation rules, and post-execution reporting.
- **Blocked** — if Record Frontmatter carries a `blocked:` sentence, read `references/blocked-objectives.md`.
- **Ideation** — if the selected Objective is an ideation record (its roadmap is a Frontier of typed Question Rows rather than executable slices), read the `objective` skill's `references/objective-patterns.md`.

## Decision packet

The factory's terminal artifact. Use this path for ordinary `objective-next` runs, when the user only asked for advice, or when no safe execution basis exists. Emit the packet in this order — context before proposal, so the human judges with context rather than anchoring on the prompt.

The packet is a routing summary, not a briefing: everything above the proposed prompt must be scannable in seconds — target roughly eight lines total, never a wall of prose. Detail belongs in the prompt or the cited artifacts.

1. **Basis** — one or two sentences: the roadmap row or narrative grounding and the key assumption or risk the step exercises. The prompt's scope owns the sub-decisions; the basis names only the grounding.
2. **Work-left estimate** — one line.
3. **Alternatives** — one line per candidate naming it and why it lost; include only genuinely live candidates, and omit the element when none exist.
4. **Proposed prompt** — self-contained and cold-start safe: it names the scope, a starting location, and the completion evidence, so it can run unmodified in a fresh session, a dispatched subagent, or an interactive session with the human in the loop (a grilling or live-decision prompt is still a prompt).

   Presentation: precede the prompt with a horizontal rule, use the heading `## ▶ Proposed prompt — ready to run`, render the entire prompt as one Markdown blockquote, and end with another horizontal rule. Every prompt line, including blank separator lines, carries the `>` blockquote marker so the rendered left rail stays continuous. The blockquote markers and surrounding rules are presentation wrappers, not prompt content; when another instruction or tool requests the exact proposed prompt, pass the unquoted inner Markdown byte-for-byte.

   Serialization: by default the inner prompt is short structured Markdown — a one-sentence headline naming the work; an **Objective** line citing the slug, roadmap row, and key reference paths; **Scope** bullets; and **Completion evidence** bullets — plus optional labeled lines such as **Precedent** or **Constraints** when they carry real weight. No code fences. Collapse to plain sentences when the step is a single question or decision and structure would outweigh content. Cite durable artifacts — the Objective slug, the roadmap row, paths, references — rather than replicating their content; prefer pointing at a folder over enumerating its files, since the running agent can discover the rest. Self-contained means free of *conversation* context, not a briefing that restates the record. Structure is layout, not license for padding. The record's `## Prompt Guidance` and the selected row's `Prompt:` prose, when present, may augment or entirely replace this default shape (the `objective` skill's `references/prompt-guidance.md` owns their semantics); they shape serialization only, never step selection or execution permission.

   Default presentation shape:

   ```markdown
   ---

   ## ▶ Proposed prompt — ready to run

   > One-sentence headline.
   >
   > **Objective:** `<slug>`; roadmap row and starting references.
   >
   > **Scope:**
   >
   > - Bounded work.
   >
   > **Completion evidence:**
   >
   > - Required evidence.

   ---
   ```

Default to exactly one proposed prompt. When two or more open candidates are genuinely co-equal — defensibly different directions rather than a ranked list where one clearly won — element 4 may instead present a small labeled set, each prompt self-contained under the same rules, with element 3 saying what picking each one commits to. Confirmation selects exactly one; a set is never authorization to run more than one.

When the correct next move is not promptable work, the factory declines instead of prompting: element 4 becomes **Declined** with the reason and routing — run `objective-update` first, advance counterpart `<slug>`, the external gate must clear, or the Objective looks ready for `objective-close`. A decline is a valid packet, not a failure.

In every packet, mutate no files except through an explicit `objective-update` handoff.

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
- Confirm the decision packet ends with either a proposed prompt or an explicit Declined element, and that a proposed prompt is self-contained: a cold session could run it without this conversation. Confirm it stayed short, citing durable artifacts rather than replicating them, and that it used the default structured shape or a sanctioned deviation (record/row prompt guidance, or a degenerate single-question step).
- Confirm everything above the proposed prompt honored the brevity budget: no off-ramps menu, no tracking-gate narration, no multi-sentence basis enumeration.
- If the record is blocked, confirm the response named the Blocked Sentence and either the unblocking counterpart Objective or why no edge counterpart applies.
- If recommendation-only or steer-first, ensure no files changed except through an explicit `objective-update` handoff; report any handoff output separately and confirm it stayed under the selected slug.
- If confirmed execution ran, verify and report according to `references/confirmed-execution.md`, including whether the basis was durable policy or recommendation-continuation confirmation.
- If Objective tracking changed, confirm it was meaningful and stayed under the selected slug.
