<!-- Loaded through `code-workflows`. -->

# stacker-agent

Use when the user wants a multi-slice plan implemented as a local
branch stack, or explicitly wants the slices recorded as commits on one
branch. The input may be freeform markdown, rough notes, or
harness-native planner output; do not require a user-authored schema.

The coordinator's job is to:

1. Normalize the plan into an ordered list of slice manifests.
2. Run one worker per slice in strict order.
3. Verify each slice before allowing the next one to begin.
4. Stop at reviewable local branches or commits without pushing or
   submitting.

## Read These References As Needed

- `references/stacker-agent/runtime-contract.md`: manifest and handoff schemas.
- `references/stacker-agent/brief-template.md`: worker brief template.
- `references/stacker-agent/harnesses/generic.md`, then the current harness note:
  how to map worker orchestration to this protocol.
- `references/stacker-agent/examples.md`: normalization examples.

## Core Invariants

- **Serial only.** Run one slice at a time. Never parallelize slices
  inside one invocation.
- **Coordinator orchestrates; worker implements.** The coordinator may
  normalize, brief, verify, retry once, and surface questions. It does
  not silently absorb implementation work from the worker.
- **Verification requires validation plus diff skim.** A worker saying
  "tests passed" is not enough.
- **Never push, submit, or open PRs.** Stop at reviewable local
  branches or commits. Submission is the user's call.
- **Output shape follows the request.** Default to one branch per
  slice. Use a commit series only when the user explicitly asks for
  commits, no PRs, or one branch; the manifest, handoff, serial loop,
  and verification bar stay the same.
- **Use conservative defaults when risk is low; ask when ambiguity is
  material.** If title, scope, order, base, or validation is too
  ambiguous to normalize safely, stop and ask.
- **Task objects are adapter-level only.** Some harnesses have native
  task tracking; many do not. The core protocol does not depend on it.
- **Precedence is explicit.** Core invariants > repo workflow
  conventions > harness adapter rules > plan-derived details. Plans may
  enrich execution; they may not weaken the invariants above.

## Harness Capability Gate

Only run in a harness that can:

- delegate exactly one worker at a time and wait for completion,
- pass a textual brief to that worker,
- inspect local git state between slices,
- collect a structured handoff from the worker, and
- either send one targeted follow-up to the worker or stop and surface
  the failure.

The worker must share the repo/worktree the coordinator verifies. If
the harness only supports isolated or forked workers, this skill is
unsupported as written.

## Repo Workflow

The core protocol is harness-neutral, not repo-neutral. Use the repo's
branch workflow conventions when naming branches, creating commits, and
inspecting stack shape.

In this repo, consult the `graphite` skill for branch mechanics and use
Graphite conventions rather than inventing your own.

## Workflow

### 1. Preconditions

Bail and surface to the user if any fail:

- The working tree is dirty. Do not stash on the user's behalf.
- The repo's branch workflow tool is unavailable. In this repo, that
  usually means `gt` is missing.
- The harness capability gate does not pass.
- After normalization, the plan yields fewer than 2 slices. Single-slice
  work should be implemented in-session instead of through this
  coordinator.

### 2. Normalize the plan

Convert the input plan into the internal `stacker-slice-manifest/v1`
shape defined in `references/stacker-agent/runtime-contract.md`.

Normalize slices by human-legible decision count and thesis clarity, not
by diff size, file count, or line count. A large mechanical change can be
one slice when it expresses one clear decision; a small change that mixes
unrelated decisions should be split or surfaced as ambiguous.

Record the run output shape too:

- `branch-stack` default: one branch per slice.
- `commit-series`: one target branch, one commit per slice. Use only
  when explicitly requested. Prefer the current non-default branch; if
  on the default branch and no target branch is named, ask or bail.
  Create or check out the target before slice 1 when needed.

Use the defaults in `references/stacker-agent/runtime-contract.md`. In this repo,
`validate.command` defaults to `just` at the repo root.

If the plan provides richer hints such as file lists, do-not-touch
lists, or concrete identifiers, preserve them as optional constraints or
notes. They strengthen verification when present, but they are not
required for normalization.

