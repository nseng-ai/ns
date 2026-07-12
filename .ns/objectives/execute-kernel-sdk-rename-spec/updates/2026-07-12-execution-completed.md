# Kernel-to-SDK Rename Execution Completed

## Summary

All six roadmap rows executed on 2026-07-12 as a five-branch local Graphite
stack on `unpark-kernel-sdk-rename-row`: `kernel-sdk-rename/spec-sweep` →
`rename-package` → `root-entry-point` → `rename-ns-fold` →
`glossary-and-docs` (closeout fixes committed on the top slice, no new
branch). One implementation commit per slice plus one closeout-accounting
commit; root `just` green per slice; the integration lane passed on the top
slice. The stack is local: no submit, no push, no PR mutation, and no `[cp]`
commit exists in the execution stack.

## Objective Impact

`@nseng-ai/kernel` is now `@nseng-ai/sdk` (dir `ts/packages/sdk/`), the
author API is the package root (`publicPluginApi: ["."]`, no
`@nseng-ai/sdk/sdk` stutter), the checkout-free fold is `@nseng-ai/ns/sdk` +
`@nseng-ai/ns/sdk/{cli,command-io,context}`, and live prose is
sdk-throughout with `kernel` recorded as Avoid anti-vocabulary.

Ground-truth drift found by the spec verification sweep (Workflow A, eight
read-only agents) and folded into the spec before execution: line counts
183/265 (spec said 182/263); 16 dependent manifests plus the root
devDependency (spec said 15 importers); the style-guard test file lives in
its package, not `ts/test/`; the release-script surface spans six files
(spec cited fragments); `example-spec.mjs` has 21 label lines (spec said
~10); "SDK boundary" is prose, not a glossary entry; new surfaces: kernel
test-fixture template literals, hosts/pi allowed-specifier lists,
`NS_KERNEL_KEEP_SMOKE_DIR`, in-package docs, and the
`KernelCommandCompletion*` exported aliases (parked as out-of-scope — an
exported-identifier rename was not ratified by ADR 0035).

Execution-time discoveries handled as documented adaptations: the
source-dev discovery sentinel `join(packagesRoot, "kernel", "src")` in
`registry.ts` (join-arg form invisible to substring sweeps — broke extension
discovery until repointed); the hosts/pi integration test's relative
`../kernel/` package-root URL; the fold-entry model rework of
`sdk-public-subpaths.mjs` (the flat-subpath model could not express the
root-export fold); and the publish rewrite gaining a bare
`"@nseng-ai/sdk"` → `"@nseng-ai/ns/sdk"` mapping.

The trust-nothing closeout (Workflow B: five rounds of four finder agents
over disjoint roots with dual word-boundary + camelCase search, plus five
scope-diff auditors) produced a fully accounted 162-hit inventory: 61
historical, 43 out-of-scope, 5 avoid-term, 6 guard-fixture, 47 live-claims
— all camelCase-internal identifiers (`ParsedKernelCommand*`,
`KernelDiagnostic*`, `kernelSourceDir`, one docs-site catalog string) fixed
in the closeout commit. Scope audits found zero unexplained extras across
all five slices. No stale live kernel claim remains.

## Follow-Ups

- Operator-only npm work per ADR 0035 decision 5: claim/publish
  `@nseng-ai/sdk` (unclaimed, E404 verified) and optionally deprecate
  `@nseng-ai/kernel@0.1.2` at the next publish.
- Separate decisions, deliberately not taken here: renaming the parked
  `KernelCommandCompletion*` / `NsCommandCompletionProvider` exported
  aliases, and the `docs/north-star.md` / docs-site product-vision framing
  of ns itself as "the kernel" (distinct from the retired package brand).
- The stack awaits human review and submission under the standard Graphite
  workflow.
