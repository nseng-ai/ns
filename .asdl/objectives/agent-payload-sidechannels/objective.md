# Agent Payload Side-Channels and Prompt Pluggability

## Thesis

Agent-facing CLI commands should not force large raw payloads into the main conversation transcript when the main agent only needs a compact classification surface and a reliable way to fetch full details on demand. The repository needs a harness-neutral payload side-channel pattern that works in Pi, Claude, and Codex: commands write complete raw machine payloads to standardized private temp files, print compact locator manifests by default, and let agents or subagents perform semantic summarization from file paths rather than pasted JSON.

This Objective tracks the whole architecture plus an end-to-end `pr-address` steelthread. The steelthread matters because PR feedback commands are a concrete, measured source of token growth: in the motivating session, `pr-address exec prepare-run --format json` emitted about 9,674 characters, `get-feedback` emitted about 9,168 characters, and `get-feedback --include-resolved` emitted about 21,771 characters. Review bodies, bot comments, Vercel/Graphite automation, roaster summaries, and resolved-thread history can dominate those payloads even though the main agent usually needs only item identity, location, state, authorship, and enough semantic detail to classify unresolved feedback.

The Objective also tracks the first generalized prompt-pluggability slice. Side-channel summarization depends on harness-specific delegation mechanics, so the repository should introduce a repo-local `.asdl/prompts/subagent-launch.md` policy and a small shared prompt-resolution primitive. That prompt policy is intentionally broader than `pr-address`: it establishes the pattern for future user-editable workflow prompts such as branch naming and commit summaries, while this Objective implements only the launch-policy consumer needed by the PR feedback steelthread.

The durable contract for the payload side-channel and prompt resolver is `docs/specs/agent-payload-sidechannels.md`. This Objective records the purpose, boundaries, completion criteria, and decisions that should stay aligned with that specification.

## Scope

This Objective covers the following design and implementation work:

- A shared payload-store primitive in `asdl-core` for agent side-channel artifacts, used by `pr-address` first. The future namespace is `asdl_core.payloads`.
- A standardized payload path shape under the platform temp directory by default:

  ```text
  <tempdir>/asdl/sessions/<session-id>/payloads/<utc>-<seq>-<descriptor>.<role>.<extension>
  ```

  Examples should look like:

  ```text
  /tmp/asdl/sessions/pi-20260602t181522z-a7f3/payloads/20260602t181701z-0001-pr-address-prepare-run-pr-815.raw.json
  /tmp/asdl/sessions/pi-20260602t181522z-a7f3/payloads/20260602t181750z-0002-pr-address-classification-pr-815.summary.json
  /tmp/asdl/sessions/pi-20260602t181522z-a7f3/payloads/20260602t181800z-0003-pytest-output.log.txt
  ```

- Payload root/session controls:
  - default root is the absolute platform temp directory joined with `asdl`;
  - `ASDL_PAYLOAD_ROOT` is an absolute-path override for the payload root itself;
  - sidecar mode requires a supplied valid session id from an explicit option such as `--payload-session-id` or from `ASDL_PAYLOAD_SESSION_ID`;
  - missing or invalid session ids are rejected before domain work starts;
  - inline mode bypasses payload-store preflight and does not require a session id;
  - harnesses and top-level agent workflows own creating one valid session id per task/session; commands validate but do not invent session ids;
  - session ids, descriptors, and prompt names use the strict safe segment regex `^[a-z0-9][a-z0-9._-]{0,127}$`; unsafe values are rejected, not silently slugified;
  - filename sequence numbers are assigned by scanning existing session payload filenames and using exclusive-create writes to avoid collisions.
- Payload file safety and behavior:
  - v1 artifact roles are `raw`, `summary`, and `log`, with `.raw.json`, `.summary.json`, and `.log.txt` filename suffixes;
  - raw payload files store the full raw Clinkr machine envelope in `.raw.json` artifacts, not just the `data` object, so exit status and failure shape remain replayable;
  - shared payload references record store-owned facts including payload path, session id, descriptor, role, creation timestamp, sequence, byte size, content type, and extension;
  - raw, summary, and log artifacts are written privately under the temp root using private directory/file permissions and exclusive final-path allocation where supported;
  - OS temp cleanup is accepted for retention in this version; do not build a GC command or measurement script in this Objective;
  - sidecar write failure fails closed with a stable payload error and no compact result data, rather than falling back to full stdout.
