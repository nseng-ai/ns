# Roadmap

Each row is one runner-sized committed slice from
`docs/wayfinding/ontology-reshape/kernel-sdk-rename-spec.md`, in spec order, on
its named fresh Graphite branch stacked on the previous (base: the branch where
ADR 0035 and the spec land). Objective-level policy in `objective.md` governs
every row; row notes call out only slice-local guidance.

## Work

- [x] Spec verification sweep — branch `kernel-sdk-rename/spec-sweep`
  - Re-derive every volatile inventory claim in the spec (import counts,
    importer lists, file hit counts, paths, npm state) against the repo; commit
    corrections to `kernel-sdk-rename-spec.md` only.
  - Policy: read-only against the repo; edits land only in the spec file.
  - Evidence: one commit of spec corrections (or a no-corrections note in the
    step report); dprint green for the spec.
- [x] Spec item 1: package identity rename — branch
      `kernel-sdk-rename/rename-package`
  - `ts/packages/kernel/` → `ts/packages/sdk/`, name `@nseng-ai/sdk`, importer
    deps, ordered specifier pairs, `SDK_SPECIFIER` literal, style-guard
    projection and debt-edge literals, path references, lockfile refresh.
  - Evidence: `just` green; live greps for `@nseng-ai/kernel` and
    `ts/packages/kernel` return nothing.
- [x] Spec item 2: author entry point becomes the package root — branch
      `kernel-sdk-rename/root-entry-point`
  - Exports `"."`, `publicPluginApi: ["."]`, ~182 author-API imports →
    `@nseng-ai/sdk`, module-loader key, live surfaces outside `ts/packages/`,
    mechanical import-snippet ride-alongs in author docs.
  - Evidence: `just` green; no `@nseng-ai/sdk/sdk` hits; descriptor loading
    exercised (`ns --help` plus a descriptor-loading test).
- [x] Spec item 3: checkout-free fold rename — branch
      `kernel-sdk-rename/rename-ns-fold`
  - `hosts/ns` folded exports → `./sdk*`, `src/kernel/` → `src/sdk/`,
    `sdk-export-entries.json` rekey, bundle/prepare/smoke and
    `prepare-source-publish-package.mjs` scripts, `ns.subpackages`; root
    `CONTEXT.md` folded-path claims ride along.
  - Evidence: `just` green; no live `ns/kernel` hits;
    `smoke-checkout-free.mjs` passes (failure is a STOP).
- [x] Spec item 4: vocabulary and docs rewrite — branch
      `kernel-sdk-rename/glossary-and-docs`
  - Sdk-throughout prose per ADR 0035: root `CONTEXT.md`, `CONTEXT-MAP.md`,
    package `CONTEXT.md`/`README.md`, author docs, `hosts/ns/README.md`,
    live-source comments; `kernel` added to Avoid lists as anti-vocabulary.
  - Evidence: `just` green; word-boundary `kernel` grep over live docs/source
    returns only classified deliberate hits.
- [x] Spec item 5: closeout — on the top slice, no new branch
  - Trust-nothing sweep: final word-boundary `kernel`/`Kernel` grep with every
    live hit accounted; per-slice scope-diff justification; confirmation no
    submit/push happened and no `[cp]` commits exist. Accounting fixes may
    commit on the top slice.
  - Evidence: `just` green on the top slice; the accounted inventory recorded
    in this record's closure evidence.

## Parked

(none)
