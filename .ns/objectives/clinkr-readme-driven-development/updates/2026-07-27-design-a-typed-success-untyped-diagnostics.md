# Design A Approved: Typed Success, Untyped Diagnostics

## Summary

The command-definition outcome contract is settled as Design A — typed success, untyped diagnostics — replacing the four status-specific schemas and the bodyless/data-bearing conditional type machinery. Human approval occurred in the originating planning conversation; this note records the decision and its provenance.

`resultSchema` is the only declared payload schema; Clinkr validates every success outcome's `data` against it, and success without `resultSchema` is bodyless. Negative, failure, and usage-error outcomes have fixed shapes (`status`, `message`, plus `errorType` on failure and usage-error) carrying optional freeform `data: unknown` diagnostics that are never validated. One status vocabulary — `success | negative | failure | usage-error` — serves as both the outcome discriminant and the wire status, and one envelope schema builder is the single source of `--json-schema`'s machine-envelope contract, with framework usage errors folded into the single usage-error arm (`errorType` `invalid-request` | `invalid-json-input`, diagnostics such as `{ issues }` or `{ commanderCode }`).

## Evidence

- Zero consumers outside Clinkr declare `negativeSchema`, `failureSchema`, or `usageErrorSchema`; only `resultSchema` is used.
- Consumers routinely attach freeform, untyped `data` to `failure(...)`/`negative(...)`/`usageError(...)` (packagechk, objectives publication commands, flow submit) — practice is already typed success, untyped diagnostics.
- Three envelope specifications had drifted apart: hand-written envelope types/schemas in `exit.ts`, the 7-arm hand-built union in `command-definition.ts`, and an inline status-remapping literal in `app.ts`.
- The in-progress rebuild mutated shared legacy modules (`exit.ts`, `emit.ts`, `confirmation.ts`, root barrel) imported by ~196 files across the repo, forcing collateral churn on legacy callers.

## Decisions

- **Quarantine seam:** the rebuild lives under temporary subpaths `@nseng-ai/clinkr/app` and `@nseng-ai/clinkr/app/testing`; shared legacy modules are restored to their pre-rebuild shape. The root flip to the new surface is owned by the roadmap's tail legacy-deletion row, at which point the README-draft's `/app` import paths convert to root.
- **Envelope simplification:** the machine envelope is the outcome plus `exitCode`, minus render overrides, and omits the `data` key entirely when its value is `undefined`. The prior "preserve explicitly undefined payloads" behavior is deliberately dropped.
- **Unified vocabulary:** the outcome object's own `status` field is the wire status; there is no internal `ok`/`usageError` naming to remap at emission.
- **Confirmation helper:** the new-model helper is `confirmOrUsageError` in the quarantined module, returning `{ status: "confirmed" }` | negative | usage-error so the whole union narrows on `status`.

## Objective Impact

`references/README-draft.md` (outcomes section, confirmation example, entrypoints table, fence fixtures), `references/implementation-contract-notes.md`, and the command-definition roadmap row now carry the Design A contract. The later SDK/consumer migration rows inherit the single-typed-payload model.
