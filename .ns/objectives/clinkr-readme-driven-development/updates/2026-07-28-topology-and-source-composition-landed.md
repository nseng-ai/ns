# Topology and Source-Composition Owner Landed

## Summary

The canonical private recursively lazy topology and source-composition owner landed directly on `master`:

- `26d2651c7` — private `ClinkrTopology<TContext>` composing `TopologySource`s, a filesystem source adapter (directory = scope, `metadata.ts` + `command.ts` = command, `group.ts` = group), and the `createClinkrApp` runtime rebased onto it. Lazy, parent-gated scope opening; one transactional promise-cache invariant shared by scope opening, per-source opening, and selected-command loading (in-flight sharing, app-lifetime success caching, retry after evicted failure). Missing root `commandDirectory` is an error; existing-but-empty root is a valid empty state.
- `34221cfde` — composable scoped-callback programmatic source with per-source duplicate/collision rejection and cross-source composition through the same topology owner. Also removed the duplicate programmatic-builder prose from `references/README-draft.md`, resolving that review follow-up.
- `3815c178b` — legacy quarantine behind the sole `/legacy` boundary (already tracked in the roadmap's legacy-deletion row and `references/legacy-api-deletion-inventory.md`).

## Objective Impact

The topology/source-composition roadmap row is complete. Evidence against its clauses:

- Strict module/metadata shapes: zod-decoded modules plus semantic validation — non-empty description/text, duplicate-alias rejection, reserved-name conflicts (`src/app/topology.ts`), absolute `commandDirectory` (`src/app/filesystem-source.ts`).
- Disjoint ownership and collisions: command/command, command/group, group/group, alias/name, and alias/alias collisions fail with both source identities, declaration-order independent.
- No public machinery: topology, sources, and caches are private; export-surface tests pin the module contract.

This also resolves two of the four review follow-ups from `2026-07-27-initial-implementation-stack-landed-and-reviewed.md` (duplicate builder prose; semantic metadata validation in the topology owner). Still open from that list: `src/app/` dependencies on legacy `exit.ts`/`confirmation.ts` (runtime row), and deleting legacy `rawCommand(...)` at the tail cutover (legacy-deletion row).

## Next

The single `ClinkrApp` runtime row is now the frontier: the topology was deliberately built ahead of its consumers — the runtime still dispatches only the root default command; nested dispatch, groups, aliases, help/schema/completion navigation, and `reservedNames` consumption are exercised only by topology tests.
