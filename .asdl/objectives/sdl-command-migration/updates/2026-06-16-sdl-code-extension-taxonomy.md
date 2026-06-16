# SDL Code Extension Taxonomy

## Summary

A planning audit settled the next direction for the code lifecycle migration: build the target family as a project-local SDL example extension and use it to develop the SDL extension API. The canonical future Pi taxonomy for the family is `/sdl:code:*`, not the current `/code:*` namespace.

Target commands are `/sdl:code:changes`, `/sdl:code:checkpoint`, `/sdl:code:submit`, `/sdl:code:autobranch`, `/sdl:code:autoslot`, `/sdl:code:land`, `/sdl:code:push`, and `/sdl:code:regenerate-pr`. Existing flat SDL Pi mirrors `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` remain primary alongside nested names. Existing `/code:autobranch`, `/code:autoslot`, `/code:land`, `/code:push`, and `/code:pr-regen` should be removed at their cutovers rather than retained as compatibility aliases. `pr-feedback-watch` is excluded from this code lifecycle family as review workflow, and `preview-url` is excluded as dev/deployment tooling.

## Objective Impact

The Objective no longer treats flat SDL/Pi command names as the only first-pass migration target. Flat SDL CLI commands can remain current CLI shape, but the Pi code lifecycle taxonomy now targets `/sdl:code:*`, with the command family serving as an example extension and SDL extension API proving ground.

The roadmap now separates the completed taxonomy audit from the implementation work: a new open row tracks building `/sdl:code:*` as the project-local SDL example extension and API driver, while existing migration rows now use the settled nested Pi names and the hard-cutover policy for old `/code:*` surfaces.

## Follow-Ups

- Implement `/sdl:code:*` command registration and extension API improvements in bounded slices, starting with non-mutating or lower-risk command shapes where useful.
- Keep flat `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` primary while adding nested names for the code lifecycle family.
- Remove old `/code:*` surfaces in the same slices that introduce their `/sdl:code:*` replacements.
- Treat review workflows such as `pr-feedback-watch`, `pr-address`, and `stack-address` as a separate taxonomy decision outside `/sdl:code:*`.
