# areg mutation commands accepted as scope from the skill-audit push-down dispositions

## Summary

The 2026-07-12 full-fleet skill audit (tracked in the `skill-audit-remediation`
Objective) identified a HIGH CLI push-down finding in the `skill-management` skill: the
add-local bootstrap (install, `rm -rf`/`ln -s` symlink swap, lockfile normalization,
hash validation, multi-command verify), its internal variant, remove, and rename are
deterministic multi-step shell pipelines — 7+ steps, 5+ tool calls — hand-run from
prose, enforcing validation rules (`computedHash` 64-hex, repo-relative `source`) that
`areg check` already enforces in code. The audit's frontload decisions (that record's
`updates/20260712T171838Z-decision-frontload-and-runner-policy.md`, item 9) accepted the
candidate and directed it here as a note on this umbrella rather than a new Objective:
teach areg the mutations (shape sketch: `areg skill add-local <name>`, `remove-local`,
`rename <old> <new>`, JSON `success`/`error` envelopes), collapsing each skill-management
workflow to one command and retiring roughly 100 lines of lockfile/symlink prose.

## Objective Impact

Adds an accepted follow-on row to this umbrella's roadmap: areg gains first-party skill
mutation commands. This is areg-surface work (areg today is inspect/check/doctor only),
distinct from the parked harness-artifacts local-logic push-down row — that row moves
shared read logic down a layer on a second-consumer trigger, while this row adds
mutation commands to areg itself; if implementation shows they share internals, the
implementing slice may consolidate deliberately. No provisioning behavior changes.

## Follow-Ups

- New `## Work` row added alongside this update; implementation is unscheduled and
  follows this umbrella's normal slice discipline.
- When implemented, retire the corresponding `skill-management` SKILL.md/commands.md
  workflow prose and verify with `areg check` plus `areg skill show`.
