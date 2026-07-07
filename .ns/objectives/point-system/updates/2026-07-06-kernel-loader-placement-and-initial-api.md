# Kernel Loader Placement and Initial API

## Summary

The shared `ns.toml` loader placement is decided and the first implementation slice landed on local branch `point-system-kernel-loader-slice` at commit `6ac5f1b19` (`Add kernel point config loader`). The loader/catalog home is `@nseng-ai/kernel` as a kernel-owned internal workspace surface, not `foundation`, not `capability-kit`, and not a new package. Manifest-facing `ns.points` schema/types live with the kernel SDK extension-manifest metadata.

The initial API parses repo-root `ns.toml` once through a gateway, validates `[points]` installations against point definitions, validates declared settings schemas, and returns structured diagnostics with fake-driven unit coverage.

## Objective Impact

This resolves the roadmap's slice-1 placement question and de-risks the ADR 0009 layering concern for the initial design. The first roadmap row is now in progress rather than unstarted: the kernel loader surface exists, but real consumer migrations and final full-suite evidence remain before the row is complete.

Validation evidence from the runner step: targeted `packages/kernel/test/unit/project-config-points.test.ts` passed, full kernel tests passed, `just ts-check` passed, `just ts-lint` passed, `just ts-format-check` passed after formatter autofix, and `git diff --check` passed. Full `just` progressed through dprint/deps/format/lint/check/full TS tests/objective check, then failed on an unrelated existing `@nseng-ai/objectives` topology-circle style-guard cycle.

## Follow-Ups

- Join manifest `ns.points` discovery to the loader and compute the point catalog.
- Migrate `flow.submit.pre`, prompt points, and declared settings consumers onto the kernel loader in later slices.
- Re-run full `just` as later slices proceed; keep the current unrelated Objective topology-circle style-guard failure visible until resolved or clearly outside this Objective's evidence.
