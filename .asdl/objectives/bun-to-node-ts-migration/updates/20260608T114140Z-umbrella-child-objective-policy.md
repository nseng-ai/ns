# Umbrella Child Objective Policy

## Summary

The Bun-to-Node TypeScript migration Objective was reframed from a broad implementation backlog into an umbrella Objective. Its active roadmap now tracks creation of focused child Objectives for tooling contract, pnpm workspace migration, Vitest migration, Node runtime compatibility, and Bun-reference reconciliation.

## Objective Impact

The umbrella now owns sequencing and child Objective creation only. It should not carry implementation progress, validation evidence, PR status, parking decisions, or closure for those child slices after they are created. The intended child slug convention is `bun-to-node-ts-migration-<topic>`, and `objective-next` may execute one child-creation item at a time after preview and confirmation.

## Follow-Ups

- Create the first child Objective from the unchecked roadmap when ready.
- Keep slice-specific decisions such as CLI execution policy, `node:sqlite` warning handling, docs-site sequencing, and template scope inside the relevant child Objective rather than this umbrella.
