**Direction: SDL house-style CLI presentation moves out of Clinkr into a dedicated theme package.**

Getting to: Clinkr is the generic command/runtime substrate; the new SDL CLI theme package owns palette, glyphs, result blocks, status lines, table/layout primitives, and house-style presentation grammar.

What you see now — legacy/mid-migration, do not copy: SDL house-style primitives still live under `@sdl/clinkr/theme`, and several migrated commands import that subpath directly.

Avoid: adding new SDL-specific presentation primitives to Clinkr; moving caps/IO/exit/domain policy into the theme package without assessment; broad outcome/table/navigation redesign in the first extraction slice.

Active slice: extract the package first, then assess each duplication/consolidation candidate separately.
