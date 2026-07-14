# Submit-check marker and CLI contract completed

## Summary

Completed the submit pre-check contract slice without introducing recovery behavior or a
general validation surface. `FLOW_SUBMIT_CHECK_FAILURE_MARKER` is defined once beside the
submit-check failure formatter, exported through `@nseng-ai/flow/api`, and has exact raw
value `NS_FLOW_SUBMIT_CHECK_FAILURE`. The formatter puts that marker first and both the
settled non-TTY path and TTY matrix path retain deterministic presentation, so model
interpretation cannot rewrite the contract.

The public submit vocabulary now says **pre-submit checks** and the parser-backed
`--no-checks` option replaces the unreleased `--no-hooks` spelling without an alias.
Internal extension-mechanism names, the `flow.submit.pre` hook point, and the `"hooks"`
phase key remain unchanged. Check failure still stops before checkpointing or Graphite
submission.

Implementation exposed one Clinkr rendering distinction that the original plan did not
capture. The deterministic failure message always starts with the raw marker, but human
stderr renders that line differently by coarse result class: check exit `1` remains a
negative process exit `1` with the raw marker line, while every other nonzero check exit
remains a failure process exit `2` with exact first line
`error: NS_FLOW_SUBMIT_CHECK_FAILURE`. Structured `data.exitCode` retains the mapped check
code in both cases. The README draft and execution plan now document both exact lines so
future recovery matches complete framework-rendered lines rather than prose.

## Objective Impact

The **Submit pre-check contract slice** roadmap row is complete. Focused Flow tests cover
the public API value, formatter position, both Clinkr result classes, structured check
codes, deterministic no-model behavior, parser-backed skipping, matrix vocabulary, and
abort-before-mutation behavior. Full TypeScript tests and the repository `just` entrypoint
pass. Manual help confirms `--no-checks` and no `--no-hooks`; point inspection confirms
`flow.submit.pre` remains the installed hook point.

The stable-marker assumption remains supported with the renderer-aware exact-line rule.
The Objective stays open: submit-check recovery, adopter point documentation, audit-driven
genericization slices, and README promotion remain outstanding.

## Follow-Ups

- Implement the `flow.submit.pre.recovery` prompt point and Pi completion hook against both
  exact Clinkr-rendered marker lines.
- Keep repository-specific recovery policy in consumer configuration, not Flow package
  code.
- Continue the adopter documentation, audit-resolution, and README-promotion roadmap rows
  without adding a standalone validation command or general gate taxonomy.
