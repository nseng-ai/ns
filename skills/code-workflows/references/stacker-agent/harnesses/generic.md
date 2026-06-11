# Generic harness adapter

Read this file first when applying the `stacker-agent` route in any harness.

The core skill defines the protocol. This file defines the minimum
capabilities a harness must provide to execute that protocol without
lying to the user.

## Required capabilities

The harness must be able to:

- delegate exactly one worker at a time,
- wait for that worker to finish,
- pass a textual brief to the worker,
- let the coordinator inspect the live repo/worktree between slices,
- collect a structured `stacker-handoff/v1` payload, and
- send one targeted follow-up to the worker or else stop and surface.

If any of those are missing, the skill is unsupported in that harness
as written.

## Shared repo/worktree assumption

This skill assumes the worker can participate in the same repo/worktree
that the coordinator verifies between slices.

If the harness only offers isolated or forked workspaces for workers,
do not claim support unless the skill itself is rewritten to handle that
execution model. This version of the skill does not do that.

## Mapping rules

Map these abstract actions to the harness's native primitives:

- **run worker**: the harness's one-worker delegation feature. The
  same primitive is used for branch stacks and commit series; only the
  brief content differs.
- **retry worker once**: the harness's cleanest follow-up mechanism
- **wait for completion**: the harness's normal blocking wait
- **progress tracking**: optional; textual progress is enough
- **structured handoff**: parse the worker's `stacker-handoff/v1` JSON
- **repo workflow tool**: defer to repo conventions, not the harness

## Unsupported shortcuts

Do not substitute any of these:

- advisory worker output in place of implemented repo changes,
- unstructured prose in place of the handoff JSON,
- parallel workers in place of serial verification, or
- harness-specific task APIs as a dependency of the core protocol.
