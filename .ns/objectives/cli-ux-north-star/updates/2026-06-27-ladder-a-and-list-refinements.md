# Ladder A chosen; first by-feel list refinements

## Summary

First round of dialing in the north star against the throwaway harness, in a real terminal:

- **Palette ladder decided: approach A (full ladder)** — truecolor → 256 → 16 → mono. Chosen by
  feel over B (modern-only); the extra degradation machinery is accepted as worth it.
- **`(x)` outstanding-changes marker** moved into a fixed-width gutter so the `LATEST UPDATE`
  column starts at the same column on every row — timestamps no longer shift when the marker is
  present.
- **Human-relative timestamps** — `objective list` now renders "7 hours ago" / "2 days ago" /
  "2 weeks ago" instead of raw ISO. Added `time.ts` (`relativeTime`) with an anchored fixture
  "now" so prototype output stays stable. The raw ISO stays on the future `--format json` path.

## Objective Impact

- Open Question "Approach A (full ladder) vs B (modern-only)" is **resolved: A**. Updated in
  `objective.md`. This also settles the related over-engineering risk in favor of the full ladder.
- Roadmap row 2 (dial-in + sign-off) is progressing but stays open: the ladder call is made;
  full sign-off on chrome, glyph set, palette intents, and streaming behavior is still pending.
- Two concrete list-surface decisions are now baked into the prototype (gutter alignment,
  relative time) and should carry into the rebuilt `objective list`.

## Follow-Ups

- Continue the by-feel pass on the remaining sign-off items: chrome details, the glyph set, the
  semantic palette intent values, the branded accent color, and the streaming (flow submit)
  behavior. Still a human sign-off, not self-certifiable.
- The branded accent color value remains an open question (placeholder in `theme.ts`).
- Once fully signed off, the relative-time + gutter behavior and ladder A inform the real clinkr
  `theme` foundation and the `objective list` rebuild (ISO preserved for machine mode).
