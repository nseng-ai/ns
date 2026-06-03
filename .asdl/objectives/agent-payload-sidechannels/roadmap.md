# Roadmap

## Work

- [x] Define the shared payload-store and prompt-resolution contracts before implementation begins.
      Evidence: `docs/specs/agent-payload-sidechannels.md` records the temp-root/session/path shape, required supplied session id for sidecar mode, inline-mode bypass, strict session-id/descriptor/prompt-name regex, timestamp/sequence filename allocation, raw/summary/log roles and extensions, raw-envelope sidecar role, shared payload reference fields, compact manifest role, sidecar failure behavior, reusable core JSON Pointer lookup, prompt resolution scope/provenance, no bounded-preview escape hatch, and explicit non-goals around generic CLIs, command-level LLMs, prompt-file creation in the contract slice, and numeric token-budget tests.
- [x] Implement the shared `asdl-core` payload-store primitive.
      Evidence: `asdl_core.payloads` now validates safe segments, resolves default and `ASDL_PAYLOAD_ROOT` payload roots, requires supplied session ids, creates private managed directories, writes `.raw.json`, `.summary.json`, and `.log.txt` artifacts with exclusive final-path allocation, scans session payload filenames for monotonic sequences, returns shared payload-reference metadata, and surfaces stable payload error types. Verification: focused payload tests passed and full `just` passed.
- [ ] Add the opt-in Clinkr/helper surface for sidecar writes.
      Evidence: future Clinkr-facing helper code can serialize full raw machine envelopes through the shared store and map `PayloadError` values to Clinkr failures with no result data; this slice intentionally did not change Clinkr or `pr-address` behavior.
- [ ] Implement the repo-local `.asdl/prompts` launch-policy steelthread.
      Evidence: a shared resolver can read repo-local `.asdl/prompts/<name>.md` with content-plus-provenance results and embedded-default fallback behavior where intended, `.asdl/prompts/subagent-launch.md` exists with Pi/Claude/Codex/fallback sections, the checked-in prompt and embedded fallback are protected by a drift test, and the prompt is framed as general delegation policy rather than PR-specific task instructions.
- [ ] Convert `pr-address exec prepare-run` and `get-feedback` to compact sidecar defaults.
      Evidence: normal human and JSON output contains a locator manifest with PR metadata, item counts, every feedback item, every unresolved thread, body character counts, JSON Pointer locators, PR-domain locators, and a shared payload reference; full raw review/comment bodies are present in the `.raw.json` sidecar and absent from default stdout; an explicit inline/full-output mode remains available for debugging and migration.
- [ ] Add selected-detail retrieval and PR feedback classification validation.
      Evidence: reusable core JSON Pointer lookup can read selected values from validated payload artifacts, `pr-address exec read-feedback-detail` can fetch one selected body or item from a raw sidecar without printing the whole payload, and the `pr-address` workflow can validate a strict classification packet so every manifest feedback item is accounted for exactly once before execution planning proceeds.
- [ ] Wire the side-channel LM/subagent summary workflow into `pr-address` documentation and skill behavior.
      Evidence: the skill instructs agents to use compact sidecar defaults with a supplied payload session id, read `.asdl/prompts/subagent-launch.md`, pass payload paths rather than raw JSON to side-channel summarizers when available, save `.summary.json` classification artifacts through the payload helper, retry invalid classifications once, use selected-detail lookup for targeted body text, and use explicit inline/full-output mode only as a debugging or migration escape hatch.
- [ ] Cover the steelthread with functional tests and closure evidence.
      Evidence: tests cover path/session validation, relative root rejection, sidecar creation, sidecar failure, manifest body elision, locator retrieval, prompt resolution and embedded-default drift, `pr-address` completeness validation, and relevant command/schema behavior; targeted repo checks pass for changed Python and documentation surfaces.

## Parked

- A standalone generic payload CLI or prompt CLI.
- Automatic Clinkr framework spooling for all large outputs.
- Command-level LLM invocation from `pr-address` or the payload store.
- Broad migrations of non-`pr-address` commands to payload side-channels.
- Branch-naming and commit-summary prompt policies under `.asdl/prompts`.
- Global/user prompt scopes beyond repo-local `.asdl/prompts`.
- Payload retention/GC tooling.
- Bounded body-preview escape hatches in compact manifests.
- Numeric token/character budget tests or measurement scripts.
- ADRs unless implementation reveals a hard-to-reverse, surprising trade-off that is not already captured by the Objective and docs.
