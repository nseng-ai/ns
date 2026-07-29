# Command and Outcome Contract Established

## Summary

The command-definition slice establishes the quarantined public contract independently of routing. Context-free and contextful structured definitions use truthful handler signatures selected by `requiresContext: true`; Zod schemas drive request and result inference; field annotations remain in Clinkr's private registry; and command-level human and Markdown renderers derive presentation from typed success data.

`resultSchema` is the only typed outcome payload. Success data is validated against it, while negative, failure, and usage-error outcomes use fixed shapes with optional unvalidated diagnostic data. One `success | negative | failure | usage-error` vocabulary serves the runtime discriminant and wire status, and envelope construction is the source for machine-schema publication.

## Objective Impact

This advances the roadmap's command/outcome-contract portion of the active implementation stack under the temporary `@nseng-ai/clinkr/app` quarantine. It provides the type and runtime boundary on which filesystem execution and executable README fixtures build without changing the legacy package root.

PR #3951 carries this slice and remains open; this update records branch evidence, not landed trunk state.

## Follow-Ups

- Preserve these contracts while the filesystem-backed app and executable README fixtures build above this branch.
- Complete topology, routing, raw dispatch, and legacy deletion in their dependency-ordered slices.
