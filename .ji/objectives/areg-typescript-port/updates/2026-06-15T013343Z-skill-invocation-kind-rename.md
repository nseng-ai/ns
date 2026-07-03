# Skill invocation kind rename

## Summary

Renamed the future `areg` skill invocation concept from `profile` to `kind` before the TypeScript implementation of this Objective row.

The Objective-local specification file moved from:

- `.asdl/objectives/areg-typescript-port/skill-invocation-profiles.md`

To:

- `.asdl/objectives/areg-typescript-port/skill-invocation-kinds.md`

Live Objective guidance now names the planned user-facing commands as `areg skill kind set`, `areg skill kind list`, and `areg skill kind show`.

## Objective Impact

The TypeScript implementation should build the feature around the `kind` noun from the start. The value names are unchanged: `normal`, `invoke-only`, `command-backed`, `ambient-only`, `mixed`, and `inconsistent`.

Legacy `areg command convert|revert|list`, Pi replacement, Codex sidecar, `disable-model-invocation`, and `user-invocable` terminology remain unchanged.

Historical dated updates intentionally retain the old `profile` wording because they record what was known at the time. This update is the durable transition point.

## Follow-Ups

- When implementing the kind-system slice, treat `.asdl/objectives/areg-typescript-port/skill-invocation-kinds.md` as the source of truth.
- If public-facing docs are recreated outside the Objective after implementation, use `kind` terminology there.
