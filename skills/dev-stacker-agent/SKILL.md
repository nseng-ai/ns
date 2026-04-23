---
name: dev-stacker-agent
description: "Execute a multi-PR implementation plan as a serial local stack by normalizing a freeform plan into ordered slices, coordinating one worker per slice, verifying each handoff, and stopping at a reviewable local stack without pushing."
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Coordinator for stacked-PR execution. -->

# dev-stacker-agent

Use this skill when the user wants to implement a multi-PR plan as a
local stack. The input plan may be freeform markdown, rough notes, or
harness-native planner output. No author-facing plan schema is
required.

The coordinator's job is to:

1. Normalize the plan into an ordered list of slice manifests.
2. Run one worker per slice in strict order.
3. Verify each slice before allowing the next one to begin.
4. Stop at a reviewable local stack without pushing or submitting.

## Read These References As Needed

- `references/runtime-contract.md`:
  the internal manifest and handoff schemas.
- `references/brief-template.md`:
  the worker brief filled from a normalized slice manifest.
- `references/harnesses/generic.md` first, then the current harness
  note (`codex.md`, `claude.md`, or another adapter):
  how the current harness maps worker orchestration to the core
  protocol.
- `references/examples.md`:
  examples of normalizing freeform plans into slice manifests.

## Core Invariants

- **Serial only.** Run one slice at a time. Never parallelize slices
  inside one invocation.
- **Coordinator orchestrates; worker implements.** The coordinator may
  normalize, brief, verify, retry once, and surface questions. It does
  not silently absorb implementation work from the worker.
- **Verification requires validation plus diff skim.** A worker saying
  "tests passed" is not enough.
- **Never push, submit, or open PRs.** Stop at a reviewable local
  stack. Submission is the user's call.
- **No required user-facing plan schema.** The plan may be loose; the
  coordinator normalizes it into the internal runtime contract.
- **Use conservative defaults when risk is low; ask when ambiguity is
  material.** If title, scope, order, base, or validation is too
  ambiguous to normalize safely, stop and ask.
- **Task objects are adapter-level only.** Some harnesses have native
  task tracking; many do not. The core protocol does not depend on it.
- **Precedence is explicit.** Core invariants > repo workflow
  conventions > harness adapter rules > plan-derived details. Plans may
  enrich execution; they may not weaken the invariants above.

## Harness Capability Gate

This skill is only executable in a harness that can do all of the
following:

- delegate exactly one worker at a time and wait for completion,
- pass a textual brief to that worker,
- inspect local git state between slices,
- collect a structured handoff from the worker, and
- either send one targeted follow-up to the worker or stop and surface
  the failure.

The skill assumes the worker can participate in the live repo/worktree
used for the local stack. If the current harness only supports isolated
or forked workspaces, this skill is unsupported as written; do not fake
support by treating advisory output as an implemented slice.

## Repo Workflow

The core protocol is harness-neutral, not repo-neutral. Use the repo's
branch workflow conventions when naming branches, creating commits, and
inspecting stack shape.

In this repo, consult the `graphite` skill for branch mechanics and use
Graphite conventions rather than inventing your own.

## Workflow

### 1. Preconditions

Read the input plan once up front. Bail and surface to the user if any
of these fail:

- The working tree is dirty. Do not stash on the user's behalf.
- The repo's branch workflow tool is unavailable. In this repo, that
  usually means `gt` is missing.
- The harness capability gate does not pass.
- After normalization, the plan yields fewer than 2 slices. Single-slice
  work should be implemented in-session instead of through this
  coordinator.

### 2. Normalize the plan

Convert the input plan into the internal `stacker-slice-manifest/v1`
shape defined in `references/runtime-contract.md`.

Required per slice:

- `title`
- `scope`
- `base`
- `validate.command`

Optional per slice:

- `constraints`
- `source_excerpt`
- `suggested_branch_name`
- `suggested_commit_subject`
- `downstream_context`

Defaulting rules:

- First slice base defaults to the repo's default branch unless the plan
  says otherwise.
- Later slice bases default to `previous_slice`.
- Validation defaults to the repo's standard green-bar command when the
  plan does not supply one. In this repo, default to `just` at the repo
  root.
- Constraints default to an empty list.

If the plan provides richer hints such as file lists, do-not-touch
lists, or concrete identifiers, preserve them as optional constraints or
notes. They strengthen verification when present, but they are not
required for normalization.

### 3. Serial slice loop

For each slice in order, do all of the following:

**a. Prepare slice context.**

- Resolve the concrete base ref for this slice.
- Choose a suggested branch name and commit subject using repo
  conventions.
- Carry forward any downstream notes from prior slices.

**b. Compose the worker brief.**

Fill `references/brief-template.md` from the normalized slice manifest
plus the current base ref and downstream context.

**c. Run one worker.**

Use the current harness's worker/delegation primitive to implement this
slice. Run exactly one worker for the current slice and wait for it to
finish before doing anything else.

**d. Require a structured handoff.**

The worker must return a `stacker-handoff/v1` payload plus short prose,
as defined in `references/runtime-contract.md`.

**e. Verify before advancing.**

Do not skip any of these checks:

1. `status == "ok"` and `validation.exit_code == 0`.
2. The reported branch/ref resolves locally and its resolved head equals
   the handoff's `head_sha`.
3. `git diff <base>..<reported-branch> --stat` looks plausibly in
   scope.
4. Skim the full diff for obvious scope drift.
5. If optional constraints were supplied, check them now.
6. Stash any `downstream_notes` for the next slice's brief.

Only after those checks pass may the coordinator continue to the next
slice.

### 4. Stop conditions

After the final slice passes verification, print a concise stack
summary and stop.

Include one line per slice with:

- branch name,
- head SHA,
- validation command and exit code, and
- a compact changed-files or shortstat summary.

Optionally show the stack shape using the repo's normal workflow tool.
In this repo, `gt ls` is the natural confirmation step.

End by telling the user to submit or push manually if they want to move
the stack upstream.

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
