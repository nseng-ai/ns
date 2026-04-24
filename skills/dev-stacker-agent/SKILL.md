---
name: dev-stacker-agent
description: "Implement a plan file that's decomposed into a stack of PRs by acting as coordinator for one serial sub-agent per PR. Fires when the user asks to 'implement the stacked plan', 'run the PR stack', 'execute this plan as a Graphite stack', or points at a plan file with numbered 'PR N — ...' scope sections. Reads the plan, reconciles the base-branch chain against real git state, creates a task per PR, spawns one general-purpose sub-agent per PR, verifies tree-green handoffs + reviews the diff between each, and stops short of pushing. Companion to the `graphite` skill, which owns branch mechanics."
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Coordinator for stacked-PR plan execution. -->

# dev-stacker-agent

Implement a plan file that decomposes a workstream into a stack of PRs by
acting as the coordinator for one serial `general-purpose` sub-agent per PR.
The coordinator reads the plan, reconciles the plan's base-branch chain
against real git state, spawns sub-agents one at a time, verifies tree-green
handoffs, reviews the diff between each, and stops short of pushing.

## Goal

Run stacked-PR plans consistently with a strong handoff contract:

1. Keep each sub-agent's file reads / tool calls out of the coordinator's
   context (the context-hygiene win).
2. Formalize plan-vs-reality reconciliation as coordinator-only pre-flight
   work before any sub-agent runs.
3. Review every inter-PR diff so "tree-green" is backed by "coordinator has
   skimmed the diff" (the retrospective fix).
4. Stop at a reviewable local stack — never push, never submit, never open
   PRs. The user drives submission manually via `gt submit --no-interactive`.

## Inputs

The user provides an absolute path to a plan file (or a reference that
resolves to one in the current conversation). The plan must decompose the
work into a numbered stack of PRs; see **Preconditions** for the exact
shape.

## Core rules

- **Serial-only execution.** No opportunistic parallelism, even when the
  plan marks a PR "independent." If parallelism is needed, run the skill
  twice on disjoint branch prefixes.
- **Consume the plan's sub-agent contract.** Don't impose a schema. The
  skill validates that the plan has numbered PR sections and a
  base-branch chain, but the plan author owns the prose contract. When the
  plan omits a contract, this skill supplies the default in step 4.
- **Coordinator does not implement code.** Sub-agents do the engineering.
  The coordinator composes briefs, spawns, verifies, reviews diffs, and
  forwards context.
- **Tree-green + diff-skim is the handoff bar.** Tree-green alone is too
  weak; every handoff is also gated on a coordinator-skimmed diff.
- **Never push, submit, or open PRs.** Those are user actions, performed
  after this skill finishes.
- **Branch mechanics defer to `graphite`.** Sub-agents use `gt create` /
  `gt modify` per the `graphite` skill, not raw `git commit` / `git push`.

## Workflow

### 1. Preconditions

Read the plan file once up front. Confirm it is shaped for stacked-PR
execution:

- **Multiple PRs.** The plan has at least two numbered PR scope sections,
  matching a shape like `## PR N — <title>` or `### PR N — <title>`.
  If the plan has exactly one PR, bail: tell the user to implement it
  directly in-session rather than spinning up the coordinator pattern.
