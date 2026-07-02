# @sdl/handoff

Handoff Capability package for directed Handoff Artifacts stored in Branch Memory.

`@sdl/handoff` owns the Handoff Domain Core, the curated `@sdl/handoff/api` Capability API, and SDL command leaves exposed through the portable command face:

```text
sdl handoff list [--branch <branch>|--all] [--include-deleted]
sdl handoff pickup [--branch <branch>] <slug>
sdl handoff create --slug <slug> [--branch <branch>] [--file <path>]
sdl handoff delete [--branch <branch>] [--yes] <slug>
sdl handoff gc [--dry-run|--force]
```

Pi commands and skills remain presentation/authoring adapters over this capability; Branch Memory details are technical storage evidence, not the default user model.
