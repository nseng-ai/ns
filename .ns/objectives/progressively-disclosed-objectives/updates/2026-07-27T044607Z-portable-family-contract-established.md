# Portable Objective family contract established

## Summary

Added the incubating `objective-list` skill with a Node-only portable implementation that inventories direct Objective records, excludes direct Closure Markers, and reports only slug-sorted `open` or `blocked` lifecycle labels. The umbrella skill now owns operation-specific look-before-use capability adaptation and portable selection/list semantics.

Removed `objective-critique` without an alias across canonical skill content, Harness Overlays, lock state, package publish extras, and live references. Registered `objective-list` as the backing skill for the existing Pi list surface and preserved command-backed exposure.

## Objective Impact

The portable-family roadmap row is now active rather than complete. Its topology and adaptation contract are established and the list workflow is proven without an Objective CLI, reducing the risk that portable behavior is only documentation over the enhanced package. The remaining work is to apply the same complete CLI-free, operation-probed contract to create, next, update, refresh, and close, then prove acquisition of all seven skills outside this checkout.

Focused Objective extension, portable fixture, Pi replacement, TypeScript typecheck, formatting, and skill-exposure checks pass. The broad `npx skills check` was attempted but failed while refreshing unrelated vendored skills; its incidental changes were discarded and do not qualify as evidence for this slice.

## Follow-Ups

- Rewrite the five remaining workflow skills around the established capability-adaptation contract.
- Add checkout-independent acquisition evidence for all seven portable skills.
- Keep richer list facts and Git freshness in the `@nseng-ai/objectives` enhancement rather than expanding the portable contract.
