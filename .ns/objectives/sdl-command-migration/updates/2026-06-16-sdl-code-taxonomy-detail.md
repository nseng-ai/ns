# SDL Code Taxonomy Detail

## Summary

After PR #1600 was submitted with the initial `/sdl:code:*` taxonomy update, the Objective needed more durable detail about what that taxonomy means. The Objective now contains a dedicated `## Code Lifecycle Taxonomy` section with the canonical mapping from current surfaces to target `/sdl:code:*` commands, the explicit excluded commands, and the reason this family is also the project-local SDL example extension/API driver.

The expanded roadmap guidance clarifies that the first implementation slice can prove nested Pi registration for existing SDL commands (`changes`, `checkpoint`, `submit`) while keeping their flat `/sdl:*` mirrors primary, and that later slices should use `autobranch`, `autoslot`, `land`, `push`, and `regenerate-pr` to prove option parsing, confirmation hooks, live output, mutation safety, and CCC delegation seams.

## Objective Impact

This does not complete another migration row or change the settled command taxonomy. It makes the Objective more actionable for future implementers by recording the exact current-to-target mapping, the API-learning purpose of the example extension, and the guardrail that `/sdl:code:*` must not become a cosmetic alias layer.

The Objective remains open because the `/sdl:code:*` family still needs implementation, old `/code:*` surfaces still need hard-cutover slices, and the SDL extension API still needs to be developed through those slices.

## Follow-Ups

- Use the mapping table in `objective.md` as the source of truth when implementing nested Pi command registrations.
- For each `/sdl:code:*` slice, state which SDL extension API behavior it proves or extends.
- Keep existing Semantic Updates immutable; future corrections should be recorded as new updates.
