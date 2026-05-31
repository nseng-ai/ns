---
name: proto-objective-impl
description: "Implement one selected asdl Objective through the prototype Objective runner. Use when a user or /proto:objective-impl wrapper asks for a bounded Objective implementation pass."
metadata:
  internal: true
---

# Proto Objective Implementation Runner

<!-- INTERNAL SKILL: prototype-only Objective runner guidance. -->

Use this skill to run one bounded implementation launch for exactly one
selected asdl Objective. This is the v1 prototype runner contract from
`docs/pi/perpetual-objectives-and-runners.md`; it must preserve the
boundary between the Objective record and the runner harness.

This skill is not the canonical Objective system. Do not change
`/objective:*` behavior, Objective lifecycle states, or Objective file
schema as part of invoking it.

## Core invariants

- Work on exactly one selected Objective per invocation.
- Treat the Objective as durable narrative context, not as a workflow
  program or hidden task queue.
- Do not use Branch Memory (`brmem`) for plans, run state, ledgers, or
  handoffs.
- Do not create hidden run ledgers, task files, private queues, or
  alternate Objective state stores.
- Durable state is limited to kept repo changes and meaningful Objective
  tracking updates.
- Run only within an upfront preview explicitly confirmed by the human.
- Default to no PR submission. Submit only when submission is included in
  the confirmed preview.

## Resolve the Objective

1. Accept an explicit slug from the user or wrapper when present.
2. Normalize Objective paths to slugs:
   - `.asdl/objectives/<slug>` -> `<slug>`
   - `.asdl/objectives/<slug>/` -> `<slug>`
3. If no explicit Objective was supplied, do not infer one from branch
   name, changed files, or recent conversation. Run:

   ```bash
   objective list --format md
   ```

   Show the open candidates and ask the user to choose before doing
   implementation work.
4. Stop if `.asdl/objectives/<slug>/closed.md` exists.
5. Stop if `objective.md` or `roadmap.md` for the selected Objective is
   missing.

## Compact context before planning

Before planning, write a concise in-session compaction of the current
context. Include:

- the selected Objective and any explicit launch request;
- relevant user constraints and scope limits;
- known changed files or branch state;
- stale context to ignore;
- durable artifacts to inspect instead of copying large text.

Do not save this compaction to a file. It is temporary context for the
current launch.

## Inspect before proposing work

Read the selected Objective records:

- `.asdl/objectives/<slug>/objective.md`
- `.asdl/objectives/<slug>/roadmap.md`
- relevant files under `.asdl/objectives/<slug>/updates/`

Then inspect repo state and relevant surfaces:

- `git status --short`
- current branch name;
- relevant diffs, source files, docs, tests, skills, or Pi extension
  files for the likely slice.

If material implementation progress is already present but not reflected
in Objective tracking, stop and ask the user whether to record that first.
Do not write ceremonial tracking just because a launch starts.

## Determine operating mode

Classify the selected Objective after reading its prose.

### Autonomy-designed mode

Use autonomy-designed mode only when optional prose sections make that
intent clear. Look for all of these, in substance:

- a top-level `## North Star` section;
- a top-level `## Runner Policy`, `## Runner Guidance`, or
  `## Runner Contract` section, or a runner-like subsection that clearly
  says the Objective is designed for autonomous pursuit;
- a runner-policy section with boundaries for launch shape,
  materialization, external access, and when to ask;
- a `## Definition of Progress` or equivalent rubric with evidence for
  what should be kept;
- load-bearing assumptions in the ordinary Objective sections.

The signal is prose, not a permission bit. If the sections are missing,
ambiguous, or merely aspirational, do not assume autonomy.

### Human-assisted mode

Use human-assisted mode for all other Objectives. The runner may still
help, but the confirmed preview must carry enough human-authored
specificity to make the pass bounded and safe.

## Present an upfront preview

Before any material action, present a concise preview and wait for an
explicit affirmative confirmation. Material actions include editing files,
creating or moving branches, launching runner subagents, running write-capable
external commands, committing, or submitting PRs.

The preview must include:

- selected Objective slug;
- mode: autonomy-designed or human-assisted, with a one-sentence reason;
- bounded scope for this launch;
- expected implementation shape and likely files or areas;
- materialization shape, such as one local Graphite branch or direct edits
  on the current branch if the user explicitly requested that;
- validation expected before keeping work;
- external access expectations and any prohibited side effects;
- stop conditions;
- expected Objective tracking, if meaningful progress is made;
- whether PR submission is in scope.

Default wording for PR submission is: `PR submission is out of scope for
this launch.`

Proceed only after an explicit confirmation of the latest preview. If the
user changes the scope, revise the preview and ask again.

## Execution architecture

The current parent agent session is the orchestrator. It owns:

- Objective resolution and mode choice;
- the preview and confirmation gate;
- branch and worktree safety checks;
- deciding whether a runner subagent is useful;
- writing complete subagent prompts;
- verifying all returned work;
- deciding what to keep or discard;
- Objective tracking updates;
- commits and optional submission;
- the final stop decision.

Runner subagents are optional implementation helpers. When used:

- launch at most one subagent at a time;
- use the current worktree;
- give the subagent all context it needs in the prompt;
- verify the result independently before keeping it;
- do not treat freeform subagent text as proof of completion.

Do not parallelize runner subagents for v1.

## Keep, discard, and materialize

Keep work only when it has evidence against the Objective's progress
criteria and passes appropriate validation.

- Source or doc changes should have relevant local validation.
- External research should cite concrete sources.
- No-validation cases must explain why validation is not available or not
  meaningful.
- Ambiguous or speculative changes should be discarded, not preserved as a
  run artifact.

When work is kept, materialize it as repo state inside the confirmed
scope. For this repo, prefer a small local Graphite branch when branch
creation is in scope. Consult the Graphite workflow before branch,
restack, commit, or submit operations.

Reusable semantic learning from discarded work may be recorded as an
Objective update only when it changes future decisions. Do not record a
run log or failed-attempt ledger.

## Objective tracking

Update Objective files only for meaningful Objective impact:

- kept implementation progress;
- changed assumptions;
- invalidated assumptions;
- reusable semantic findings;
- changed operating guidance;
- roadmap changes that alter future work.

Do not create a no-op Objective update to memorialize that a launch
happened. If the run finds no safe progress to keep, say so in the final
response and leave durable state unchanged unless there is meaningful
learning to record.

## PR submission

PR submission is never implied. It may happen only when the confirmed
preview explicitly includes submission.

When submission is in scope for this repo:

1. verify the kept work first;
2. use the repo's Graphite workflow;
3. submit with:

   ```bash
   gt submit --no-interactive
   ```

If submission was not in the confirmed preview, stop with local work and
state that submission remains manual.

## Final response guidance

End every launch with a concise report containing:

- selected Objective slug and mode;
- confirmed scope actually attempted;
- slices or passes run;
- files changed and materialization shape;
- validation performed and results;
- Objective tracking changes, or why none were written;
- PR submission status;
- discarded work or blockers, if any;
- recommended next action.
