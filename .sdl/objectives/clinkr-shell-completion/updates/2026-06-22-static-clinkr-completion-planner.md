# Static Clinkr Completion Planner

## Summary

The first implementation slice chose the pure static boundary and added a tested Clinkr-owned completion planner. Clinkr now exposes `ClinkrGroup.complete()` plus the `@sdl/clinkr/completion` subpath for tokenized completion over a static command surface plan. The planner derives candidates from Clinkr registration metadata and `SurfacePlan` data without invoking command handlers and without importing SDL.

The static engine covers visible commands/groups, command options, root-only framework options (`--runtime`, `--version`, `-V`), help options, rendered-command framework options (`--format`, `--shell-exit-code`), `--json-schema`, enum option values, equals-form enum values, and positional enum values. Hidden groups are not suggested but remain traversable when the user has explicitly typed their path, matching the existing hidden-but-invocable command behavior.

## Objective Impact

This completes the architecture-boundary row for the first slice: Clinkr owns the pure static planner/API, while visible `completion <shell>` helpers and hidden shell resolver commands remain deferred to shell bridge / SDL integration work. It also completes the static Clinkr completion engine row for the covered v1 metadata. SDL extension discovery/loading policy remains outside Clinkr.

## Follow-Ups

- Add bash, zsh, and fish bridge generation on top of the pure planner instead of embedding stale command snapshots.
- Design the resolver output contract and warning/stderr behavior before wiring SDL completion.
- Keep dynamic/custom runtime completion hooks as a separate decision; this static planner does not yet model command-owned async providers.
