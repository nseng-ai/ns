# Kernel-to-SDK Rename Executed

## Summary

The extracted `execute-kernel-sdk-rename-spec` autoobjective completed and
closed on 2026-07-12. The spec verification sweep and spec items 1–4 landed
as five local Graphite branches stacked on `unpark-kernel-sdk-rename-row`
(`kernel-sdk-rename/spec-sweep` → `rename-package` → `root-entry-point` →
`rename-ns-fold` → `glossary-and-docs`), one implementation commit per
slice, with the item 5 closeout committed on the top slice. The stack
remains local and unsubmitted.

## Objective Impact

The parent roadmap's **Spec the kernel → sdk rename** row is fully
resolved: the ratified spec was executed. `@nseng-ai/kernel` is now
`@nseng-ai/sdk` at `ts/packages/sdk/`; the author API is the package root
(no `@nseng-ai/sdk/sdk` stutter, `publicPluginApi: ["."]`); the
checkout-free fold is `@nseng-ai/ns/sdk` +
`@nseng-ai/ns/sdk/{cli,command-io,context}`; live prose is sdk-throughout
with `kernel` recorded as Avoid anti-vocabulary. Per-slice root `just` runs
passed, the top slice passed the integration lane, checkout-free assembly
and descriptor loading were exercised, and the trust-nothing closeout left
a fully accounted 162-hit kernel inventory with zero stale live claims and
zero unexplained scope extras.

## Follow-Ups

Operator-only npm actions (claiming `@nseng-ai/sdk`, deprecating the
published `@nseng-ai/kernel@0.1.2`) remain per ADR 0035. Two parked naming
decisions were deliberately not taken: the `KernelCommandCompletion*`
exported type aliases, and the north-star/documentation product-vision framing
of ns itself as "the kernel". The implementation stack awaits normal human
review and submission.
