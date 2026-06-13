# Roadmap

## Work

- [ ] Deepen classification into one module tested through one interface
      Merge `classification-shared`, `-validation`, `-planning`, `-operations`, `-template` into one module whose interface is `validate → plan`. Remove `planning.ts:73`'s dependency on the private `FeedbackClassificationValidationArtifacts` struct. Make manifest-view building, semantic-rule checks, and planning internal seams. Test the validate→plan wiring at the one interface; delete the leaf-level tests. (Top recommendation — Strong, ungated.)
- [ ] Consolidate stack-feedback prep/plan and unify discussion-triage
      Extract one `discussion-triage` module owning `triageSummary` / `DIRECT_REQUEST_MARKERS` / the hint enum (currently duplicated across `stack-feedback-prep-core` and `stack-feedback-contracts`). Have `plan` consume a triage result through the interface instead of reaching into `prep.stack[].discussion_triage.items[]`. Stop `diff-current` re-deriving the plan/prep wire schemas. Co-locate each result type with its producing module.
- [ ] Fold the payload store behind a filesystem seam
      Merge `payload-lookup` and `payload-manifest` into one deep `PayloadStore`, and put a filesystem port at its seam: a node-fs adapter in prod, an in-memory adapter in tests — mirroring the existing github/git gateway. Collapse the three-hop read path to one interface.
- [ ] Absorb the shallow pass-throughs
      Inline the modules that fail the deletion test cleanly (`array-values`, `operation-support`). Fold `payload-manifest` into the `PayloadStore` work above. Keep `reply-formatting` / `string-values` only if their golden tests are the real reason they exist — flag those as deliberate test seams rather than deleting.
      Note: the parts kept for Python byte-parity share the gate on the schema-collapse row below.
- [ ] Collapse the dual schema definitions into one source of truth
      Make each operation's runtime Zod schema the single source and let clinkr derive the `--json-schema` document (`group.ts:323` already supports this). Delete the `operation-schemas/` mirror layer (~1534 LOC) where derivation matches; keep an override only where a document genuinely cannot be derived.
      GATED: blocked on the legacy Python `--json-schema` parity requirement retiring (ADR-0004 frames the Python fallback as temporary). Do not land until parity is no longer live; if parity holds, resolve this row by recording the gate state rather than forcing the change.

## Parked

- [ ] Decompose the stack-feedback `contracts.ts` hub (286 LOC mixing wire schemas, result types, and operation field specs) if Candidate 3 does not already dissolve it.
