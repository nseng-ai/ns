# Execution Policy and First-Slice Seams

## Summary

The Objective is now execution-friendly for `objective-next` across every non-parked roadmap row. The durable policy allows confirmed in-repo implementation slices after preview while requiring explicit steering for public contract changes, live GitHub writes, npm publishing, broad Python fallback deletion, and premature shared framework extraction.

The first real TypeScript operation-port slice is `pr-address exec classification-template`. It is the smallest useful slice because it is pure and deterministic, already has golden coverage, avoids GitHub/git/payload writes, and forces the minimal runtime/schema seams needed by later classification and planning operations.

Minimal runtime seams for that first slice:

- TypeScript operation registry with per-operation legacy fallback.
- Clinkr-compatible machine envelope with process exit code matching the envelope.
- JSON input-source helper for stdin, inline JSON, and file JSON, including source-conflict behavior.
- Eager `--json-schema` output with top-level `input_json_schema` and `output_json_schema`.
- CLI test harness stdin injection.

Minimal schema seams for that first slice:

- `PayloadReference`.
- Compact feedback manifests for `get-feedback` and `prepare-run`, including `BodyLocator` and review/thread/discussion manifest items.
- Derived `FeedbackManifestView`.
- Classification-template output packet and counts.
- Intentional compatibility for Python/Pydantic explicit `null` fields where current output exposes nullable fields.

## Objective Impact

This completes the roadmap item `Identify the minimal command-runtime and schema seams needed by the first operation slice` and replaces the previous planning-only gap with durable `## Definition of Progress` and `## Runner Policy` prose.

The remaining roadmap is decomposed into executable vertical slices: `classification-template`, validation/planning, payload/detail/finalization helpers, GitHub/git read-only feedback collection, mutation/reply helpers, public cutover, Python fallback retirement, and umbrella playbook feedback. Each row now has policy guidance that clarifies what a runner may execute directly after preview and where it must ask first.

## Follow-Ups

- Use `classification-template` as the next implementation slice unless a later preview records a stronger compatibility reason to choose a different pure operation first.
- During the first slice, keep runtime/schema helpers local to `ts/packages/pr-address` and avoid shared package extraction.
- Prove Python/Pydantic JSON compatibility intentionally, especially explicit `null` fields and schema output shape.
- Ask before public contract changes, live GitHub writes, npm publishing, broad Python deletion, or shared framework extraction.
