---
name: dev-stacker-agent
description: "Implement a plan file that's decomposed into a stack of PRs by acting as coordinator for one serial sub-agent per PR. Fires when the user asks to 'implement the stacked plan', 'run the PR stack', 'execute this plan as a Graphite stack', or points at a plan file with numbered 'PR N — ...' scope sections. Reads the plan, reconciles the base-branch chain against real git state, creates a task per PR, spawns one general-purpose sub-agent per PR, verifies tree-green handoffs + reviews the diff between each, and stops short of pushing. Companion to the `graphite` skill, which owns branch mechanics."
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Coordinator for stacked-PR plan execution. -->

# dev-stacker-agent

Coordinate a stacked-PR plan by spawning one serial `general-purpose`
sub-agent per PR. The user supplies an absolute path to a plan whose
scope is decomposed into numbered `## PR N — <title>` sections. The
coordinator reconciles the plan's base-branch chain against real git
state, fills one brief per PR from `references/brief-template.md`,
spawns sub-agents one at a time, verifies each handoff (tree-green +
diff-skim), forwards downstream context, and stops at a reviewable
local stack. It never pushes or submits.

## Invariants

- **Serial-only.** No parallelism within a single invocation, even when
  the plan marks PRs independent. Parallel "independent" PRs break the
  inter-PR diff-review contract because PR N+1's base is unstable until
  PR N's diff is reviewed. Two disjoint stacks → run the skill twice
  from separate worktrees.
- **Coordinator never implements code.** Only composes briefs, spawns,
  verifies, reviews diffs, forwards context.
- **Tree-green AND diff-skim** is the handoff bar. `exit_code == 0` in
  the handoff payload is not enough by itself.
- **Never `gt submit`, `git push`, or `gh pr create`.** The stop
  condition is a reviewable local stack; submission is the user's call.
- **Branch mechanics defer to `graphite`.** Sub-agents use `gt create` /
  `gt modify`, not raw `git commit` / `git push`.
- **Plan's own sub-agent contract wins** when present. The default
  below supplements only fields the plan omits.
- **Default brief lives in `references/brief-template.md`.** Fill its
  placeholders and pass the result as `Agent.prompt`.

## Workflow

### 1. Preconditions

Read the plan once up front. Bail and surface to the user if any of
these fail:

- Plan has ≥2 numbered PR sections (`## PR N — <title>` or `### PR N —
  <title>`). Single-PR plans don't justify the coordinator pattern —
  tell the user to implement in-session.
- Each PR states its base branch explicitly; PR 1 typically `master`,
  PR N stacks on PR N-1's branch. Ambiguous chain → stop and ask.
- Working tree clean (`git status --porcelain` empty). Don't stash on
  the user's behalf — their uncommitted work may or may not be related.
- `gt` available on PATH (`command -v gt`).

Per-PR green-bar command: take it from the plan; default to `just` at
repo root when absent. If the plan specifies something nonstandard
(e.g. a scoped `pytest` invocation), use it verbatim — no silent
substitution.

### 2. Pre-flight reconciliation

Before any spawn, verify PR 1's base against real git state. PR 2+
bases are the branches PR N-1 will create; defer those to step 3e's
post-handoff SHA check.

- `git rev-parse --verify <PR 1 base>`. Missing → bail and ask which
  base to use.
- **Identifier sanity check.** Pick 2–3 concrete identifiers named in
  PR 1's scope (method names, file paths, CLI flags). For each,
  verify it exists on the base:
  - `git cat-file -e <base>:<path>` for files,
  - `git grep -l <identifier> <base>` for symbols.

  One confirmed mismatch is enough — stop and report. This catches
  plans written against a feature branch that are about to be stacked
  onto trunk.

### 3. Per-PR loop (serial)

For each PR in order, do all of the following:

**a. Track.** `TaskCreate` one task per PR with an imperative subject
copied from the PR heading (e.g. _"PR 1 — Tree-plumbing primitives"_).
Wire `addBlockedBy` so PR N depends on PR N-1 — this is the
serial-execution contract. Mark `in_progress` when spawning (3c);
mark `completed` only after 3e passes. Never batch completions.

**b. Fill the brief.** Fill `references/brief-template.md` with:

1. Plan file path (absolute).
2. PR number + scope heading (verbatim from the plan).
3. Verified base branch — for PR 1, the base from step 2; for PR 2+,
   the branch reported by PR N-1's handoff (not the raw plan-prose
   base).
4. Suggested branch name + commit-message stub. Sub-agent may override;
   it must report whichever name it used.
5. Do-not-touch list from the PR's scope (empty if absent).
6. Green-bar command (from plan, default `just`, run from repo root).
7. Forwarded context from prior PRs — fragments flagged
   `important for downstream` in step 3e of earlier iterations. Empty
   on PR 1.
8. Hard prohibitions: no `gt submit`, no `git push`, no `gh pr create`,
   no silent scope expansion.
9. Handoff format: JSON line + prose (see step 3d).

If the plan has its own **Coordinator / sub-agent contract** section,
honor it verbatim and supplement only fields it omits.

**c. Spawn.** Synchronously — no `run_in_background`, no parallel
spawns:

