# Roadmap

## Work

- [x] Deepen classification into one module tested through one interface
      `classification.ts` now owns schemas, manifest-view construction, validation, planning, and template building behind the public validate/plan/template surface. The former `classification-shared`, `-validation`, `-planning`, and `-template` leaf modules are deleted; the private artifact pipeline is no longer exported. Evidence: local branch diff against Graphite parent `add-pr-address-ts-architecture-review`; `pnpm --dir ts run check` and `pnpm --dir ts run test` passed.
- [x] Consolidate stack-feedback prep/plan and unify discussion-triage
      `stack-feedback-triage.ts` now owns discussion-triage markers, schemas, types, hint classification, and summary building. Prep imports that owner, plan builds a local triage index instead of nested reach-through classification checks, and diff-current consumes producer-owned prep/plan schemas from focused contract modules. `stack-feedback-contracts.ts` is reduced to explicit named compatibility re-exports while prep and plan contracts live with their producing concepts. Evidence: local working-tree diff on top of Graphite parent `deepen-pr-address-classification-one-module`; `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `git diff --check` passed.
- [ ] Fold the payload store behind a filesystem seam
      Merge `payload-lookup` and `payload-manifest` into one deep `PayloadStore`, and put a filesystem port at its seam: a node-fs adapter in prod, an in-memory adapter in tests — mirroring the existing github/git gateway. Collapse the three-hop read path to one interface.
- [ ] Absorb the shallow pass-throughs
      Inline the modules that fail the deletion test cleanly (`array-values`, `operation-support`). Fold `payload-manifest` into the `PayloadStore` work above. Keep `reply-formatting` / `string-values` only if their golden tests are the real reason they exist — flag those as deliberate test seams rather than deleting.
      Note: the parts kept for Python byte-parity share the gate on the schema-collapse row below.
- [ ] Collapse the dual schema definitions into one source of truth
      Make each operation's runtime Zod schema the single source and let clinkr derive the `--json-schema` document (`group.ts:323` already supports this). Delete the `operation-schemas/` mirror layer (~1534 LOC) where derivation matches; keep an override only where a document genuinely cannot be derived.
      GATED: blocked on the legacy Python `--json-schema` parity requirement retiring (ADR-0004 frames the Python fallback as temporary). Do not land until parity is no longer live; if parity holds, resolve this row by recording the gate state rather than forcing the change.

## Parked

- [x] Decompose the stack-feedback `contracts.ts` hub (286 LOC mixing wire schemas, result types, and operation field specs) if Candidate 3 does not already dissolve it.
      Resolved by the stack-feedback prep/plan triage slice: focused prep and plan contract modules now own producer schemas/types, triage owns discussion classification, and the old hub remains only as an explicit named compatibility seam.
