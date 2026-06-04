# Roadmap

## Work

- [x] Define the shared payload-store and prompt-resolution contracts before implementation begins.
      Evidence: `docs/specs/agent-payload-sidechannels.md` records the temp-root/session/path shape, required supplied session id for payload mode, inline-mode bypass, strict session-id/descriptor/prompt-name regex, timestamp/sequence filename allocation, raw/summary/log roles and extensions, raw-envelope payload role, shared payload reference fields, compact manifest role, payload failure behavior, reusable core JSON Pointer lookup, prompt resolution scope/provenance, no bounded-preview escape hatch, and explicit non-goals around generic CLIs, command-level LLMs, prompt-file creation in the contract slice, and numeric token-budget tests.
- [x] Implement the shared `asdl-core` payload-store primitive.
      Evidence: `asdl_core.payloads` now validates safe segments, resolves default and `ASDL_PAYLOAD_ROOT` payload roots, requires supplied session ids, creates private managed directories, writes `.raw.json`, `.summary.json`, and `.log.txt` artifacts with exclusive final-path allocation, scans session payload filenames for monotonic sequences, returns shared payload-reference metadata, and surfaces stable payload error types. Verification: focused payload tests passed and full `just` passed.
- [x] Add the opt-in Clinkr/helper surface for payload writes.
      Evidence: `asdl_core.payloads.clinkr` now exposes opt-in helpers to open/preflight a payload store for Clinkr payload mode, serialize full `ClinkrExit.to_envelope_dict()` machine envelopes to `.raw.json` artifacts through the shared store, return store-owned `PayloadReference` values for compact manifests, and map payload preflight/write failures to `ClinkrFailure` with stable payload error types and no result data. This slice did not change Clinkr dispatcher behavior or `pr-address`.
- [x] Implement the repo-local `.asdl/prompts` launch-policy steelthread.
      Evidence: `asdl_core.prompts` now resolves safe repo-local `.asdl/prompts/<name>.md` files from an explicit repo root or prompt root, returns exact prompt content plus structured provenance, rejects unsafe prompt names, invalid root inputs, and symlinked repo prompt paths with stable prompt errors, and falls back to packaged embedded defaults when configured. `.asdl/prompts/subagent-launch.md` is checked in with Pi, Claude, Codex, fallback, path-passing, structured-return, and fail-closed safety guidance; an identical packaged Markdown fallback is protected by a drift test and verified to be included in the `asdl-core` wheel. This slice did not add a generic prompt CLI or change `pr-address` behavior.
- [x] Convert `pr-address exec prepare-run` and `get-feedback` to compact payload defaults.
      Evidence: `pr-address exec get-feedback` and `prepare-run` now default to `payload_mode: payload`, preflight/open a payload store from `--payload-session-id` or `ASDL_PAYLOAD_SESSION_ID` before domain work, write the full inline-shaped Clinkr envelope to a `.raw.json` payload, and return compact manifests with shared payload references, counts, PR metadata, review items, review-thread/comment locators, discussion-comment locators, `body_chars`, JSON Pointers, and PR-domain locator metadata. `--payload-mode inline` preserves the intentional full-payload escape hatch and bypasses payload session preflight. Scenario and unit tests cover JSON and human payload output, body elision from stdout, raw payload body retention, no-PR prepare-run payloads, invalid/missing session failures before domain work, and manifest locator construction.
- [x] Add selected-detail retrieval for PR feedback payloads.
      Evidence: `asdl_core.payloads.lookup` can resolve RFC 6901 JSON Pointers and read selected values from validated `.raw.json` / `.summary.json` payload artifacts without requiring the current payload root, while `pr-address exec read-feedback-detail` restricts callers to manifest-supported PR feedback body/item pointers, requires raw successful Clinkr payloads, type-checks selected body vs item values, and returns one compact provenance envelope without printing unrelated raw feedback bodies.
- [x] Add PR feedback classification validation.
      Evidence: `pr-address exec validate-feedback-classification` and `feedback_classification.py` validate strict classification packets against compact payload manifests, including exact-once PR reviews, unresolved review threads, covered thread comments, discussion comments, locator matches, enum/schema failures, duplicate/missing/unknown IDs, resolved-thread rejection, and action/informational field consistency. Focused unit and scenario tests plus Ruff and `ty` checks passed.
- [x] Wire the payload-aware LM/subagent summary workflow into `pr-address` documentation and skill behavior.
      Evidence: the public `pr-address` skill and references now instruct agents to use compact payload defaults with a supplied payload session id, read `.asdl/prompts/subagent-launch.md` when available, pass payload paths and locators rather than raw JSON to payload-aware summarizers, require a strict `schema_version: 1` classification packet, validate with `pr-address exec validate-feedback-classification` before planning/execution, retry invalid classifications once with diagnostics, use `pr-address exec read-feedback-detail` for targeted body text, and treat explicit inline/full-output mode as a debugging or migration escape hatch. Summary artifact persistence is intentionally deferred until a concrete reload/replay workflow needs a supported write command.
- [x] Resolve `.summary.json` classification artifact persistence for closure.
      Evidence: validation-before-acting is sufficient for the `pr-address` v1 steelthread. The shared payload store still supports `.summary.json` artifacts as a reserved role, but `pr-address` does not need a supported classification-summary write command until a concrete reload/replay workflow appears. The skill keeps validated packets in run-local scratch context instead of requiring durable summary persistence.
- [x] Cover the steelthread with functional tests and closure evidence.
      Evidence: tests cover path/session validation, relative root rejection, payload creation, payload failure, manifest body elision, locator retrieval, prompt resolution and embedded-default drift, `pr-address` completeness validation, and relevant command/schema behavior. The stack's semantic updates record focused pytest, Ruff, `ty`, dprint, schema-command, and diff-check validation for the changed surfaces; the final persistence decision kept the steelthread closed around validation-before-acting instead of adding an unneeded write-command slice.

## Parked

- A standalone generic payload CLI or prompt CLI.
- Automatic Clinkr framework spooling for all large outputs.
- Command-level LLM invocation from `pr-address` or the payload store.
- Broad migrations of non-`pr-address` commands to payload artifacts.
- Branch-naming and commit-summary prompt policies under `.asdl/prompts`.
- Global/user prompt scopes beyond repo-local `.asdl/prompts`.
- Payload retention/GC tooling.
- Bounded body-preview escape hatches in compact manifests.
- Numeric token/character budget tests or measurement scripts.
- A supported `pr-address exec` command for writing classification `.summary.json` artifacts until a concrete reload/replay consumer appears.
- ADRs unless implementation reveals a hard-to-reverse, surprising trade-off that is not already captured by the Objective and docs.
