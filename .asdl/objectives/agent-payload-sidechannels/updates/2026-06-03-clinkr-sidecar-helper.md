# Clinkr Sidecar Helper Implemented

## Summary

Implemented the opt-in Clinkr sidecar helper layer in `asdl_core.payloads.clinkr`. The new helper surface lets future sidecar-enabled Clinkr commands explicitly open/preflight a payload store, write a full Clinkr machine envelope to a `.raw.json` payload artifact, and embed the returned `PayloadReference` in command-specific compact manifests.

The implementation intentionally remains an adapter over the pure payload store. It does not modify `ClinkrGroup`, add automatic Clinkr output spooling, introduce a generic payload CLI, change `pr-address`, add prompt resolution, add JSON Pointer lookup, or add summary/classification helpers.

## Objective Impact

The roadmap row “Add the opt-in Clinkr/helper surface for sidecar writes” is complete because `open_clinkr_payload_store(...)` maps payload preflight failures to `ClinkrFailure` with stable payload error types, and `write_clinkr_raw_sidecar(...)` writes `ClinkrExit.to_envelope_dict()` as the raw sidecar payload while returning the store-owned reference.

Tests cover successful env-backed store opening, missing-session and relative-root translation to `ClinkrFailure`, OK/negative/failure raw machine envelopes, payload-reference metadata, payload write failure translation and cleanup, envelope serialization failure translation, and Clinkr JSON dispatcher behavior with no `data` on helper-raised failures.

Verification: focused payload unit tests passed, focused Ruff and format checks passed, and `just ty` passed.

## Follow-Ups

- Implement the repo-local `.asdl/prompts` launch-policy steelthread.
- Convert `pr-address exec prepare-run` and `get-feedback` to compact sidecar defaults in a later slice.
- Add selected-detail retrieval and PR feedback classification validation separately.
- Keep Clinkr framework auto-spooling and generic payload CLIs out of scope unless the durable contract changes.
