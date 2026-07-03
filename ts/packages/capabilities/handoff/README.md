# @ji/handoff

Handoff Capability package for directed Handoff Artifacts stored in Branch Memory.

`@ji/handoff` owns the Handoff Domain Core, the curated `@ji/handoff/api` Capability API, and SDL command leaves exposed through the portable command face:

```text
ji handoff list [--branch <branch>|--all] [--include-deleted]
ji handoff pickup [--branch <branch>] <slug>
ji handoff create --slug <slug> [--branch <branch>] [--file <path>]
ji handoff delete [--branch <branch>] [--yes] <slug>
ji handoff gc [--dry-run|--force]
```

Pi commands and skills remain presentation/authoring adapters over this capability; Branch Memory details are technical storage evidence, not the default user model.