- **Base-branch chain.** Each PR states its base branch explicitly
  (typically `master` for PR 1, then each subsequent PR stacks on the
  prior PR's branch). If the chain is not stated or is ambiguous, stop
  and ask the user.
- **Per-PR green-bar command.** The plan states a green-bar command for
  each PR (default: `just`). If omitted, default to `just` at the repo
  root.

Environment checks:

- The current working tree is clean (`git status --porcelain` empty).
  If dirty, stop and ask the user.
- `gt` is available (`command -v gt`). The twerk repo uses Graphite per
  `AGENTS.md`; sub-agents will use it for branch creation.

Missing sub-agent contract is **not** a bail condition — step 4 supplies
the default. Honor the plan's own contract when present; supplement only
fields the plan omits.

### 2. Pre-flight reconciliation

Before any sub-agent runs, reconcile the plan's stated base-branch chain
against real git state. This is coordinator-only work — sub-agents never
see the raw plan-vs-reality mismatch.

For each PR in order:

1. Extract the PR's stated base branch from the plan.
2. Verify it resolves:

   ```bash
   git rev-parse --verify <base>
   ```

   For PR 1 the base is typically `master` (or the repo's trunk). For
   PR 2+ it is the branch that PR N-1 will create — at pre-flight time
   that branch does not yet exist, so skip the `rev-parse` check for
   PRs 2+ and defer verification to step 7's post-handoff check.

3. For PR 1 only: sanity-check the plan's body against the base. If the
   plan references gateway methods, CLI commands, tests, or files that
   do not exist on the base branch, stop and ask the user. This is the
   check that would have caught a `master` vs `brmem-copy` base mismatch
   — symptom: the plan was written against a feature branch but the
   coordinator is about to stack onto trunk.

   Do not grep the whole plan. Pick 2–3 concrete identifiers named in
   PR 1's scope (method names, file paths, CLI flags) and verify each
   exists on the base with `git cat-file -e <base>:<path>` or
   `git grep -l <identifier> <base>`. A single confirmed mismatch is
   enough to stop.

If pre-flight surfaces any problem, stop and report to the user. Do not
spawn sub-agents until the base chain is sound.

### 3. Task tracking

Create one task per PR via `TaskCreate` with an imperative subject
copied from the plan's PR heading (e.g. _"PR 1 — Tree-plumbing
primitives"_). Wire `addBlockedBy` so PR N depends on PR N-1 — the
serial-execution contract.

Task state transitions:

- Mark `in_progress` when spawning the sub-agent for that PR.
- Mark `completed` only after step 7's verification passes: tree-green,
  diff-skim, and downstream context captured.

Do not batch completions. Mark each task completed as soon as its
verification lands.

### 4. Default sub-agent contract

If the plan has its own **Coordinator / sub-agent contract** section,
honor it verbatim. Supplement only fields the plan omits. The default
contract, applied to each sub-agent brief, has these fields:

- **Plan file path** — absolute path to the plan file.
- **PR number + scope heading** — verbatim from the plan's PR section.
- **Verified base branch** — the branch resolved in step 2 (for PR 1) or
  the branch reported by the prior sub-agent's handoff (for PR 2+).
  Not the raw plan-prose base; the coordinator-verified one.
- **Suggested branch name + commit message stub** — derived from the
  PR's title and scope. Sub-agent may override the branch name; it must
  report whichever name it used in the handoff payload.
- **Do-not-touch list** — the "Do not touch" bullets from the plan's
  scope section, if present. Empty list if absent.
- **Green-bar command** — from the plan, or `just` by default. Run from
  repo root.
- **Forwarded context from prior PRs** — summary fragments flagged
  `important for downstream` during step 7 of previous iterations.
  Empty for PR 1.
- **Hard prohibitions** — no `gt submit`, no `git push`, no
  `gh pr create`, no scope expansion without asking.
- **Handoff format** — the JSON + prose shape from step 6.

Compose the brief by filling `references/brief-template.md`. Pass the
filled template as the `Agent` tool's `prompt` argument.

### 5. Spawn loop (serial)

For each PR in order:

1. Mark the PR's task `in_progress`.
2. Compose the brief from `references/brief-template.md`, the plan's
   scope section for this PR, and any forwarded context from prior PRs.
3. Spawn the sub-agent:

   ```
   Agent(
     description: "Implement PR N — <title>",
     subagent_type: "general-purpose",
     prompt: <filled brief>,
   )
   ```

4. Wait for the sub-agent to return. **No background mode. No parallel
   spawns.** Even if two PRs are marked independent by the plan, run
   them serially — parallel execution breaks the diff-review contract
   in step 7 because PR N+1's base is not stable until PR N's diff is
   reviewed.

5. Run step 7 (verification). Only after step 7 passes, proceed to
   PR N+1.

### 6. Handoff contract

Each sub-agent returns two things:

1. A **JSON line** with the machine-readable handoff:

   ```json
   {"branch": "<name>", "commit_sha": "<sha>", "exit_code": 0}
   ```

   Non-zero `exit_code` means the green-bar command failed; the sub-agent
   should include the last ~40 lines of output in the prose summary.

2. A **prose summary** flagging:
   - Deviations from the plan's scope (files touched outside the scope
     section, tests added beyond what the plan asked for, etc.).
   - Hidden design choices the plan didn't specify (naming, argument
     ordering, helper placement) — mark these `important for downstream`
     if they establish contracts the next PR must adopt.
   - Exact names / shapes downstream PRs must use verbatim (helper
     function names, type names, error message strings).

If the plan author supplied a richer handoff format, use theirs; the JSON
line + prose summary is the default floor.

### 7. Coordinator verification

This is the retrospective fix — **do not skip any substep**. Run after
each sub-agent returns, before marking the task complete or spawning
PR N+1.

1. **Verify the handoff payload parses** and `exit_code == 0`. If
   non-zero:
   - Apply the failure policy in step 9. One `SendMessage` retry to
     the same sub-agent with the specific failure, then surface to
     user if it fails again.

2. **Verify the branch exists at the reported SHA:**

   ```bash
   git rev-parse --verify <reported-branch>
   ```

   The resolved SHA must match the handoff's `commit_sha`. A mismatch
   means the sub-agent amended, reset, or otherwise moved the branch
   between reporting and the coordinator's check — pause and
   investigate before continuing.

3. **Skim the diff:**

   ```bash
   git diff <prior-branch>..<reported-branch> --stat
   ```

   (For PR 1, `<prior-branch>` is the plan-stated base, typically
   `master`.) Scan the file list. Check against the PR's do-not-touch
   list:
   - If any do-not-touch file appears, pause and report to the user
     before spawning PR N+1.
   - If the file list includes obviously out-of-scope entries
     (unrelated packages, random config files, vendored skill
     directories), pause and report.

   Open `git diff <prior-branch>..<reported-branch>` and skim for
   anything surprising — not a full code review, but enough to catch
   scope drift or accidental cross-cutting edits. The bar is "nothing
   obvious would embarrass me in PR review," not line-by-line audit.

