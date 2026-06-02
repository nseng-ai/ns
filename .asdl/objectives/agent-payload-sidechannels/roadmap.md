# Roadmap

## Work

- [ ] Define the shared payload-store and prompt-resolution contracts before implementation begins.
      Evidence: the contract records the temp-root/session/path shape, strict session-id and descriptor regex, timestamp/sequence filename allocation, raw-envelope sidecar role, compact manifest role, sidecar failure behavior, prompt resolution scope, and the explicit non-goals around generic CLIs, command-level LLMs, and numeric token-budget tests.
- [ ] Implement the shared `asdl-core` payload-store primitive and opt-in Clinkr/helper surface.
      Evidence: callers can create safe session payload directories, write `.raw.json` full machine envelopes with private temp-file behavior, allocate collision-safe filenames, return `payload_path` metadata, and fail closed when sidecar writes fail.
- [ ] Implement the repo-local `.asdl/prompts` launch-policy steelthread.
      Evidence: a shared resolver can read repo-local `.asdl/prompts/<name>.md` with embedded-default fallback behavior where intended, `.asdl/prompts/subagent-launch.md` exists with Pi/Claude/Codex/fallback sections, and the prompt is framed as general delegation policy rather than PR-specific task instructions.
- [ ] Convert `pr-address exec prepare-run` and `get-feedback` to compact sidecar defaults.
      Evidence: normal human and JSON output contains a locator manifest with PR metadata, item counts, every feedback item, every unresolved thread, body character counts, JSON Pointer locators, PR-domain locators, and `payload_path`; full raw review/comment bodies are present in the `.raw.json` sidecar and absent from default stdout; an explicit inline/full-output mode remains available for debugging.
- [ ] Add selected-detail retrieval and PR feedback classification validation.
      Evidence: an agent can fetch one selected body or item from a raw sidecar by locator without printing the whole payload, and the `pr-address` workflow can validate a strict classification packet so every unresolved inline review thread appears exactly once before execution planning proceeds.
- [ ] Wire the side-channel LM/subagent summary workflow into `pr-address` documentation and skill behavior.
      Evidence: the skill instructs agents to use compact sidecar defaults, read `.asdl/prompts/subagent-launch.md`, pass payload paths rather than raw JSON to side-channel summarizers when available, save `.summary.json` classification artifacts through the payload helper, retry invalid classifications once, and use bounded inline previews only as an explicit fallback.
- [ ] Cover the steelthread with functional tests and closure evidence.
      Evidence: tests cover path/session validation, sidecar creation, sidecar failure, manifest body elision, locator retrieval, prompt resolution, `pr-address` completeness validation, and relevant command/schema behavior; targeted repo checks pass for changed Python and documentation surfaces.

## Parked

- A standalone generic payload CLI or prompt CLI.
- Automatic Clinkr framework spooling for all large outputs.
- Command-level LLM invocation from `pr-address` or the payload store.
- Broad migrations of non-`pr-address` commands to payload side-channels.
- Branch-naming and commit-summary prompt policies under `.asdl/prompts`.
- Global/user prompt scopes beyond repo-local `.asdl/prompts`.
- Payload retention/GC tooling.
- Numeric token/character budget tests or measurement scripts.
- ADRs unless implementation reveals a hard-to-reverse, surprising trade-off that is not already captured by the Objective and docs.
