# Clinkr-Owned CLI Directory Settled

## Summary

The filesystem-first authoring guidance now recommends a self-rooted `src/cli/` application directory owned by Clinkr's layout. That directory contains only the CLI entrypoint and Clinkr route files/directories; domain operations, gateways, and reusable application modules remain outside it and are imported by selected command definitions. `src/cli/app.ts` passes `import.meta.dirname` directly as the command directory.

Brmem provides the concrete reconciliation: its entrypoint and command/group tree now live together under `src/cli/`, while Branch Memory operations and adapters remain siblings outside that framework-owned topology. Package metadata, installation wiring, tests, runtime diagnostics, and Brmem documentation follow the new path.

## Objective Impact

This sharpens the filesystem-first contract from a discovery mechanism into an explicit ownership seam. A cold adopter can identify the complete CLI surface from one directory without intermixing Clinkr route conventions with domain implementation, while the lower builder seam and alternate absolute command directories remain supported for integration constraints.

## Follow-Ups

- Use the Brmem layout as caller evidence when reviewing subsequent filesystem-command migrations.
- Preserve support for alternate absolute command directories, but teach the self-rooted `src/cli/` shape as the default during README promotion.