### 3. Serial slice loop

For each slice in order, do all of the following:

**a. Prepare slice context.**

- Resolve the concrete base ref.
- Choose a suggested branch name for branch-stack runs, or the single
  target branch for commit-series runs.
- Choose a suggested commit subject using repo conventions.
- Carry forward any downstream notes from prior slices.

**b. Compose the worker brief.**

Fill `references/stacker-agent/brief-template.md` from the normalized slice manifest
plus the current base ref, downstream context, and one exact output
instruction:

- Branch stack: create a fresh branch from the resolved base.
- Commit series: stay on the target branch and add one new commit on
  top of the resolved base; do not create a per-slice branch or amend
  earlier slice commits.

**c. Run one worker.**

Use the current harness's worker/delegation primitive to implement this
slice. Run exactly one worker for the current slice and wait for it to
finish before doing anything else.

**d. Require a structured handoff.**

The worker must return a `stacker-handoff/v1` payload plus short prose,
as defined in `references/stacker-agent/runtime-contract.md`.

**e. Verify before advancing.**

Do not skip any of these checks:

1. `status == "ok"` and `validation.exit_code == 0`.
2. The reported branch/ref resolves locally and its head equals
   `head_sha`.
3. `git diff <base>..<reported-branch> --stat` looks plausibly in
   scope.
4. Skim the full diff for obvious scope drift.
5. For commit series, confirm the reported branch is the target branch
   and its head descends from the resolved base.
6. If optional constraints were supplied, check them now.
7. Stash any `downstream_notes` for the next slice's brief.

Only after those checks pass may the coordinator continue to the next
slice.

### 4. Stop conditions

After the final slice passes verification, print a concise stack
summary and stop.

Include one line per slice with:

- branch name or commit subject,
- head SHA,
- validation command and exit code, and
- a compact changed-files or shortstat summary.

For branch stacks, optionally show the stack with the repo workflow
tool (`gt ls` in this repo). For commit series, mention the target
branch and commit range, e.g. `git log --oneline <start-sha>..HEAD`.

End by telling the user to submit or push manually if they want to move
the work upstream.

## Failure / Retry Policy

- **Red validation or `status != "ok"`:** issue one targeted retry
  using the current harness's native follow-up mechanism, quoting the
  concrete failure. If the harness cannot do that cleanly, stop and
  surface.
- **Missing or malformed structured handoff:** ask once for a corrected
  handoff. Still malformed -> stop and surface.
- **Blocking question from the worker:** surface it verbatim. Do not
  improvise architectural answers.
- **Clear or ambiguous scope drift:** surface and pause. Only proceed
  when the change is clearly in-scope and you can record the
  interpretation as downstream context.
- **Base/order ambiguity discovered mid-run:** stop before spawning the
  next slice and ask.

## Bail Table

| Trigger                                                                          | Action                                                            |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Dirty working tree at start                                                      | Bail. Do not stash on the user's behalf.                          |
| Fewer than 2 slices after normalization                                          | Bail and tell the user to implement in-session.                   |
| Repo workflow tool missing                                                       | Bail and point to the missing tool.                               |
| Harness lacks required worker capabilities                                       | Bail and say the skill is unsupported in that harness as written. |
| Commit-series target is the repo default branch                                  | Ask for a feature branch name or bail.                            |
| Material ambiguity in slice title/scope/order/base/validate                      | Bail and ask only for the missing fact.                           |
| Worker cannot produce a valid structured handoff                                 | Retry once, then surface and stop.                                |
| Worker reveals a plan flaw that changes later slice ordering or base assumptions | Stop before the next slice and ask.                               |

## Anti-Patterns

- **Forcing humans to author one exact markdown shape.** Normalize
  freeform plans instead.
- **Using harness-specific tool names in the core protocol.** Keep that
  in adapter notes.
- **Trusting worker prose without a structured handoff.** Parse the
  handoff, then verify locally.
- **Letting the plan weaken verification or no-push rules.** Plans may
  add detail, not remove guardrails.
- **Parallelizing slices because the plan says they are independent.**
  The whole point of the coordinator is serial verification.
