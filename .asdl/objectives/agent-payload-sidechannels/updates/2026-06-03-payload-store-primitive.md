# Payload Store Primitive Implemented

## Summary

Implemented the pure `asdl_core.payloads` payload-store primitive in `asdl-core`. The new package provides stable payload errors, shared safe-segment validation, environment/default root and session-id resolution, a framework-neutral `PayloadReference` model, and `PayloadStore` support for private managed directories plus `.raw.json`, `.summary.json`, and `.log.txt` artifact writes.

The implementation intentionally stays within the primitive-only slice: it does not add a Clinkr helper, generic payload CLI, prompt resolver, `.asdl/prompts/subagent-launch.md`, `pr-address` behavior changes, or JSON Pointer lookup.

## Objective Impact

The roadmap now splits the previously combined payload-store/Clinkr-helper row. The shared payload-store primitive row is complete because the store can validate roots/session ids/descriptors, create private root/session/payload directories, allocate monotonic per-session sequence numbers by scanning existing payload filenames, write artifacts with exclusive final-path creation and partial-write cleanup, and return store-owned payload references with stable error typing.

The opt-in Clinkr/helper surface remains open. Future work still needs to serialize full raw Clinkr machine envelopes through the store and map `PayloadError` values to Clinkr failures with no compact result data.

Verification: focused payload unit tests passed, focused Ruff and format checks passed, `just ty` passed, and full `just` passed.

## Follow-Ups

- Add the opt-in Clinkr/helper layer without making Clinkr auto-spool all command outputs.
- Keep `pr-address` unchanged until the compact manifest and payload command slice is implemented.
- Implement JSON Pointer lookup and prompt-resolution slices separately, preserving the non-goals around generic CLIs and command-level LLM invocation.
