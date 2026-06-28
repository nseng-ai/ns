**Direction: SDL house-style CLI presentation lives outside Clinkr in a dedicated theme package.**

Getting to: Clinkr is the generic command/runtime substrate; `@sdl/cli-theme` owns palette, glyphs, result blocks, status lines, table/layout primitives, and house-style presentation grammar.

What you see now: the package extraction, Slot navigation migration, Flow outcome mapping, warning, caps, table, and status-intent assessments have landed; parked stream/redesign/hidden-surface items are not current implementation slices.

Avoid: adding new SDL-specific presentation primitives to Clinkr; moving caps/IO/exit/domain policy into the theme package; broad outcome/table/status redesign without a new concrete surface and follow-up rationale.

Active slice: final reconciliation/closure if the parked items remain intentionally parked.
