# Slot Shell Install Filesystem Ownership

## Summary

Runner checkpoint `d4852ed036009c407b54d4d747e26fbcb33ab5dc` moved `slot shell install` command assembly, schemas, handler, renderer, and marker constants into its filesystem route. The now-empty shared shell command array and name-based loader fallback were removed.

## Objective Impact

The dedicated Phase 1 `slot shell install` ownership row is complete while preserving modern SDK outcomes and confirmation behavior. Production-filesystem scenarios cover help and schema, cancellation, success, and unsupported-shell behavior through a fake host-confirmation seam. Focused Slot checks, all 364 Slot tests, style guard, full `just`, and `git diff --check` passed. Phase 1 cutover and Phase 2 remain untouched.

## Follow-Ups

- Land the separate Phase 1 cutover after verifying every command route now owns its definition.
- Delete only the obsolete duplicate topology named in the cutover row.
- Preserve the temporary legacy-outcome adapter until Phase 2.
