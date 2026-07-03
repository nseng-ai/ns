# @ns/handoff

Handoff Capability package for directed Handoff Artifacts stored in Branch Memory.

`@ns/handoff` owns the Handoff Domain Core, the curated `@ns/handoff/api` Capability API, and ji command leaves exposed through the portable command face:

```text
ns handoff list [--branch <branch>|--all] [--include-deleted]
ns handoff pickup [--branch <branch>] <slug>
ns handoff create --slug <slug> [--branch <branch>] [--file <path>]
ns handoff delete [--branch <branch>] [--yes] <slug>
ns handoff gc [--dry-run|--force]
```

Pi commands and skills remain presentation/authoring adapters over this capability; Branch Memory details are technical storage evidence, not the default user model.
