# Holistic submit consolidation stance

## Summary

The flow shared-code consolidation track now treats `submit.ts` as a first-class design input for every shared seam, not as a quarantined bundle to ignore until the final rewrite row. The user's correction was that helper extraction should be considered holistically across the flow group, with the eventual readable submit delegation shaping the helper boundaries from the beginning.

This does not move the full `submit.ts` rewrite earlier as an all-at-once implementation requirement. It changes the stance for sequencing: early exec/format/JSON, PR-description, and GitHub-PR seam work should map or touch `submit.ts` when needed to avoid throwaway helpers that only fit `regenerate-pr` or `autobranch`.

## Objective Impact

`objective.md` now records the holistic submit stance in Scope, Assumptions, and Risks. The flow shared-code consolidation section of `roadmap.md` now says the rows are not permission to ignore `submit.ts` until the last row. The first row is reframed from a narrow two-command helper cleanup into a holistic seam map plus foundational extraction across `regenerate-pr.ts`, `autobranch.ts`, and the `submit.ts` bundle.

The PR-description and GitHub-PR rows now name readable submit delegation as a primary compatibility constraint and co-equal consumer, while the final submit rewrite row remains the point where the checked-in bundle is replaced with hand-authored delegating source.

## Follow-Ups

- In the next implementation slice, inventory the shared helper candidates across `submit.ts`, `regenerate-pr.ts`, `autobranch.ts`, existing `flow/src/shared/`, and `@sdl/core/submit` before extracting helpers.
- Preserve the no-new-public-`@sdl/sdl/sdk` boundary unless later evidence justifies a separate public SDK promotion decision.
- Keep submit scenario coverage in the validation set whenever an early shared seam is shaped around submit behavior, even if the full submit rewrite is not yet performed.
