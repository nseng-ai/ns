# PR Address Payload Manifests Implemented

## Summary

Converted `pr-address exec get-feedback` and `pr-address exec prepare-run` to the compact payload default. Both commands now accept `--payload-mode inline|payload` with `payload` as the default and `--payload-session-id` as an explicit session override. Payload mode opens the shared payload store before domain work, writes the full inline-shaped Clinkr machine envelope to a `.raw.json` artifact, and returns a compact manifest instead of raw review/comment bodies.

The new `feedback_payload` helper models define the first `pr-address` locator manifest shape: shared payload references, counts, PR metadata where available, review items, review-thread and thread-comment items, discussion-comment items, `body_chars`, RFC 6901 JSON Pointers into the raw envelope, optional enclosing item pointers, and PR-domain locator metadata such as review/thread/comment ids, paths, lines, resolved/outdated state, and authorship. Inline mode remains the explicit full-payload debugging and migration path and does not require payload session preflight.

## Objective Impact

The roadmap row “Convert `pr-address exec prepare-run` and `get-feedback` to compact payload defaults” is complete. The implementation covers JSON and human command surfaces, preserves full body text in raw payloads, omits body text from default stdout, reports stable payload session failures for missing or unsafe session ids, and keeps the generic payload CLI, command-level LLM summarization, selected-detail retrieval, and classification validation out of this slice.

The remaining compact-manifest field-name question is resolved by the checked-in `pr-address` payload manifest models. The next semantic slice should build on these manifests rather than redesigning the basic manifest field vocabulary.

Evidence: local branch diff against Graphite parent `fix-symlinked-prompt-resolution`; PR #871 corroborates the same file set. Scenario and unit tests were added for payload JSON/human output, body elision, raw payload body retention, no-PR prepare-run payloads, missing/invalid session failures before domain work, inline-mode bypass, and locator construction.

## Follow-Ups

- Add reusable JSON Pointer lookup and `pr-address exec read-feedback-detail` for selected raw-payload detail retrieval.
- Define and validate the strict PR feedback classification packet against the compact manifest, including duplicate/missing/unknown id failures and retry/fail-closed workflow behavior.
- Update the `pr-address` skill/reference workflow after selected-detail retrieval and classification validation are available.
- Keep generic payload CLIs, automatic Clinkr spooling, bounded body previews, and command-level LLM invocation parked unless a later Objective changes the contract.
