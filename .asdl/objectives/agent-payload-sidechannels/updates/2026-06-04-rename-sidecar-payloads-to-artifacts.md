# Rename Sidecar Payloads to Payload Artifacts

## Summary

Renamed the user-facing terminology from "sidecar" to "payload artifact" across the completed Objective, durable spec, implementation code, tests, and `pr-address` skill/reference documentation.

The semantic contract did not change: commands still write full raw machine envelopes to private temp payload files, print compact locator manifests by default, require explicit payload session ids in payload mode, and use selected-detail lookup for targeted body retrieval. This update records only the terminology cleanup.

## Objective Impact

The living Objective and roadmap now use "payload artifact" language for the current architecture. Earlier Semantic Updates intentionally keep the wording they used when written so the update log remains a historical record rather than a retroactive rewrite.

## Follow-Ups

- Preserve historical update entries as-written unless a future entry explicitly records a correction.
- Continue using "payload artifact" in new code, docs, tests, and future updates.
