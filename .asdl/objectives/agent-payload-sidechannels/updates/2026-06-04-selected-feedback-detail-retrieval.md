# Selected PR Feedback Detail Retrieval Implemented

## Summary

Added selected-detail retrieval for compact `pr-address` feedback payloads. `asdl_core.payloads.lookup` now provides a reusable RFC 6901 JSON Pointer resolver plus a payload-aware JSON artifact reader that validates explicit absolute payload paths before loading `.raw.json` or `.summary.json` values.

`pr-address exec read-feedback-detail` reads from an explicit raw payload path and JSON Pointer copied from a compact manifest. The command only accepts manifest-supported PR feedback body/item pointer shapes, requires a successful Clinkr raw envelope, rejects broad/unrelated pointers, type-checks body locators as strings and item locators as objects, and returns a compact result containing the payload path, pointer, inferred detail kind, and selected value.

## Objective Impact

The roadmap row that previously combined selected-detail retrieval with classification validation is split. Selected-detail retrieval is complete; classification validation remains a separate follow-up slice.

Evidence: focused tests cover core pointer resolution, escaped tokens, array-index failures, payload artifact path/role/JSON validation, `get-feedback` payload review-body and thread-comment item reads, broad-pointer rejection, missing/non-raw payload failures, and `prepare-run` review-thread item reads without unrelated PR-level/discussion bodies in the result.

## Follow-Ups

- Define and validate the strict PR feedback classification packet against compact manifests.
- Teach the public `pr-address` skill/reference workflow to use payload classification, selected-detail retrieval, and fail-closed retries after classification validation exists.
- Keep generic payload CLIs, automatic Clinkr spooling, bounded body previews, and command-level LLM invocation parked.
