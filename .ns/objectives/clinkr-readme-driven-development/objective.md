---
edges:
  - objective: foundation-readme-driven-pass
    annotation: Parent umbrella; this Subobjective owns its Clinkr gate dry-run and returns process amendments before the Foundation package pass begins.
---

# Clinkr README-Driven Development

## Thesis

Develop Clinkr's cold-audience package contract in `references/README-draft.md`, then reconcile the package and its callers to that settled contract before promoting it to `ts/packages/infra/clinkr/README.md`. Clinkr is the first package dry-run under `foundation-readme-driven-pass`, so this Objective also identifies concrete amendments needed to make the README-driven graduation gate repeatable for later foundation packages.

## Scope

- Draft and human-steer user-facing documentation for `@nseng-ai/clinkr`: its purpose, requirements, rendered command model, schema-derived CLI surface, outcome and output semantics, nested groups, completion, interaction, raw and streaming escape hatches, testing utilities, and public entrypoints.
- Audit Clinkr's implementation, tests, package exports, and representative callers against the emerging contract.
- Record each meaningful mismatch with an explicit disposition: reconcile implementation or caller, change the draft contract, or park it with rationale.
- Surface accidental complexity and contract-supporting refactoring proposals, but discuss every refactoring with the user before implementation.
- Reconcile approved mismatches, verify observable behavior, promote the settled draft to `ts/packages/infra/clinkr/README.md`, and replace the Objective draft with a provenance pointer.
- Return gate-calibration lessons and any process amendments to `foundation-readme-driven-pass` before that umbrella advances to Foundation.

## Non-Goals

- Redesigning Clinkr beyond what an honest, coherent package contract requires.
- Changing Clinkr's neutral-infrastructure tier, package name, or repository placement.
- Refactoring implementation or callers without prior user discussion and approval.
- Auditing or documenting downstream packages except where representative callers provide evidence about Clinkr's contract.
- Starting the Foundation package pass or other sibling package Subobjectives.

## Completion Criteria

- `references/README-draft.md` has been settled through the README-driven-development loop as coherent cold-audience product documentation with no silently invented commitments.
- The implementation, tests, package exports, and representative callers have been audited against the contract; every material mismatch is resolved or explicitly parked with rationale.
- Any implemented refactoring was discussed with and approved by the user before code changes.
- The reconciled contract is verified and promoted to `ts/packages/infra/clinkr/README.md`; this Objective is not complete while the canonical contract exists only under `references/`.
- The draft is replaced with a provenance pointer, and reusable gate lessons or process amendments are recorded in `foundation-readme-driven-pass`.

## Assumptions and Risks

Assumptions:

- Clinkr's current package exports and tested behavior are a strong starting point for the draft, but neither automatically defines the desired public contract.
- Representative callers can reveal whether the proposed contract explains real use without requiring an exhaustive repository-wide redesign.
- Clinkr has no internal workspace dependency that must complete another README-driven pass first.

Risks:

- **Contract-by-implementation.** Existing code may look authoritative even where behavior is accidental. Treat discrepancies as decisions and settle public claims through the draft.
- **Perfectionism stall.** Clinkr has a broad surface. Optimize for a coherent adopter path and explicit mismatch dispositions rather than exhaustive API narration or unrelated cleanup.
- **Refactoring before agreement.** Discovery may expose attractive simplifications. Record and discuss them before implementation instead of silently changing the package while documenting it.
- **Gate overfitting.** A Clinkr-specific process could become the default for later packages. Return only reusable, evidenced amendments to the umbrella.
- **README drift during reconciliation.** Keep the draft canonical until promotion and verify final claims against the reconciled package.
- **Lazy metadata drift.** Route identity and help metadata must live only in cheap route declarations; duplicated metadata on loaded nodes could diverge. Validate declarations when each scope is built and keep loaders behind one framework-owned path.
- **Coordinated migration breadth.** The approved clean break reaches Clinkr internals and tests, Foundation, SDK/catalog routing, remaining CLIs, and testing utilities. Preserve dependency order and avoid a compatibility layer or two simultaneous public models.

## Open Questions

- The README uses a cold external TypeScript adopter as its design and explanation lens, while improving ns's CLI infrastructure—not winning external adoption—remains the product goal.
- Every executable is an immutable `ClinkrApp`, created asynchronously through `ClinkrApp.create(options, async (appBuilder) => { ...; return await appBuilder.define(); })`. Public authoring uses framework-supplied `ClinkrAppBuilder`, `ClinkrGroupBuilder`, and `ClinkrCommandBuilder`; terminal `define()` calls return immutable nodes whose provenance is verified. There are no public command/group constructors and no root command/group object: the app owns its executable name and its root scope is transparent. Only the app executes or computes completion. Named commands and groups are lazy routes at every level, backed by cheap route metadata and one loader shared by execution, help, and deep completion; the one nameless default command is built eagerly with its containing scope. Context-free apps require no context ceremony, while contextful apps receive one homogeneous per-run value through the tree. Testing helpers should exercise parsing through rendering without process-global mutation. The current constructor/group-execution model is a clean-break migration mismatch.
- How much of the remaining root API should the README teach directly versus route to focused entrypoint sections and API examples?
- Aliases are application-defined public surface, never inferred automatically by Clinkr. The current automatic `list`/`ls` behavior is an implementation mismatch to remove during reconciliation.
- The raw escape hatch mounts an opaque Commander `Command` subtree whose parsing, options, help, schemas, context, I/O, completion, output, and exit behavior remain entirely application-owned. The current schema-backed `rawCommand()` model is an implementation mismatch to replace during reconciliation.
- Rendered commands always receive Clinkr's `--format` and `--json-schema` framework flags. Negative results are valid answers: human output goes to stdout with exit code `1`; the current stderr rendering is an implementation mismatch to fix during reconciliation.
- Clinkr publishes one top-level discriminated outcome schema per command. `resultSchema` configures successful data; optional `negativeSchema`, `failureSchema`, and `usageErrorSchema` configure data for the other statuses. Each omitted schema defaults that outcome to bodyless, each supplied schema requires and validates data, and `z.any()` is the explicit untyped escape hatch. Omitting all outcome schemas permits bodyless outcomes such as `ok()` and emits no Clinkr result body; application-owned imperative writes are stderr chatter. Request validation errors are usage errors, while outcome-schema violations are programmer errors that propagate to app crash policy. The current optional, success-only validation and arbitrary non-success data behavior is an implementation mismatch.
- Rendering belongs to command-level `renderHuman` and `renderMarkdown` functions. Remove current per-exit human and Markdown overrides during reconciliation; Markdown falls back to human rendering, then indented JSON.
- Dynamic completion provider failures fall back to static candidates. One optional app-level callback receives the thrown error and relevant command/completion context so applications can observe or log failures without Clinkr writing them directly.
- What gate amendments from this dry-run should become mandatory for later package Subobjectives?
