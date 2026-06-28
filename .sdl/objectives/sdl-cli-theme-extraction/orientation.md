**Direction: SDL house-style CLI presentation lives outside Clinkr in a dedicated theme package.**

Getting to: Clinkr is the generic command/runtime substrate; `@sdl/cli-theme` owns palette, glyphs, result blocks, status lines, table/layout primitives, and house-style presentation grammar.

What you see now: the package extraction has landed in the worktree, but follow-on consolidation assessments are still open; historical Objective updates may still mention `@sdl/clinkr/theme` as provenance.

Avoid: adding new SDL-specific presentation primitives to Clinkr; moving caps/IO/exit/domain policy into the theme package without assessment; broad outcome/table/navigation redesign in this Objective's follow-up slices.

Active slice: rebaseline duplication/consolidation candidates against the new `@sdl/cli-theme` boundary.
