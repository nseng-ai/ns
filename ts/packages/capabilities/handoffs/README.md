# @nseng-ai/handoffs

Handoff Capability package for directed Handoff Artifacts stored in Branch Memory.

`@nseng-ai/handoffs` owns the Handoff Domain Core, the curated `@nseng-ai/handoffs/api` Capability API, and ns command leaves exposed through the portable command face:

```text
ns handoff list [--branch <branch>|--all] [--include-deleted]
ns handoff pickup [--branch <branch>] <slug>
ns handoff create --slug <slug> [--branch <branch>] [--file <path>]
ns handoff delete [--branch <branch>] [--yes] <slug>
ns handoff gc [--dry-run|--force]
```

Pi commands and skills remain presentation/authoring adapters over this capability; Branch Memory details are technical storage evidence, not the default user model.