- An opt-in Clinkr/helper pattern rather than automatic framework-wide spooling. Commands opt in and define their own compact stdout shape; the framework/shared helper owns pathing, naming, safety, raw-envelope serialization, and file writes.
- Changing `pr-address exec prepare-run` and `pr-address exec get-feedback` defaults because backward compatibility is not required for this change:
  - default stdout is a compact locator manifest, in both JSON and human modes;
  - the complete raw machine envelope is written to a `.raw.json` sidecar;
  - an explicit `--payload-mode inline|sidecar` escape hatch exists, with `sidecar` as the default and `inline` intentionally printing the full raw payload;
  - sidecar mode requires a valid payload session id and inline mode does not;
  - machine output uses a deterministic discriminator such as `payload_mode` so callers can branch on `sidecar` versus `inline`;
  - compact output lists every feedback item with non-body metadata and body locators, including every unresolved review thread;
  - compact output includes a shared payload reference/path, PR metadata, counts, per-body `body_chars`, JSON Pointer locators, and PR-domain locators, but no body text by default;
  - no bounded body-preview option is included in v1.
- Locator design for `pr-address` feedback bodies:
  - each elided body locator carries a generic RFC 6901 JSON Pointer into the raw envelope;
  - when available, locators also carry PR-domain identifiers such as `thread_id`, `comment_id`, `review_id`, `discussion_comment_id`, comment index, path, line/start_line, resolved/outdated state, author, and bot/human signal;
  - locators may include a pointer to the enclosing item as well as the body string;
  - no hashes are required in this version.
- Detail retrieval and side-channel summarization:
  - implement a reusable core JSON Pointer lookup primitive in `asdl_core.payloads` for validated JSON payload artifacts;
  - expose agent-facing detail retrieval through `pr-address exec read-feedback-detail` in v1, not through a generic payload CLI;
  - semantic PR feedback summarization/classification is performed by the agent workflow or subagent, not by the CLI invoking an LLM;
  - the PR feedback summary is a full classification packet, not just a relevance summary: every unresolved inline review thread, PR-level review, and discussion comment represented in the manifest must be accounted for exactly once;
  - informational/noise items must be explicitly accounted for by ID rather than disappearing into only aggregate counts;
  - the main workflow validates the classification packet against the deterministic locator manifest, retries the summarization once with focused correction if validation fails, and then stops rather than executing from an invalid packet;
  - LM-generated summaries/classifications are saved as `.summary.json` artifacts beside the raw payload through the shared payload helper, embedding the source raw artifact's payload reference.
- Generalized prompt pluggability for this steelthread:
  - introduce a shared repo-local `.asdl/prompts` resolution primitive in `asdl-core`, under the future `asdl_core.prompts` namespace;
  - for v1, the canonical editable scope is repo-local `.asdl/prompts/<name>.md`; prompt names are safe single segments and subdirectories are out of scope;
  - callers pass an explicit repo root or prompt root; the resolver does not discover git roots itself;
  - the resolver returns prompt content plus provenance metadata that distinguishes repo-local prompts from embedded defaults;
  - embedded defaults keep workflows usable when a repo prompt is missing, but must not obscure `.asdl/prompts` as the user-editable policy surface;
  - add a checked-in `.asdl/prompts/subagent-launch.md` file in the later prompt implementation slice, with identical embedded fallback text protected by a drift test;
  - make `subagent-launch.md` a general delegation policy, not a PR-specific task template;
  - keep the PR feedback classification prompt/schema embedded in the `pr-address` skill/package for now.
- Updating the `pr-address` skill/workflow documentation once sidecar command behavior exists so agents use the side-channel design by default: run the feedback command with a supplied session id, pass the raw payload path to a subagent or equivalent side-channel summarizer when available, validate the returned classification, use selected-detail lookup for targeted bodies, and use explicit inline/full-output mode only as a debugging or migration escape hatch.
- Functional tests for correctness of pathing, sidecar writing, locator manifests, detail lookup, prompt resolution, `pr-address` completeness invariants, and validation behavior. This Objective does not require numeric token/character budget tests or a measurement script.

## Non-Goals

