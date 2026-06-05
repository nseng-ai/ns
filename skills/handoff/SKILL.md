---
name: handoff
description: "Use for explicit handoff lifecycle, reference, diagnostics, administration, cleanup, or Pi command questions: handoff artifact, continuation focus, saved handoff, handoff namespace, copy handoff, move handoff, delete handoff, handoff gc, /handoff:create, /handoff:pickup, or /handoff:list. For save/create execution use handoff-save; for pickup/list/resume execution use handoff-load."
---

# handoff

Shared lifecycle, terminology, storage contract, safety posture, diagnostics, and administration for the handoff skill family. Each operation's command contract lives in its step skill.

A handoff is a directed, saved work-context artifact for a specific future continuation. It is not in-session compaction, not a generic transcript summary, and not a temp-file note.

## Skill family

Step entrypoints carry their own command and recovery and are runnable standalone:

- `handoff-save` — save/create/write/stash a durable handoff.
- `handoff-load` — pick up, choose, resume from, or list saved handoffs.

Use this skill for the shared model the step skills assume, and for diagnostics, cleanup, and admin work the step skills do not cover.

## Do not use this skill for

- In-session compaction or summarization with no durable handoff intent.
- Generic planning, task tracking, Objective records, or worker protocol handoffs.
- Replacing the step skills for save/pickup/list execution; it is their shared reference, not a substitute.
- Generic Branch Memory work unless it concerns namespace `handoffs` or handoff artifacts.

## Default safety posture

- Inspect before mutating.
- Use handoff vocabulary first; mention Branch Memory locators only as technical evidence, diagnostics, or recovery detail.
- Refuse collisions, overwrites, and destructive changes unless the user gives explicit replacement/destructive intent.
- Prefer deterministic `handoff` CLI and Pi surfaces when they exist; use direct `brmem --namespace handoffs` only as the storage/recovery/admin layer.
- Verify stale artifacts against current repo state before acting.
- Do not create nested keys, indexes, manifests, or old temp-directory handoff artifacts.

## References

Each step skill carries its own command, slug rule, recovery, and report fields inline, so the common path needs no reference hop. Load a reference only when the task needs the shared model or a non-happy-path flow:

- `references/lifecycle.md` — terms, lifecycle, storage contract, Pi/CLI surfaces, branch scope, and list scope. Load to keep handoff vocabulary distinct from Branch Memory technical locators.
- `references/diagnostics-admin.md` — inspection, copy/move/delete admin, garbage collection, collision handling, destructive-change safety, and future helper preference. Load for repair, cleanup, or admin.
