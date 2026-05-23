# PR 3 Remaining Consumer Migration Complete

## Summary

PR 3's remaining-consumer migration slice is complete under landed-state semantics. The working-tree diff on `migrate-asdl-reviewer-and-slots-to-prgateway` against `origin/migrate-asdl-pr-address-to-pr-gateway` switches reviewer contexts and publication flows to the unified PR gateway vocabulary, moves reviewer scenario and plugin smoke wiring to the PR fake gateway, updates slots GC to distinguish lookup misses from gateway failures, and removes the remaining live conformance issue-gateway fixture wiring.

Verification: old-name audit passed; targeted reviewer, slots, plugin, fake-gateway, and live-conformance collection tests passed; full `just` passed.

## Objective Impact

This marks roadmap PR 3 complete. `asdl-reviewer`, `asdl-slots`, the remaining plugin smoke coverage, and live GitHub conformance wiring no longer depend on the old issue-gateway consumer path.

The only remaining roadmap work is PR 4: delete the old compatibility names and finalize context/docs/Objectives cleanup after the stack no longer needs temporary parallel API names.

## Follow-Ups

- Start PR 4 by deleting the old compatibility API names and their parallel-path tests.
- Finalize `packages/asdl-core/CONTEXT.md` and `CONTEXT-MAP.md` only after the old names are actually gone.
- Update the `repo-ontology` Objective only if the final deletion/docs cleanup materially changes its Gh-context evidence or follow-up plan.