```
Agent(
  description: "Implement PR N — <title>",
  subagent_type: "general-purpose",
  prompt: <filled brief>,
)
```

Wait for the sub-agent to return before doing anything else.

**d. Handoff contract.** Each sub-agent returns:

1. A single JSON line: `{"branch": "<name>", "commit_sha": "<sha>",
   "exit_code": 0}`. Non-zero `exit_code` means the green bar failed;
   the sub-agent should include the last ~40 lines of output in the
   prose.
2. A prose summary flagging:
   - **Deviations** — files touched outside the scope section, tests
     added beyond what the plan asked for.
   - **Hidden design choices** — naming, argument ordering, helper
     placement, error-message strings. Mark `important for downstream`
     if PR N+1 must adopt the exact name or shape verbatim.
   - **Exact names / shapes** downstream PRs must reuse verbatim.

A plan-supplied richer handoff format wins; JSON + prose is the floor.

**e. Verify (do not skip any substep).**

1. Parse the handoff; confirm `exit_code == 0`. If not, apply the
   failure policy below.
2. `git rev-parse --verify <reported-branch>`. The resolved SHA must
   equal the handoff's `commit_sha` — a mismatch means the sub-agent
   amended or reset the branch between reporting and the check; pause
   and investigate.
3. `git diff <prior-branch>..<reported-branch> --stat` (for PR 1,
   `<prior-branch>` is the step-2 base). Check the file list against
   the do-not-touch list — any hit → pause. Obviously out-of-scope
   entries (unrelated packages, random config, vendored skill dirs)
   → pause. Then open the full diff and skim for scope drift. The
   bar is "nothing obvious would embarrass me in PR review," not a
   line-by-line audit.
4. Stash any `important for downstream` fragments for the next PR's
   brief composition.
5. Mark the task `completed`. Advance to PR N+1.

### 4. Stop conditions

After the last PR's verification passes, print the stack summary and
stop:

- One line per PR: `<branch>  <first-commit-subject>  (+X -Y Nf)`
  where the tuple is the `--shortstat` of the branch against its
  base.
- Optional: run `gt ls` and pass its output through as a shape
  confirmation.
- Final line: **Run `gt submit --no-interactive` yourself when ready
  to push.**

Do not run `gt submit`, `git push`, or `gh pr create`. Do not offer to.

## Failure / retry policy

- **Red green-bar (`exit_code != 0`):** one `SendMessage` retry to the
  same sub-agent quoting the specific failure (last ~40 lines from the
  prose). Still red → surface to the user with the sub-agent's output
  and stop. Never advance PR N+1 on a red PR N.
- **Blocking question from the sub-agent:** surface verbatim; never
  improvise. The whole point of the coordinator pattern is to avoid
  silent scope drift.
- **Scope deviation flagged in prose:** clear deviation → surface and
  pause. Unclear → surface. Obviously in-scope (e.g., an adjacent
  helper edit to make a referenced symbol compile) → proceed, but
  capture the interpretation in the forwarded downstream context so
  PR N+1 sees the same reading.
- **Missing handoff JSON line:** treat as red; one `SendMessage`
  asking for the JSON explicitly, then surface if still missing.
- **Pre-flight mismatch surfaced mid-run** (PR N's handoff reveals
  that PR N+1's plan-stated base is wrong): stop before spawning
  PR N+1 and ask the user.

## Bail table

| Trigger                                                          | Action                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Plan has one PR                                                  | Bail in step 1; tell the user to implement in-session.                                |
| Dirty working tree at start                                      | Bail; don't stash on the user's behalf.                                               |
| `gt` missing                                                     | Bail with a pointer to install Graphite.                                              |
| PR 1 base doesn't resolve                                        | Bail in step 2; report the asserted base and ask for the correct one.                 |
| PR 1 identifier sanity-check mismatch                            | Bail in step 2; report the missing identifier.                                        |
| Plan's sub-agent contract conflicts with the default             | Honor the plan's contract.                                                            |
| Plan's green-bar command is nonstandard                          | Use the plan's command verbatim; no silent `just` substitution.                       |
| Sub-agent reports a branch name different from the suggested one | Accept it; use the reported name as PR N+1's verified base.                           |
| User wants two disjoint sub-stacks in parallel                   | Run the skill twice from separate worktrees; never parallelize within one invocation. |

## Anti-patterns

- **Tree-green without diff-skim.** Tree-green is a weak signal; the
  coordinator diff-skim is the retrospective fix that exists because
  tree-green missed scope-drift issues in prior runs.
- **Coordinator implementing code.** The coordinator composes briefs,
  spawns, verifies, and forwards context — nothing else.
- **Forwarding the whole plan as "do what the plan says."** The filled
  brief is the contract; the plan is ambient context. Each sub-agent
  cares about its own PR scope + forwarded downstream context from
  prior PRs. Less context = less drift.
- **Trusting "sub-agent said tree is green" without checking the
  JSON.** Verify `exit_code == 0` in the handoff payload; do not infer
  greenness from prose.
- **Letting a plan's contract weaken the verification bar.** If the
  plan says "no verification between PRs," override — the
  coordinator's verification exists because tree-green alone missed
  scope drift before, and it is not negotiable.
