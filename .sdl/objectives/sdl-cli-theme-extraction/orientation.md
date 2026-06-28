**Direction: SDL house-style CLI presentation lives outside Clinkr in a dedicated theme package.**

Getting to: Clinkr is the generic command/runtime substrate; `@sdl/cli-theme` owns palette, glyphs, result blocks, status lines, table/layout primitives, and house-style presentation grammar.

What you see now: the package extraction, Slot navigation migration, Flow outcome mapping, and warning assessment have landed; caps, table, and status-intent assessments remain open.

Avoid: adding new SDL-specific presentation primitives to Clinkr; moving caps/IO/exit/domain policy into the theme package without assessment; broad outcome/table/status redesign in this Objective's follow-up slices.

Active slice: assess remaining caps, table, and status-intent candidates conservatively against the `@sdl/cli-theme` boundary.
