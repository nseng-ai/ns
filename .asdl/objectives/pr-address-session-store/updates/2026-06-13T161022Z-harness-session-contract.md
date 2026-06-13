# Harness session contract adopted

## Summary

`pr-address` payload mode now uses the generalized harness-owned `HARNESS_SESSION_ID` contract instead of a `pr-address`-specific ambient payload session variable.

The harness id is the storage session id. Payload mode validates the explicit `--harness-session-id` value or `HARNESS_SESSION_ID` environment value as a safe path segment, uses it verbatim under the payload-store `sessions/<id>/payloads/` layout, and fails closed when the id is missing or unsafe. There is no derivation, hashing, or digest field; helper output exposes `harness_session_id` as the validated harness id used for storage.

Pi supplies `HARNESS_SESSION_ID` for Bash tool calls through the project-local `.pi/extensions/harness-session.ts` adapter. Manual and non-Pi callers may pass `--harness-session-id` or set `HARNESS_SESSION_ID`; commands must fail closed when payload mode lacks both or receives an unsafe value.

## Objective Impact

This narrows the Objective's session-store boundary: ambient run identity is harness-owned, and the payload store consumes that identity directly after validation. Future session-store work should build on the verbatim harness-session contract rather than reintroducing caller-chosen payload session ids, derived storage ids, digest correlation fields, or `pr-address`-specific environment variables.

The docs and static guardrails now treat legacy payload-session inputs and derived-session vocabulary as invalid active vocabulary. `harness_session_id` remains valid as an output field naming the validated storage session.

## Follow-Ups

- Keep the harness responsible for issuing opaque, safe ids.
- Preserve file/path artifact lookup flows that do not need a harness id.
- When extending stack/session-store helpers, accept `harness_session_id` only as a manual/debug override and prefer harness-provided `HARNESS_SESSION_ID` in ordinary agent workflows.
