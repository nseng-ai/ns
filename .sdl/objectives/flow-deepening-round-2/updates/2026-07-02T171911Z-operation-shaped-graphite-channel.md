# Operation-shaped the Graphite command channel

## Summary

The channel row landed via an autorun runner step (commit `2163da469` on
`flow-operation-shaped-graphite-channel`, stacked on
`update-flow-land-domain-extraction`; provenance trailer
`Objective-Runner-Step: flow-deepening-round-2`). The
`LandGraphiteCommandChannel` interface now owns operation specs instead of
argv: the seven exported arg-builders and the `formatGraphiteCommand` display
pairing are folded into specs, `runRaw` is gone from the interface, the
caller-side `maintenance.kind === "optional-descendant"` method selection is
absorbed, and `deleteFinalLocalBranch` is reconciled with the spec shape.
`src/land-stack/graphite-metadata-command.ts` was deleted into the channel —
the fold-in the shims row had earmarked for this slice.

Evidence: zero `runRaw` and zero arg-builder references remain in flow
src/test (grep-verified by the parent, not just child-claimed); land scenario
tests pass with unchanged `pi.exec` argv assertions
(`land-stack-command-scenarios.test.ts` untouched by the diff); a unit test
shows adding a new `gt` mutation needs only a spec entry. The step reported
the full Definition of Progress suite green; the parent independently re-ran
the flow package suite (47 files / 419 tests, pass) and `just ts-check`
(pass). `sdl-flow/api` untouched.

## Objective Impact

- The first of the two channel completion criteria facts now holds in code:
  a new `gt` mutation on the land path is one spec entry — no new channel
  method, no caller-side arg builder, no wrapper file.
- The shims row shrinks to exactly the five forwarder files;
  `graphite-metadata-command.ts` no longer needs handling there.
- The "channel seam misread" risk stays mitigated: no scripted-channel
  adapter was added; scripted `pi.exec` remains the only land test seam.

## Follow-Ups

- None beyond the existing roadmap rows. Next direct rows in order:
  `regenerate-pr --force` semantics, then the forwarder shims.
