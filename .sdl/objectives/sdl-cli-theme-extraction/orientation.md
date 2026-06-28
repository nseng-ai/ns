**Direction: SDL house-style CLI presentation lives outside Clinkr in a dedicated theme package.**

Getting to: Clinkr is the generic command/runtime substrate; `@sdl/cli-theme` owns palette, glyphs, result blocks, status lines, table/layout primitives, and house-style presentation grammar.

What you see now: the package extraction and Slot navigation migration have landed, but non-Slot consolidation assessments are still open; historical Objective updates may still mention `@sdl/clinkr/theme` as provenance.

Avoid: adding new SDL-specific presentation primitives to Clinkr; moving caps/IO/exit/domain policy into the theme package without assessment; broad outcome/table/status redesign in this Objective's follow-up slices.

Active slice: assess remaining outcome, warning, caps, table, and status-intent candidates conservatively against the `@sdl/cli-theme` boundary.