- Do not build a standalone generic payload CLI or prompt CLI in this Objective. `pr-address` wrappers/helpers are acceptable first consumers while the shared primitives stabilize.
- Do not migrate every large-output command in the repo. `pr-address` is the first steelthread; other command migrations are future work.
- Do not add command-level LLM invocation. CLI commands produce deterministic manifests and sidecar files; agents or harness-specific subagents perform semantic judgment.
- Do not make Clinkr automatically spool all large machine outputs. The side-channel behavior is opt-in so each command can define an appropriate compact manifest.
- Do not add bounded body previews or a `--body-preview-chars` escape hatch in v1. Full text comes from sidecar/subagent access, selected-detail lookup, or explicit inline mode.
- Do not implement branch-naming, commit-summary, or other future prompt policies now. They should remain parked examples of the `.asdl/prompts` pattern.
- Do not create a payload retention/GC system or measurement script in this Objective. Files live in temp storage and OS cleanup is accepted for v1.
- Do not add strict numeric token/character budget tests. Functional no-leak/completeness behavior matters more than preserving a particular byte count.
- Do not treat resolved PR review threads as actionable unless explicitly included and selected by the workflow; resolved history can be present as metadata/locator-only reference data.
- Do not store credentials, secrets, or unrelated long-lived archives in payload sidecars. The side-channel is a temporary workflow artifact mechanism, not durable memory.
- Do not turn `.asdl/prompts` into a full policy framework with global/user scopes, registries, YAML schemas, UUIDs, or state-machine behavior in this Objective.

## Completion Criteria

- A shared `asdl-core` payload-store primitive can create session payload directories under the configured temp root, reject relative `ASDL_PAYLOAD_ROOT` values, validate supplied session ids/descriptors with a strict lowercase segment regex, reject missing/invalid session ids in sidecar mode before domain work, allocate timestamp/sequence filenames by scan plus exclusive create, and write private `.raw.json`, `.summary.json`, and `.log.txt` artifacts.
- The store returns shared payload references with payload path, session id, descriptor, role, creation timestamp, sequence, byte size, content type, and extension, while keeping domain identifiers out of the shared reference.
- Raw sidecar artifacts store full raw Clinkr machine envelopes as schema-equivalent JSON to explicit inline machine-envelope output.
- Sidecar write failures produce Clinkr failures with stable payload error types and no result data; commands never fall back to printing raw payloads inline after sidecar write failure.
- `pr-address exec prepare-run` and `pr-address exec get-feedback` default to sidecar mode and no longer print full review/comment bodies to stdout in normal human or JSON operation. They print compact locator manifests with PR metadata, counts, every feedback item, every unresolved thread, non-body item metadata, per-body `body_chars`, body locators, and payload references.
- `--payload-mode inline|sidecar` or an equivalent explicit option exists, with `sidecar` as default and `inline` as an intentional full-stdout debugging/migration path. Inline mode bypasses payload session preflight.
- `pr-address` provides a tested way to retrieve selected full details from a raw sidecar by locator through a `pr-address exec` surface, backed by reusable core RFC 6901 JSON Pointer lookup against validated payload artifacts.
- The `pr-address` classification workflow is updated so a side-channel agent/subagent can read the raw payload path and return a strict full classification packet. The main workflow validates that every manifest feedback item is accounted for exactly once, rejects duplicates/missing ids/unknown ids/invalid enum values, retries once for correction, and fails closed if the packet remains invalid.
- LM summary artifacts can be saved as `.summary.json` payload files through the shared payload helper, embedding the source raw artifact's payload reference.
- A shared `.asdl/prompts` resolver exists for repo-local prompt documents, returns content plus provenance, rejects unsafe prompt names, and provides embedded-default fallback behavior where intended.
- `.asdl/prompts/subagent-launch.md` is checked in with concrete Pi, Claude, Codex, and fallback launch guidance, and its checked-in text matches the embedded fallback through a drift test.
- The `pr-address` skill/reference documentation reflects the new workflow: use compact sidecar defaults with a supplied session id, avoid printing raw JSON into the main transcript, prefer side-channel/subagent summarization when available, use selected-detail lookup for targeted body text, use explicit inline/full-output mode only as an escape hatch, and preserve the per-item completeness invariant.
- Functional tests cover payload path/session validation, relative root rejection, sidecar file creation, sidecar failure behavior, compact manifest shape, body elision/no body text in stdout, locator detail retrieval, prompt resolution behavior, embedded prompt drift, and `pr-address` classification completeness validation. Relevant targeted repo checks pass for changed areas.

## Assumptions and Risks

Assumptions:

