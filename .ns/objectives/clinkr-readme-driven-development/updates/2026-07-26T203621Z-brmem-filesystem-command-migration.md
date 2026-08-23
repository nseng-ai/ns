# Brmem Filesystem Command Migration

## Summary

Brmem now authors its command tree through Clinkr's filesystem structure instead of the legacy mutable `ClinkrGroup` registration bridge. The migration preserves Foundation's fresh-app lifecycle and Brmem's existing context, operation handlers, CLI entrypoint, command paths, flags, output behavior, and hidden `exec resolve-prompt` route.

The selected command definitions now explicitly declare their existing structured negative outcome data where required by Clinkr's four-status contract. Focused structure tests lock the exact route inventory, hidden `exec` group, absence of a default route, and cheap metadata import discipline.

## Objective Impact

This advances the remaining-CLI portion of the reconciliation roadmap: Brmem no longer uses `importLegacyClinkrGroupForMigration`, and its command identity and nesting now come from the approved `metadata.ts` + `command.ts` and `group.ts` filesystem shapes. The package's non-publishing local pack workflow confirmed that every runtime-discovered command file ships with `src/cli.ts`.

Validation passed for Brmem typecheck/tests, Clinkr tests, repository TypeScript format/lint/typecheck/default/integration/style-guard gates, and tarball inventory inspection. Existing unrelated lint warnings remained outside this slice.

## Follow-Ups

Continue migrating remaining CLI callers and removing the obsolete legacy registration path under the broader reconciliation row. This Brmem slice does not complete the Clinkr Objective or the full reconciled-contract verification and README-promotion work.
