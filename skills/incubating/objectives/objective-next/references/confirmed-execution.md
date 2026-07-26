# Confirmed Execution

Load this reference after selecting and reading an Objective when the user asks to execute/advance/run work, gives a clear affirmative confirmation to a current-session recommendation, or when the selected Objective or roadmap row contains `## Runner Policy`, `## Definition of Progress`, row-level `Policy:`, or equivalent execution prose.

Read the `objective` skill's execution policy reference first when shared policy concepts are unclear.

## Execution basis

After the Tracking Gate passes, execution may proceed from either basis below.

### Durable policy basis

- Read optional top-level `## Definition of Progress` and `## Runner Policy` sections, or equivalent explicit prose that says when `objective-next` may execute after preview.
- Inspect the selected roadmap row and immediate indented notes for row-level `Policy:` and `Evidence:` guidance.
- Treat policy as prose, not schema. Do not add YAML/frontmatter (execution policy never lives in Record Frontmatter, whose only sanctioned keys are `blocked` and `edges`), UUIDs, hidden state, queues, ledgers, task databases, automation registries, or lifecycle states.
- Row-level policy may override Objective-level defaults for the selected slice.
- Do not infer durable execution permission from a concrete roadmap row, obvious implementation step, or the mere existence of a `## Runner Policy` heading alone.
- Do not describe every execution-friendly Objective as autonomous.

### Recommendation-continuation basis

Durable policy is not required when the user explicitly asks to execute a concrete `objective-next` recommendation that is still in the current conversation.

Use this basis only when all are true:

- the previous `objective-next` response selected the same Objective slug;
- it proposed one coherent next semantic step, or a small labeled set of co-equal candidates from which the user's confirmation selected exactly one — not a grab bag;
- it named enough scope, likely areas, and completion evidence to bound execution;
- the current user turn is a clear affirmative confirmation to execute that recommendation;
- the work can stay within local repository edits, local validation, and meaningful Objective tracking unless the user separately requested branch/commit/PR/external writes.

This basis is not durable Objective state. It lets the current session continue from its own recommendation; it does not cause future sessions to proactively offer execution.

## Output path selection

### Decision packet

The default path: ordinary runs, advice-only requests, and every case where no execution basis exists — durable policy is stale/incomplete, recommendation-continuation conditions are not met, or policy does not allow direct execution for the selected slice.

The `objective-next` skill's `## Decision packet` section owns the packet's shape and ordering; do not restate it here.

- If execution was requested but neither durable policy nor recommendation-continuation basis makes execution safe, say what information or confirmation is missing. Mention durable `## Definition of Progress` / `## Runner Policy` only when future sessions should proactively offer execution for this Objective.
- Do not mutate files except through an explicit `objective-update` handoff.

### Steer-first

Use when Objective policy or row-level notes say human judgment, planning, terminology, scope choice, or risk acceptance is needed before execution.

- Ask one concrete next question, or recommend a planning/grilling/readback step.
- Include a best-effort work-left estimate to the steering/discovery point where additional work can be identified; if the path to completion is already clear, estimate remaining semantic steps/slices until completion instead. Do not estimate calendar time.
- Quote or summarize the policy basis for steering first.
- Do not execute or mutate files except through an explicit `objective-update` handoff.

### Execution-offer

Use when explicit Objective or row-level prose policy allows direct execution for the selected slice, or when the recommendation-continuation basis is satisfied.

For durable-policy execution, present an inline execution preview and wait for explicit affirmative confirmation before any material action. For recommendation-continuation execution, the user's clear affirmative confirmation may serve as that confirmation when the prior recommendation already bounded the selected slug, coherent slice, likely scope, and completion evidence; if not, present a fresh preview and ask. Material actions include editing files, creating/moving branches, launching runner subagents, running write-capable external commands, committing, or submitting PRs.

The preview must include:

- selected Objective slug;
- execution basis: quote or summarize the Runner Policy / row-level `Policy:` that permits execution, or summarize the prior recommendation plus the user's direct confirmation;
- bounded scope/slice;
- inline plan and likely files or areas;
- best-effort work-left estimate, either remaining semantic steps/slices until Objective completion or remaining work until the next discovery/decision point; do not estimate calendar time;
- how the work will be left, defaulting to local edits unless branch/commit creation was explicitly requested;
- validation expected before keeping work;
- external systems or write-capable actions, with PR submission, publishing, deployment, and write APIs out of scope unless explicit policy or confirmation includes them;
- stop/ask conditions;
- Objective tracking expectations;
- PR submission status, defaulting to `PR submission is out of scope for this launch.`

If the user changes scope, revise the preview and ask again. Proceed only after explicit confirmation of the latest preview.

## Confirmed execution rules

- Run within the confirmed scope only.
- Use optional runner subagents at most one at a time, in the current worktree, with complete prompts and parent verification of results.
- If branch creation, commit amendment, restacking, or submission is in scope, follow the repository's documented Git/Graphite workflow. An internal repository may optionally route those mechanics through its own source-control skill; Objective execution does not require one.
- Keep work only when it is evidenced against `## Definition of Progress`, the prior recommendation's completion evidence, or equivalent progress criteria and passes appropriate validation.
- Discard ambiguous, speculative, or out-of-scope changes instead of preserving them as run artifacts.
- Write Objective tracking only for meaningful progress, changed assumptions, invalidated assumptions, reusable findings, changed roadmap/policy guidance, or other durable Objective impact under the selected slug.
- Do not write ceremonial run logs, hidden ledgers, task files, private queues, Branch Memory run state, or alternate Objective stores.
- Do not submit PRs unless PR submission is explicitly included in the confirmed preview.

## Reporting after confirmed execution

Report:

- changed files;
- how the work was left;
- validation performed or skipped with justification;
- Objective tracking changes;
- execution basis (durable policy or recommendation-continuation confirmation);
- PR submission status;
- confirmation that all kept changes stayed within the confirmed scope.
