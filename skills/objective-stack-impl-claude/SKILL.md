---
name: objective-stack-impl-claude
description: "Claude-native variant of objective-stack-impl. Use when the user wants to implement one asdl Objective as a small Graphite stack from a Claude Code session: pick the Objective, preview a 1-3 slice plan, confirm, then run the slices autonomously in a background Workflow and render a digest. Pi users keep using /objective-stack-impl."
argument-hint: "[objective-slug]"
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Workflow
  - Task
---

# objective-stack-impl-claude

Implement one asdl **Objective** as a small Graphite stack, Claude-Code-native.

This is the Claude port of the Pi capability `/objective-stack-impl`. The Pi version stays
intact for Pi users. Here, the interactive **pick → inspect → preview → confirm** happens in
this session, then the approved slices run **hands-off in a background Workflow**
(`objective-stack-impl-claude`) that builds each slice as a Graphite branch, verifies it
independently, and records Objective tracking. You then render the digest the Workflow returns.

For shared Objective vocabulary and file conventions, use the `objective` skill. For all `gt`
mechanics, use the `graphite` skill. This skill is the pre-flight; **the slice loop lives only in
the Workflow** — do not re-implement it here.

Objective argument: `$ARGUMENTS`.

## Hard boundaries

- One human gate only: the plan confirmation. There are **no mid-run gates** — the Workflow runs
  autonomously and stops the loop on any failed verdict, blocker, or question, then reports.
- Never push or submit PRs. PR submission is always left to an explicit later user request.
- Do not invent durable stack schemas, side ledgers, YAML registries, or Branch Memory records for
  the plan. The preview is conversational; the only durable artifacts are git/Graphite state and the
  Objective files under `.asdl/objectives/<slug>/`.
- Do not auto-select an Objective. Suggest, then wait for the user.

## 1. Resolve the Objective

1. If `$ARGUMENTS` is a non-empty slug or `.asdl/objectives/<slug>` path, normalize it to `<slug>`
   and use it. Otherwise run:

   ```bash
   objective list --format json
   ```

   Read `data.records` (open Objectives) and `data.trunk_branch` (the trunk, e.g. `master`).

2. **Suggest changed Objectives** (advisory only — never auto-select). Mirror the Pi picker's two
   git signals, scoped to `.asdl/objectives` (read `<trunk>` from the list output above):

   ```bash
   git diff --name-status -M <trunk>...HEAD -- .asdl/objectives   # committed changes vs trunk
   git status --porcelain=v1 -- .asdl/objectives                  # dirty working-tree changes
   ```

   Extract `<slug>` from any `.asdl/objectives/<slug>/...` path. Present the open candidates and
   float changed ones to the top with a "suggested — changed in this checkout" note. If exactly one
   Objective changed, offer it first with a "view other active Objectives" escape hatch. Then **ask
   the user to choose** — do not infer from branch names, PR titles, packages, or keywords.

3. If `.asdl/objectives/<slug>/closed.md` exists, stop and report that the Objective is closed.

## 2. Inspect the Objective and repo state

```bash
objective exec read-objective <slug> --format md
```

Read `.asdl/objectives/<slug>/objective.md`, `roadmap.md`, and relevant files under `updates/`, plus
the source/test areas relevant to the next work. Inspect repo state:

```bash
git status --short
git branch --show-current
```

**Tracking gate.** If material implementation progress appears present but is not recorded in the
Objective, stop and tell the user to run `objective-update` for this slug before continuing. If
evidence is absent, ambiguous, or unrelated, proceed with a short note.

**Clean-tree gate (hard).** The background Workflow mutates the live checkout to build the stack, so
the working tree must be clean. If `git status --short` shows uncommitted changes, **stop** and ask
the user to commit, stash, or discard them before running. Do not launch the Workflow on a dirty
tree.

## 3. Compact context (in-session only)

Write a short prose compaction of the current context: user intent and constraints, decisions
already made, known changed files/branches/validation, and stale context to ignore. This is
in-session orientation only — **no durable artifact, no Branch Memory**.

## 4. Preview and confirm the plan

Present a concise execution preview and ask the user to confirm. Default to **1–3** Graphite
branches/slices. The preview is conversational only. It must include:

- selected Objective slug;
- 1–3 planned slices, each with: a one-sentence thesis, why it is independently reviewable, and the
  expected validation;
