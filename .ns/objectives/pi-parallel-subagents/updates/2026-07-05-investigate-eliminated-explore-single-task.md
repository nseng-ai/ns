# Investigate Eliminated; Explore Accepts Single-Task Investigations

## Summary

`/investigate` was eliminated in both Pi and Claude Code rather than migrated. There is no alias, tombstone wrapper, or deprecated forwarding path; `explore` is the replacement surface.

## Objective Impact

`@nseng-ai/ns-pi-subagents` now accepts one or more explore tasks. A single task covers one deep read-only investigation question with the same explorer evidence contract and result shaping as multi-task exploration.

The Pi parity row for `/investigate` was deleted outright because the command surface no longer exists. The old Pi investigator extension, project-local adapter, agent definition, tests, and Claude Code investigator/skill surfaces were removed.

## Cross-Objective Note

This moots the dated `pi-host-decomposition` inventory row that treated `src/investigate/` as a standalone tool candidate. Those historical records were intentionally left unchanged.

## Validation Evidence

Implementation validation passed in this slice:

```bash
corepack pnpm@11.8.0 --dir ts --filter @nseng-ai/ns-pi-subagents run check
corepack pnpm@11.8.0 --dir ts --filter @nseng-ai/ns-pi-subagents run test
corepack pnpm@11.8.0 --dir ts --filter @nseng-ai/pi run check
corepack pnpm@11.8.0 --dir ts --filter @nseng-ai/pi run test
just areg-check
just ts-format-fix
just
```

The first `just` run exposed an `oxfmt --check` formatting issue in `packages/extensions/ns-pi-subagents/test/explore/extension.test.ts`; `just ts-format-fix` fixed it, and the rerun passed.