- No backward compatibility is required for the current `pr-address exec prepare-run` and `get-feedback` stdout schemas; changing the defaults is acceptable because the current behavior is an agent-token footgun.
- `pr-address` is the right steelthread because its payloads have already been measured in-session and contain both deterministic structure and semantic feedback that benefits from LM judgment.
- Deterministic compaction should be the default for large command outputs; semantic LM summarization should be opt-in for domains where useful interpretation requires judgment, such as PR feedback classification.
- Agent harnesses or top-level workflows can create one valid payload session id per task and pass it through an explicit option or `ASDL_PAYLOAD_SESSION_ID`.
- Agents and subagents in Pi, Claude, and Codex can reliably receive a file path and read a temp sidecar in the same local environment, or can fall back to selected-detail lookup or explicit inline mode when they cannot.
- A strict lowercase slug regex for payload session ids, descriptors, and prompt names is better than silent slugification because wrappers and agents should know when they supplied unsafe path material.
- OS temp cleanup is acceptable for v1 because payloads are short-lived workflow artifacts, not durable records.
- Repo-local `.asdl/prompts` is the right first prompt-pluggability surface. Additional scopes can be added later without changing the steelthread's thesis.
- Keeping the PR feedback task prompt/schema embedded in `pr-address` is acceptable for v1 because the completeness invariant is domain-critical; only launch mechanics need user-editable policy now.

Risks:

- Required session IDs may make default sidecar mode fail in plain terminal use until harnesses/skills pass `ASDL_PAYLOAD_SESSION_ID` or `--payload-session-id`. Inline mode remains the explicit debugging/migration escape hatch.
- Raw sidecar files can contain sensitive PR discussion, code snippets, bot output, and review text. Private temp permissions and temp-root scoping reduce exposure, but relying on OS cleanup means the files can outlive the immediate command.
- Harness behavior may diverge: Pi has an explicit runner-subagent tool, while Claude and Codex availability depends on the surrounding harness. The `.asdl/prompts/subagent-launch.md` policy must be concrete enough to guide all three without pretending they have identical primitives.
- A harness that cannot run a side-channel summarizer may have to use selected-detail lookup or explicit inline mode. The Objective intentionally avoids bounded inline body previews in v1, so docs must make the fallback path clear.
- Strict directory-permission checks can fail on unusual filesystems or preexisting temp roots. Failures should be explicit through `payload_directory_unsafe` or `payload_root_invalid` rather than silently weakening the safety contract.
- Supporting a `log` role in the shared store broadens the primitive beyond the immediate `pr-address` JSON steelthread. The Objective reserves only the artifact role and file contract; broader command-output summary behavior remains separate work.
- Changing existing `pr-address` JSON output may break untracked scripts even if no backward compatibility is required. The explicit `--payload-mode inline` escape hatch mitigates debugging and migration pain.
- The prompt-pluggability idea can easily expand into branch naming, commit summaries, generic prompt CLIs, or global/user scopes. Those are intentionally parked so this Objective can close around one end-to-end steelthread.
- A framework-level auto-spooler might look attractive once the payload store exists, but automatic behavior could surprise command authors and users. Keeping opt-in command manifests is part of the safety boundary.
- Summary validation can fail because model output is incomplete or malformed. The workflow must fail closed after one focused retry rather than allowing partial feedback handling.

## Open Questions

Resolved by the contract specification:

- Bounded previews: no bounded body-preview escape hatch is included in v1. Fallbacks are sidecar/subagent access, selected-detail lookup, and explicit inline mode.
- Selected-detail reader: reusable core RFC 6901 JSON Pointer lookup is accepted as a library/API contract, while agent-facing CLI access remains under `pr-address exec` in v1.
- Prompt default/provenance behavior: the resolver returns content plus provenance, distinguishes repo-local prompts from embedded defaults, and later protects the checked-in `subagent-launch.md` prompt against embedded-default drift.

Remaining implementation questions:

- What exact JSON schema should the PR feedback classification packet use for actionable threads, actionable reviews, discussion actions, informational items, complexity enum values, and locator references?
- What exact Pydantic field names should the `pr-address` compact manifests use, beyond the semantics specified in `docs/specs/agent-payload-sidechannels.md`?
- What exact wording should `.asdl/prompts/subagent-launch.md` use while staying limited to general delegation mechanics?
- Should any part of this design rise to an ADR after implementation reveals a hard-to-reverse trade-off, or is the Objective plus specification and skill/reference documentation sufficient?
- Which future Objective should pick up branch-naming and commit-summary prompt policies once this steelthread proves the `.asdl/prompts` pattern?
