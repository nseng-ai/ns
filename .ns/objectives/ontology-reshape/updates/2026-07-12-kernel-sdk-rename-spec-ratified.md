# Kernel → SDK rename grilled and ratified; execution extracted to an autoobjective

## Summary

The "Spec the kernel → sdk rename" grilling row ran 2026-07-12 as a live
creation-session grill and its mechanics were ratified as ADR 0035 plus the
execution spec `docs/wayfinding/ontology-reshape/kernel-sdk-rename-spec.md`
(eight-point vehicle contract). Decisions: `@nseng-ai/kernel` → `@nseng-ai/sdk`
at `ts/packages/sdk/`, the brand finally matching the package's own `ns.tier`;
the author API moves from the `./sdk` subpath to the package root, resolving the
three-way `sdk` collision without an `@nseng-ai/sdk/sdk` stutter
(`publicPluginApi: ["."]`); the `@nseng-ai/ns` folded surfaces become
`@nseng-ai/ns/sdk` + `@nseng-ai/ns/sdk/{cli,command-io,context}`; prose goes
sdk-throughout — "the SDK" absorbs the runtime-machinery concept with no
separate runtime noun minted, and kernel becomes anti-vocabulary in live prose
with immutable history untouched.

Two discoveries sharpened the spec during grounding: `@nseng-ai/kernel@0.1.2`
is live on npm (`@nseng-ai/sdk` unclaimed) — registry work was ruled
operator-run, never runner work; and the module loader binds the runtime string
literal `"@nseng-ai/kernel/sdk"` as its jiti virtual-module key, so descriptor
loading must be exercised — not just typechecked — after each rename step.

Execution was extracted at creation to the `execute-kernel-sdk-rename-spec`
autoobjective (mirrored Objective Edge) via the reshaping handoff vehicle's
New-Objective hatch, invoked deliberately by the user for autonomous runner
pursuit: a spec verification sweep row plus the four rename slices and closeout,
stacked local branches, `just` green per slice, no submit. No in-record
execution task row was graduated; the grilling row is `[~]` and resolves when
that record closes.

## Objective Impact

- Roadmap: the grilling row carries the resolution note and extraction pointer;
  the structural `## Parked` heading the 2026-07-12 unpark edit dropped was
  restored (empty). The pre-existing `ns objective check` heading violations in
  `updates/2026-07-11-layering-reshape-executed.md` were left alone — updates
  are immutable.
- Record Frontmatter: mirrored edge added to `execute-kernel-sdk-rename-spec`.
- The "no new kernel-brand prose" restraint now has an end state: it holds
  until the extracted record's glossary slice lands the sdk-throughout rewrite.
- This is the third reshaping through the handoff vehicle and the second use of
  the New-Objective hatch; the grill-inside-objective-creation variant (the
  creation interview doubling as the grilling session) is new method-log
  material for the future portable skill.

## Follow-Ups

- Run `execute-kernel-sdk-rename-spec` via `objective-autorun` /
  `objective-runner-step`; its closure resolves this record's grilling row.
- Operator, at next publish: claim/publish `@nseng-ai/sdk`, optionally
  deprecate `@nseng-ai/kernel@0.1.2`.
- Re-enumerate the spec's 2026-07-12 volatile inventories at execution time
  (the record's sweep row owns the first pass).
