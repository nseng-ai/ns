---
name: objective-next
description: "Command: objective-next"
---

# objective-next

Recommend the next useful work for an active Objective and, when explicit Objective policy allows it, offer confirmed execution. If stale tracking blocks the recommendation, request an explicit `objective-update` handoff for the same Objective before continuing.

For shared vocabulary and system-wide rules, use the `objective` skill when available; this command remains self-contained.

## Required shape

Active root: `.asdl/objectives/<slug>/`. Archived records under `.asdl/objective-archive/<slug>/` are not active work candidates.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; optional `## Definition of Progress` and `## Runner Policy`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only; semantic rows may include indented `Policy:` and `Evidence:` prose.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read `objective.md`, `roadmap.md`, and `updates/` directly. Use `objective exec` for deterministic mechanics like candidate listing, file inventory, and closed-marker detection.

The Objective slug directory is durable identity. Command/product/prose renames do not imply an Objective slug rename.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If the selected path is under `.asdl/objective-archive/`, stop and ask whether to unarchive before recommending next work.
3. If no slug or path is explicit, run `objective list --format md` to enumerate active checkout-local open candidates and ask the user to choose.
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

## Policy reading

After the Tracking Gate passes, inspect Objective prose before choosing an output path:

- Read optional top-level `## Definition of Progress` and `## Runner Policy` sections, or equivalent explicit prose that says when `objective-next` may execute after preview.
- Inspect the selected roadmap row and its immediate indented notes for row-level `Policy:` and `Evidence:` guidance.
- Treat policy as prose, not schema. Do not add YAML/frontmatter, UUIDs, hidden state, queues, ledgers, task databases, or lifecycle states.
- Row-level policy may override Objective-level defaults for the selected slice, for example `Policy: direct execution after preview` or `Policy: steer first`.
- Do not infer execution permission from a concrete roadmap row, obvious implementation step, or the mere existence of a `## Runner Policy` heading alone. The policy must explicitly allow direct execution for the selected slice.
- Do not describe every execution-friendly Objective as autonomous. Autonomy-designed behavior requires stronger policy/rubric support; ordinary execution-friendly Objectives may still be human-assisted.

## Workflow

1. Exclude closed Objectives by default. If `closed.md` exists, stop and say it is closed.
2. Read `objective.md`, `roadmap.md`, and relevant `updates/` files.
3. Apply the Tracking Gate. If it triggers and the user confirms or preauthorized update-and-continue, perform the `objective-update` handoff for this same Objective, then restart from step 2 with refreshed files/evidence.
4. Choose the smallest coherent next semantic step grounded in the Objective narrative, roadmap, active assumptions, risks, and policy.
5. Recommend only semantic Objective work; do not select generic validation-only rows such as `just`, tests, waiting for CI, or full repo validation unless validation/test/CI behavior or a non-routine validation investigation is itself the deliverable.
6. If only routine validation-only non-parked rows remain, say no substantive Objective work remains. Suggest running ordinary validation outside the roadmap, then using `objective-update` to record evidence and/or `objective-close` if completion criteria are satisfied.
7. Otherwise, follow one of the output paths below.
8. If no active or planned semantic work remains, say the Objective may be ready for `objective-close` instead of inventing work.

## Output paths

### Recommend-only

Use this path when no explicit execution policy exists, policy is stale/incomplete, policy does not allow direct execution for the selected slice, or the user only asked for advice.

- Recommend the next useful semantic step.
- Explain the narrative or roadmap basis, likely files/areas, active assumption or risk exercised, and completion evidence to record afterward.
- If policy is missing or incomplete, include a concise policy-upgrade note: adding durable `## Definition of Progress` and `## Runner Policy` prose enables future execution offers.
- Do not offer a one-time confirmation that bypasses missing durable policy.
- Do not mutate files except through an explicit `objective-update` handoff.

### Steer-first

Use this path when Objective policy or row-level notes say human judgment, planning, terminology, scope choice, or risk acceptance is needed before execution.

- Ask one concrete next question, or recommend a planning/grilling/readback step.
- Quote or summarize the policy basis for steering first.
- Do not execute or mutate files except through an explicit `objective-update` handoff.

### Execution-offer

Use this path only when explicit Objective or row-level prose policy allows direct execution for the selected slice.

Present an inline execution preview and wait for explicit affirmative confirmation before any material action. Material actions include editing files, creating/moving branches, launching runner subagents, running write-capable external commands, committing, or submitting PRs.

The preview must include:

- selected Objective slug;
- policy basis: quote or summarize the Runner Policy and any row-level `Policy:` that permits execution;
- bounded scope/slice;
- inline plan and likely files or areas;
- materialization shape, defaulting to local edits unless branch/commit creation was explicitly requested; if branch creation is in scope in this repo, consult the Graphite skill first;
- validation expected before keeping work;
- external access and side effects, with external side effects out of scope unless explicit policy or confirmation includes them;
- stop/ask conditions;
- Objective tracking expectations;
- PR submission status, defaulting to `PR submission is out of scope for this launch.`

If the user changes scope, revise the preview and ask again. Proceed only after explicit confirmation of the latest preview.

## Confirmed execution rules

- Run within the confirmed scope only.
- Use optional runner subagents at most one at a time, in the current worktree, with complete prompts and parent verification of results.
- Keep work only when it is evidenced against `## Definition of Progress` or equivalent progress criteria and passes appropriate validation.
- Discard ambiguous, speculative, or out-of-scope changes instead of preserving them as run artifacts.
- Write Objective tracking only for meaningful progress, changed assumptions, invalidated assumptions, reusable findings, changed roadmap/policy guidance, or other durable Objective impact under the selected slug.
- Do not write ceremonial run logs, hidden ledgers, task files, private queues, Branch Memory run state, or alternate Objective stores.
- Do not submit PRs unless PR submission is explicitly included in the confirmed preview.

## Stop / ask

- Objective selection is ambiguous or absent.
- The selected path is under `.asdl/objective-archive/`; ask whether to unarchive before recommending next work.
- The selected Objective is closed.
- The Tracking Gate finds likely unrecorded material progress and confirmation to run `objective-update` is pending or declined.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `objective-update`.
- Execution policy is ambiguous for the selected slice; recommend or steer instead of executing.
- The requested execution would exceed policy, preview scope, validation boundaries, or side-effect permissions.

## Verify

- Name the selected slug and identify the roadmap item or narrative basis for the recommendation, steering question, or execution preview.
- If recommendation-only or steer-first, ensure no files changed except through an explicit `objective-update` handoff; report any handoff output separately and confirm it stayed under the selected slug.
- If confirmed execution ran, report changed files, materialization shape, validation performed, Objective tracking changes, PR submission status, and confirm all changes stayed within the confirmed scope.
- If Objective tracking changed, confirm it was meaningful and stayed under the selected slug.
