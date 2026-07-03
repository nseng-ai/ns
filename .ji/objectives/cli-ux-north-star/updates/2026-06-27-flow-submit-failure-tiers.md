# flow submit failure block: three-tier prominence

## Summary

Dialed in the `flow submit` failure presentation by feel in a real terminal (`flow-submit
--variant inplace --fail` against the throwaway harness). The failure block now reads in three
visual tiers instead of "bold headline over a uniformly dim transcript":

- **Headline** — `✗ <summary>` in bold + error color (unchanged; bold survives mono).
- **Cause lines** — the salient transcript lines (`error:` / `rejected` / `fatal:` / `denied` /
  `abort`) render at **normal foreground weight**, so the actual remote error reads at a glance.
- **Plumbing** — the rest of the transcript (destination URL, refspec echoes) and the
  `full transcript:` path stay **dim** as supporting context.

We first tried error-coloring the cause lines; that was too much red. Normal foreground brightens
them out of the noise without piling on more error color — the headline stays the only red line.

Implementation (throwaway harness): `render.ts` `failureBlockLines` + a new
`isSalientTranscriptLine` classifier.

## Objective Impact

- Roadmap row 2 (dial-in + sign-off) advances: the `flow submit` failure surface is now settled by
  feel. Row 2 stays open — streaming cadence/spinner + log-tail feel, append-vs-inplace default,
  and the deliberate glyph-set pass are still pending before full sign-off.
- The three-tier failure grammar (headline / cause / plumbing) should carry into the rebuilt
  `flow submit` on the clinkr foundations.

## Follow-Ups

- Next by-feel decisions: streaming cadence/spinner + log-tail readability, append-vs-inplace as
  the default streaming presentation, then the glyph-set pass.
- A salient-line classifier by string matching is fine for the prototype; the real renderer should
  decide how robust the `error:`/`rejected` detection needs to be.
