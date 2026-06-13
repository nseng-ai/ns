# Harness session contract adopted

## Summary

`pr-address` payload mode now uses the generalized harness-owned `HARNESS_SESSION_ID` contract instead of a `pr-address`-specific ambient payload session variable.

The raw harness id is treated as boundary input only. The payload store derives a safe `pr-address-<digest>` storage session id, exposes the derived `payload_session_id` where payload artifacts need provenance, and reports only `harness_session_id_digest` for correlation. Normal helper output must not expose raw harness ids.

Pi supplies `HARNESS_SESSION_ID` for Bash tool calls through the project-local `.pi/extensions/harness-session.ts` adapter. Manual and non-Pi callers may pass `--harness-session-id` or set `HARNESS_SESSION_ID`; commands must fail closed when payload mode lacks both.

## Objective Impact

This narrows the Objective's session-store boundary: payload session storage remains `pr-address`-owned, but ambient run identity is harness-owned. Future session-store work should build on the derived payload-session id and digest contract rather than reintroducing caller-chosen payload session ids or `pr-address`-specific environment variables.

The docs and static guardrails now treat legacy payload-session inputs as invalid active vocabulary. `payload_session_id` remains valid as an output field naming the derived storage session.

## Follow-Ups

- Keep raw harness ids out of normal stdout, logs, and skill summaries.
- Preserve file/path artifact lookup flows that do not need a harness id.
- When extending stack/session-store helpers, accept `harness_session_id` only as a manual/debug override and prefer harness-provided `HARNESS_SESSION_ID` in ordinary agent workflows.
