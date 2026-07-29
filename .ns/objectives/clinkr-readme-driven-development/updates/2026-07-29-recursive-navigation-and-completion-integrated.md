# Recursive Navigation and Completion Integrated

## Summary

Current PR #3980 integrates recursive terminal navigation and app-owned completion into the quarantined `ClinkrApp` runtime. Filesystem and programmatic groups now execute through one navigator with aliases and group defaults; selected-route help, schema output, and framework arguments use the same traversal; raw commands retain ownership of their post-route argument tail.

Completion now uses the app topology and canonical command-surface plan rather than a parallel legacy representation. The public app supports recursive static and provider-backed completion plus optional shell integration. Opening a filesystem scope imports the metadata or group definitions needed to enumerate its immediate children, while command definitions remain selected-route lazy.

## Objective Impact

This materially advances the canonical topology, single-runtime, legacy-deletion, and tip-of-stack README evidence rows without completing them. The branch demonstrates one-owner subtrees, sibling command/group/alias collision rejection, transactional selected-command loading, completion-provider fallback, and executable README fixtures for recursive routes, group discovery, completion, and contextful commands.

The combined navigation and completion scope is intentional: bug fixing created conflicts in their shared command-surface code, and one plan for parsing, help, and completion removes duplicate representations. Remaining work includes strict topology contract completion, removal of residual legacy outcome/rendering/interaction ownership, package qualification, consumer acceptance, and the rest of the README evidence assessment.

- PR #3980: Add recursive Clinkr navigation runtime — open PR evidence for recursive navigation, app-owned completion, shared surface planning, and README fixtures.

## Follow-Ups

- Finish the strict topology and metadata contract rather than treating current navigation coverage as full topology qualification.
- Reconcile remaining legacy runtime dependencies and complete the implementation-contract checklist before marking the single-runtime row complete.
- Continue the per-example README testing assessment at the implementation-stack tip.
