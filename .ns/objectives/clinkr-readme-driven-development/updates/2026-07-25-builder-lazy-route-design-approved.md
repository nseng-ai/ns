# Builder and Lazy-Route Design Approved

## Summary

The focused design review approved Clinkr's foundational clean-break direction: private-constructor async app creation, framework-supplied builders returning immutable nodes, a transparent app root, app-only execution and completion, and recursively lazy named routes backed by cheap metadata and one shared loader. The review also settled transactional loading/caching, builder imports, context ownership, Foundation integration, and migration dependency order.

No TypeScript implementation occurred in this update. Existing future-dated updates were left unchanged; this Semantic Update uses the current repository date.

## Objective Impact

The Objective contract, roadmap, audit, decision record, and README draft now treat the builder/lazy-route model as approved and bounded. Earlier constructor and root-object examples are explicitly superseded. The migration remains a coordinated hard cut with no compatibility layer or parallel public models.

The broad discussion work remains open because `position` versus `index`, the `md` alias, and other outcome/raw/rendering/completion-error dispositions are not settled by this review.

## Follow-Ups

- Implement in dependency order: Clinkr internals/tests, old API replacement, Foundation, SDK/catalog lazy routing, remaining CLIs/testing, obsolete routing/API deletion, then README promotion.
- Keep mounted feature groups non-executable and migrate request-specific extension loading behind Clinkr lazy routes.
- Discuss and settle the remaining disputed contract items before implementing them.
- Consider a higher-level filesystem-routes API only later; it must compile to the builder model rather than replace it.
