# Glyph set signed off

## Summary

Reviewed the house glyph set by feel in a real terminal (static + in motion, unicode and `--ascii`)
and signed it off as-is — no changes:

| name     | unicode          | ascii   | used for                           |
| -------- | ---------------- | ------- | ---------------------------------- |
| `done`   | `✓`              | `v`     | completed phase / closed objective |
| `open`   | `●`              | `o`     | open objective / submitted-PR dot  |
| `fail`   | `✗`              | `x`     | failed phase                       |
| `skip`   | `–`              | `-`     | skipped phase                      |
| `bullet` | `•`              | `*`     | pending phase marker               |
| spinner  | `⠋⠙⠹…` (braille) | `\|/-\` | active phase                       |

Reads as one coherent family; the `●` status dot and the smaller `•` bullet are intentionally
distinct weights and don't clash. The ascii fallbacks stay legible and the braille spinner animates
cleanly at the dialed-in ~90ms repaint.

## Objective Impact

- Roadmap row 2 (dial-in + sign-off): the glyph-set pass — the last remaining by-feel item — is
  done. With chrome, palette intents, streaming behavior, and now the glyph set all settled, row 2
  is at full sign-off; marking it complete unblocks the clinkr foundations + rebuild rows.
- The signed-off glyph table is the source of truth for the real `@sdl/clinkr/theme` glyph grammar.

## Follow-Ups

- Confirm row-2 sign-off and mark it complete, then start the clinkr core capability foundation
  (`Caps` + `resolveCaps()`) per the next roadmap row.