- the expected Objective end-state (roadmap/update/closure expectation);
- exact stop conditions (the Workflow stops on any failed verdict, blocker, or question);
- a reminder that PR submission is intentionally left manual.

Use a compact shape:

```text
Proposed Objective implementation plan

Objective: `<slug>`

Slices (run serially as a Graphite stack):

1. `<branch-name>`
   - Thesis: <one sentence>
   - Independently reviewable because: <one sentence>
   - Validation: <command / evidence>

2. `<branch-name>`
   - Thesis: <one sentence>
   - Independently reviewable because: <one sentence>
   - Validation: <command / evidence>

Expected Objective end-state: <roadmap/update/closure expectation>
Stop conditions: failed verification (after one retry), a blocker, or a question.
PR submission: left manual.

Proceed with this plan? (autonomous background run)
```

Proceed only after an explicit affirmative (`yes`, `proceed`, or a clear equivalent). If the user
asks for changes, revise and ask again. If they decline, are ambiguous, or ask a question, answer or
stop — do not launch the Workflow.

## 5. Assemble the approved plan and launch the Workflow

On explicit confirmation, assemble the lean `args` object. Keep it small — the slice agents have
Bash and read the Objective files themselves, so do not inline large narrative. Set `baseRef` of the
first slice to the branch the stack should build on (the trunk or the current branch); the Workflow
threads each created branch as the next slice's base automatically.

```json
{
  "slug": "<slug>",
  "trunkBranch": "<trunk, e.g. master>",
  "validateCommand": "just",
  "objectiveSummary": "<short orienting prose>",
  "slices": [
    {
      "index": 1,
      "title": "<slice title>",
      "thesis": "<one sentence>",
      "baseRef": "<trunk-or-current-branch>",
      "branchName": "<stack-feature>/<terse-change>",
      "scope": "<what is in scope / non-goals>",
      "validation": "<command, defaults to validateCommand>",
      "downstreamNotes": "<notes for later slices, optional>"
    }
  ]
}
```

Then invoke the Workflow (this skill's instructions are the explicit opt-in for `Workflow`):

```
Workflow({ name: "objective-stack-impl-claude", args: <approvedPlan> })
```

Tell the user it runs in the **background and autonomously**, and that they should **not work in
this checkout while it runs** (it mutates the working tree to build the stack). They can watch live
progress with `/workflows`.

## 6. Render the digest

When the Workflow returns, render a digest forked from Pi's "Stack implementation digest" (minus Pi
telemetry). Use the returned object's `slices`, `stopReason`, branches, head shas, validation, and
objective-update results:

```md
## Stack implementation digest

### Objective

- slug: `<slug>`
- stop reason: `<completed | verification-failed[-after-retry] | blocker | question>`

### Slices

| slice     | branch     | base     | status                 | verified   | validation       | tracking                  |
| --------- | ---------- | -------- | ---------------------- | ---------- | ---------------- | ------------------------- |
| `<title>` | `<branch>` | `<base>` | `<ok/failed/question>` | `<yes/no>` | `<cmd> exit <n>` | `<recorded path or none>` |

### What changed

- Parent summary of the meaningful code/docs changes across the stack.

### Validation

- Per slice: `<validateCommand>` — passed/failed, with short interpretation.

### Objective tracking

- Updates recorded: yes/no, with the `.asdl/objectives/<slug>/updates/...` file names.
- Updates still needed: yes/no, with reason.

### Token telemetry

- Token telemetry is unavailable in the Claude harness (no per-subagent accounting like Pi's runner
  logs). Coarse aggregate output tokens this run: `<budgetSpentTokens or "not tracked">`.

### Recommended next action

- Inspect the stack (`gt ls`), continue the next slice, run `objective-update`, or submit PRs.
- PR submission was intentionally left undone unless you explicitly ask for it.
```

If `stopReason` is not `completed`, lead with the blocking slice's `question`/`blockers`/failed
verdict reasons so the user can recover manually from git/Graphite state and the Objective files.

## Stop / ask when

- Objective selection is absent or ambiguous, or the selected Objective is closed.
- Material progress appears unrecorded (run `objective-update` first).
- The working tree is dirty (clean-tree gate).
- The plan preview has not been explicitly confirmed, or the user asks for changes.
- The Workflow returns a non-`completed` stop reason — surface it; do not silently retry.
