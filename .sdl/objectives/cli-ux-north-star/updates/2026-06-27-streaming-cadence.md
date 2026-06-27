# flow submit streaming cadence: variable, realistic dwell

## Summary

Dialed in the in-place `flow submit` streaming cadence by feel (real terminal). The original
single uniform tick (110ms/line) made a `git push` flash by as fast as a trivial local check —
unrealistic. New model:

- **Base step dwell raised to ~220ms** (`--speed` default).
- **Variable dwell** — network round-trips (`Pushing…` / `Creating PR…` / `Updating PR…`) dwell
  ~**2.6x** the base; local validation stays at the base. The heavy steps linger like real
  round-trips.
- **Spinner decoupled from step duration** — repaints on its own ~90ms cadence, so a long network
  step holds its log-tail line while the spinner keeps ticking instead of freezing on one glyph.

A 2-PR stack submit now runs ~4s end-to-end (was ~1.5s) and reads as real work.

Implementation (throwaway harness): `render.ts` `lineDwellMs` + a `hold()` frame-spinner in
`renderInPlace`; `SPINNER_FRAME_MS` constant; `--speed` default 110→220 in `main.ts`.

## Objective Impact

- Roadmap row 2 (dial-in + sign-off) advances: streaming cadence settled. Row 2 stays open —
  append-vs-inplace default and the deliberate glyph-set pass are still pending before full
  sign-off.
- The cadence model (base dwell + per-op weighting + independent spinner repaint) is feel-only in
  the prototype; the real `flow submit` is driven by actual subprocess timing, but the rebuilt
  renderer should keep the same "spinner repaints independently of step duration" property.

## Follow-Ups

- Decide append vs in-place as the default streaming presentation.
- Deliberate glyph-set pass, then full row-2 sign-off.
