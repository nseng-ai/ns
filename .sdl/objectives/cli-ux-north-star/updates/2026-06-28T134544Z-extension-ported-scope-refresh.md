# Extension-ported scope gate refresh

## Summary

Refreshed `cli-ux-north-star` against current branch `add-extension-ported-scope-gate` at `5c16b4ad8c40c3c5117d1a82ba1a4847a6528dd4`.

Provenance: objective-refresh basis target=5c16b4ad8c40c3c5117d1a82ba1a4847a6528dd4 from=bcd128bc89ec455d1086b707ee8220361966f236

Verified the new scope gate is present in the durable Objective record: the rollout now targets only command surfaces that have already been ported to the SDL extension architecture, and unported/standalone surfaces are marked extension-gated until a later eligibility pass. Current eligible command-face families are Flow, Objective, Slot, and Handoff.

Material PR evidence:

- PR #2276: Scope CLI UX audit to extension-ported command faces — current/open PR for the scope-gate refresh; Graphite reports the branch as ready to merge as a stack, and GitHub reports the PR open with in-progress checks at refresh time.

## Objective Impact

- Confirms the Objective no longer treats all first-party human-facing CLI output as active migration scope.
- Confirms `cli-surface-audit.md` is a moving eligibility inventory: it must be rechecked before each migration batch and after material `sdl-extension-architecture` milestones.
- Confirms standalone/unported surfaces such as `packagechk`, `vibechk`, `roaster`, `areg`, `brmem`, `sdl shell`, and `enriched-plan` are not active UX migration targets until their command surfaces port.

## Follow-Ups

- Before the next UX migration batch, re-run the eligibility pass against the current SDL extension / Capability command-face inventory.
- If more command families port through `sdl-extension-architecture`, update `cli-surface-audit.md` first, then decide whether this Objective or a follow-on owns their house-style migration.
