# Payload store lookup boundary sealed

## Summary

Latest JSON session-artifact lookup is now a payload-store capability rather than workflow-local filesystem plumbing. `PayloadArtifactStore.findLatestJsonArtifact` owns exact descriptor/role/json matching, highest-sequence selection, payload reference construction, and parsed value return for both the node-backed store and the in-memory store.

The PR/stack planning wrappers now delegate through that store boundary, and classification/stack planning operations open stores through the injected payload-store factory. This preserves the session-resolution behavior while proving the abstraction works without depending on concrete `PayloadStore.fromEnvironment` calls or direct filesystem scanning in `session-artifacts.ts`.

Evidence considered: local branch diff against Graphite parent `pr-address-session-artifact-taxonomy-planning-resolution`, PR #1512, full TypeScript test, and full TypeScript check.

## Objective Impact

This completes the storage-boundary part of the artifact-kind/resolution contract. The Objective can now treat latest-of-kind JSON lookup as a store-owned primitive usable by later helpers, not as special-case PR/stack planning logic.

The descriptor taxonomy and planning-resolution rows are durable progress: PR and stack planning paths have reserved descriptors, session-resolved inputs, `resolved_inputs` audit output, validation-gated classification artifacts, and store-level node/in-memory coverage. Composed payload compatibility remains intentionally present until the later input-style removal row.

## Follow-Ups

- Reuse `PayloadArtifactStore.findLatestJsonArtifact` for later mutation/build/checkpoint/finalization helpers instead of reintroducing filename scanning outside the store.
- Continue the planning/read-helper migration beyond PR/stack planning paths.
- Keep the composed-input removal, compact stdout default, mutation explicit-reference requirement, and skill rewrite as separate remaining roadmap work.