4. **Forward downstream context.** Extract summary fragments the
   sub-agent flagged `important for downstream` and stash them for
   the next iteration's brief composition (step 4).

5. **Mark the task complete.**

### 8. Stop conditions

After the last PR's verification passes, print the stack summary to the
user and stop:

- One line per PR: `<branch-name>   <first-commit-subject>   (+X -Y Nf)`
  where the last tuple is the `--shortstat` from the diff against the
  branch's base.
- A final line: **"Run `gt submit --no-interactive` yourself when ready
  to push."**

Do **not** run `gt submit`, `git push`, or `gh pr create`. Do not offer
to do so. The user reviews the local stack first; submission is their
call.

If you want to show the stack shape concisely, `gt ls` prints the stack
with its current navigation pointer — run it and pass the output
through to the user as a confirmation that the stack is shaped as
expected.

### 9. Failure / retry policy

- **Red green-bar at the sub-agent** (`exit_code != 0`): one
  `SendMessage` retry to the same sub-agent, quoting the specific
  failure (last ~40 lines the sub-agent reported). If the retry still
  fails, surface to the user with the sub-agent's output and stop. Do
  not move to PR N+1 on a red tree.
- **Sub-agent asks a blocking question**: surface to the user
  verbatim. Do not improvise an answer — the whole point of the
  coordinator pattern is to avoid silent scope drift.
- **Sub-agent reports scope deviation** in its prose summary: evaluate
  against the plan's do-not-touch list and the PR's scope. Clear
  deviation → surface to user, pause the loop. Unclear → surface to
  user. Only obviously-in-scope deviations (e.g., the sub-agent
  touched an adjacent file to make a referenced helper compile)
  proceed without user input, and should be captured in the forwarded
  downstream context so PR N+1 sees the same interpretation.
- **Pre-flight mismatch surfaced mid-run** (PR N's handoff reveals
  that PR N+1's plan-stated base is wrong): stop and ask the user
  before spawning PR N+1.

## Edge cases

- **Plan has one PR** → bail in step 1. The coordinator pattern adds
  overhead that only pays off at 2+ PRs.
- **Plan's sub-agent contract conflicts with the default** → honor the
  plan's contract. The plan author knows the workstream better than
  this skill.
- **Plan's green-bar command is nonstandard** (e.g., a scoped
  `pytest` invocation rather than `just`) → use the plan's command
  verbatim. Do not silently substitute `just`.
- **PR 1's base does not exist** → bail in step 2 before any spawn.
  Report which base the plan asserts and ask the user for the
  correct one.
- **Sub-agent reports a branch name different from the suggested
  name** → accept it; the suggested name was advisory. Use the
  reported name as PR N+1's verified base.
- **Working tree dirty at start** → bail. Do not stash on the user's
  behalf; their uncommitted work may be related or unrelated, and the
  skill shouldn't guess.
- **`gt` unavailable** → bail with a pointer to install Graphite.
  Sub-agents depend on it for clean stack creation.
- **Sub-agent finishes but never produces a handoff JSON line** →
  treat as a red handoff; one retry via `SendMessage` asking for the
  JSON explicitly, then surface if still missing.
- **Plan references files on a feature branch that the coordinator is
  stacking onto trunk** → step 2's identifier check catches this.
  Stop, report the mismatch, let the user either fix the plan or
  rebase the source.
- **User wants to run two disjoint sub-stacks in parallel** → run the
  skill twice, once per sub-stack, from separate worktrees. The skill
  itself never parallelizes within a single invocation.

## Anti-patterns

- Skipping the diff-skim after tree-green. Tree-green is a weak signal;
  coordinator diff-skim is the retrospective fix that exists because
  tree-green missed scope-drift issues in prior runs.
- Implementing code in the coordinator. The coordinator composes
  briefs, spawns, verifies, and forwards context — nothing else.
- Parallelizing "independent" PRs in a single invocation. Breaks the
  inter-PR diff-review contract because PR N+1's base is unstable
  until PR N lands.
- Auto-running `gt submit` / `git push` / `gh pr create` after the
  last PR. The stop condition is a reviewable local stack, not a
  pushed one.
- Letting the sub-agent scope-expand silently. Every deviation flows
  through the handoff prose; the coordinator either forwards it,
  surfaces it, or asks.
- Passing the raw plan prose to the sub-agent as "here, do what the
  plan says." The filled brief is the contract; the plan is ambient
  context. The sub-agent reads the plan for detail but executes
  against the brief.
- Forwarding the entire plan to every sub-agent. Each sub-agent cares
  about its own PR scope + forwarded downstream context from prior
  PRs. Less context = less drift.
- Swallowing a red tree with "close enough, move on." One retry, then
  surface. The serial contract means PR N+1 cannot safely start on a
  broken PR N base.
- Treating "sub-agent said tree is green" as proof. Verify
  `exit_code == 0` in the handoff payload; do not infer greenness
  from prose.
- Letting the plan's sub-agent contract drift from this skill's
  verification bar. If the plan's contract says "no verification
  between PRs," override — the coordinator's verification is the
  fix and is not negotiable.
