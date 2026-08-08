# Whole-Payload Input Inventory Complete

## Summary

The production inventory in `docs/conventions/clinkr-whole-payload-input-inventory.md` classifies Clinkr framework `--input-json`, SDK command-owned payloads, interactive line input, raw-command ownership, the portable Saved Plan path slated for deletion, and retained command-owned non-JSON content readers.

The inventory confirms that after portable Saved Plan save is deleted, every production consumer of the shared Clinkr/SDK whole-payload surface is a finite JSON request. Brmem and Handoff retain arbitrary whole-payload content behind their domain-owned `BrmemSourceReader`; they do not require a general shared structured-command stdin capability.

## Objective Impact

The first roadmap item is complete. The finite-JSON migration assumption is confirmed, with no shared non-JSON exception that would widen the target seam. This evidence supports proceeding to the separately bounded portable Saved Plan deletion before narrowing the shared Clinkr and SDK input interfaces.

Runner checkpoint `41bb75731b7aaee8e1e29bea48357c4b30dd2202` records the inventory implementation. Its runner gate checks passed. Focused formatting and diff checks passed; the default `just` run reached and passed sanity but remained blocked by pre-existing dprint drift in `references/mcp-as-third-host.md`, which the implementation slice did not modify.

## Follow-Ups

- Delete the portable `enriched-plan-save` skill, overlays, command, exposure, tests, and stale guidance while retaining Pi and domain Saved Plan behavior.
- Then replace the bounded generic whole-stream surfaces with the smallest finite JSON-specific invocation contract.
- Keep Brmem/Handoff source readers, semantic line interaction, and raw-command ownership outside that shared migration.
