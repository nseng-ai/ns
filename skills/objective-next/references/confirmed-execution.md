# Confirmed Execution

Load this reference after selecting and reading an Objective when the user asks to execute/advance/run work, or when the selected Objective or roadmap row contains `## Runner Policy`, `## Definition of Progress`, row-level `Policy:`, or equivalent execution prose.

Read the `objective` skill's execution policy reference first when shared policy concepts are unclear.

## Policy reading

After the Tracking Gate passes:

- Read optional top-level `## Definition of Progress` and `## Runner Policy` sections, or equivalent explicit prose that says when `objective-next` may execute after preview.
- Inspect the selected roadmap row and immediate indented notes for row-level `Policy:` and `Evidence:` guidance.
- Treat policy as prose, not schema. Do not add YAML/frontmatter, UUIDs, hidden state, queues, ledgers, task databases, automation registries, or lifecycle states.
- Row-level policy may override Objective-level defaults for the selected slice.
- Do not infer execution permission from a concrete roadmap row, obvious implementation step, or the mere existence of a `## Runner Policy` heading alone.
- Do not describe every execution-friendly Objective as autonomous.

## Output path selection

### Recommend-only

Use when no explicit execution policy exists, policy is stale/incomplete, policy does not allow direct execution for the selected slice, or the user only asked for advice.

- Recommend the next useful semantic step.
- Explain the narrative or roadmap basis, likely files/areas, active assumption or risk exercised, and completion evidence to record afterward.
- If policy is missing or incomplete and execution was requested, include a concise policy-upgrade note: adding durable `## Definition of Progress` and `## Runner Policy` prose enables future execution offers.
- Do not offer a one-time confirmation that bypasses missing durable policy.
- Do not mutate files except through an explicit `objective-update` handoff.

### Steer-first

Use when Objective policy or row-level notes say human judgment, planning, terminology, scope choice, or risk acceptance is needed before execution.

- Ask one concrete next question, or recommend a planning/grilling/readback step.
- Quote or summarize the policy basis for steering first.
- Do not execute or mutate files except through an explicit `objective-update` handoff.

### Execution-offer

Use only when explicit Objective or row-level prose policy allows direct execution for the selected slice.

Present an inline execution preview and wait for explicit affirmative confirmation before any material action. Material actions include editing files, creating/moving branches, launching runner subagents, running write-capable external commands, committing, or submitting PRs.

The preview must include:

- selected Objective slug;
- policy basis: quote or summarize the Runner Policy and row-level `Policy:` that permits execution;
- bounded scope/slice;
- inline plan and likely files or areas;
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
- If branch creation, commit amendment, restacking, or submission is in scope in this repo, consult the Graphite skill first.
- Keep work only when it is evidenced against `## Definition of Progress` or equivalent progress criteria and passes appropriate validation.
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
- PR submission status;
- confirmation that all kept changes stayed within the confirmed scope.
