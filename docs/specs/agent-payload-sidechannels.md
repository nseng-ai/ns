# Specification: Agent payload side-channels and prompt launch policy

Status: Contract specification for implementation
Scope: shared payload artifact conventions, prompt resolution, and the `pr-address` first steelthread.

This document specifies observable behavior and stable file/wire contracts. It does not prescribe exact internal class names, module layout, or implementation techniques beyond the namespace and command-surface boundaries called out here.

---

## 1. Purpose and audience

Agent-facing CLI commands sometimes produce machine-readable payloads that are too large for the main agent transcript. The side-channel pattern lets a command write the complete raw payload to a private local artifact and print a compact manifest with enough identity, counts, and locators for the agent to decide what to inspect next.

This specification is for implementers of the shared `asdl-core` primitives, `pr-address` command authors, skill/documentation authors, and harness integrations in Pi, Claude, Codex, or equivalent local agent environments.

The first concrete consumer is `pr-address` because PR reviews, review threads, discussion comments, bot comments, and resolved-thread history can be large while the main agent usually needs a smaller classification surface.

## 2. Definitions

- **Payload root**: the configured root directory for side-channel artifacts. By default this is the absolute platform temp directory joined with `asdl`.
- **Session id**: a safe single path segment supplied by a harness, workflow, environment variable, or explicit command option to group artifacts for one agent task/session.
- **Descriptor**: a safe caller-supplied artifact descriptor such as `pr-address-get-feedback-pr-815`.
- **Artifact role**: the artifact's role in the workflow. V1 roles are `raw`, `summary`, and `log`.
- **Content type / extension**: the artifact's stored representation. The metadata `extension` value has no leading dot, for example `json` or `txt`.
- **Payload reference**: the shared store-owned object that identifies a written artifact and its storage facts.
- **Raw artifact**: a `.raw.json` file containing the full raw machine envelope for a command result.
- **Summary artifact**: a `.summary.json` file containing a derived summary or classification packet and a reference to its source raw artifact.
- **Compact manifest**: a command/domain-specific stdout result that embeds a payload reference and locators while eliding large body text by default.
- **Locator**: a stable pointer to content inside a raw artifact, usually an RFC 6901 JSON Pointer plus domain identifiers.

## 3. Non-goals

This contract does not require or authorize the following in v1:

- a generic payload CLI or prompt CLI;
- a hidden generic payload `exec` command;
- automatic Clinkr dispatcher spooling for all command outputs;
- command-level LLM invocation;
- migration of non-`pr-address` commands;
- `.asdl/prompts/subagent-launch.md` creation during the docs-first contract slice;
- `skills/pr-address/SKILL.md` rewrite before sidecar command behavior exists;
- payload retention, garbage collection, or crash-proof durability tooling;
- numeric token/character budget tests;
- a bounded body-preview option such as `--body-preview-chars` in v1.

The supported escape hatches for full body text are sidecar/subagent access, selected-detail lookup, and explicit inline mode.

## 4. Payload-store contract

### 4.1 Namespace and architecture boundary

The shared payload-store primitive belongs under the future `asdl_core.payloads` namespace. It should be framework-agnostic: the store owns validated paths, artifact names, writes, and payload references, while individual commands own their compact domain manifests.

A small Clinkr adapter/helper may be layered on top of the pure store, but Clinkr must not automatically spool every command output. Sidecar-enabled commands opt in explicitly.

The implementation may expose a small `PayloadStore`-like object constructed with root and session settings, with methods equivalent to writing JSON artifacts and text/log artifacts. The stable contract is the observable behavior, not exact Python spelling.

### 4.2 Root, session, and path controls

Sidecar mode requires a valid supplied session id. The session id sources are, in order:

1. an explicit command option such as `--payload-session-id`;
2. the `ASDL_PAYLOAD_SESSION_ID` environment variable.

If no session id is supplied in sidecar mode, command preflight fails before domain work starts. If a supplied session id is invalid, preflight fails before domain work starts. Commands must not invent generated fallback session ids in sidecar mode.

Inline mode bypasses payload-store preflight and does not require a session id. The harness or top-level agent workflow owns creating one session id per task/session; individual commands validate it but do not create it.

The default payload root is:

```text
<absolute-platform-temp-directory>/asdl
```

`ASDL_PAYLOAD_ROOT` is an absolute-path override for the payload root itself. Relative `ASDL_PAYLOAD_ROOT` values are rejected. Artifacts live under:

```text
<payload-root>/sessions/<session-id>/payloads/<utc>-<seq>-<descriptor>.<role>.<extension>
```

Default-root example:

```text
/tmp/asdl/sessions/pi-20260602t181522z-a7f3/payloads/20260603t123456z-0001-pr-address-get-feedback-pr-815.raw.json
```

### 4.3 Safe segment validation

Session ids, descriptors, and prompt names use the same strict safe lowercase segment regex:

```text
^[a-z0-9][a-z0-9._-]{0,127}$
```

Invalid supplied values are rejected. Implementations must not silently slugify invalid values. Descriptors are supplied by callers as already-safe strings. Prompt names are safe single segments only; subdirectories are out of scope for v1.

### 4.4 Artifact roles, content types, and filenames

V1 reserves these artifact roles:

- `raw`
- `summary`
- `log`

JSON artifacts use `.raw.json` and `.summary.json` suffixes. Text/log artifacts use `.log.txt`. Filenames follow:

```text
<utc>-<seq>-<descriptor>.<role>.<extension>
```

Examples:

```text
20260603t123456z-0001-pr-address-get-feedback-pr-815.raw.json
20260603t123500z-0002-pr-address-classification-pr-815.summary.json
20260603t123530z-0003-pytest-output.log.txt
```

The metadata `extension` value is recorded without a leading dot, for example `json` or `txt`.

### 4.5 Sequence allocation and write behavior

The sequence number is a monotonically increasing counter per session payload directory. Writers allocate a sequence by scanning matching payload filenames in that directory, taking the maximum existing sequence plus one, and creating the final path exclusively. On collision, the writer rescans and retries.

Directory and file safety rules:

- create the root, session, and payload directories with private `0700` permissions where supported;
- create payload files with private `0600` permissions where supported;
- reject existing ASDL-managed root/session/payload paths that are not directories or are unsafe;
- write the complete artifact before returning its reference;
- clean up partial files on handled write errors;
- do not promise fsync behavior, crash-proof durability, or durable retention.

OS temp cleanup is accepted for v1.

### 4.6 `PayloadReference`

Compact manifests and summary artifacts embed a shared payload-reference object for store-owned facts. Required fields are:

| Field            | Meaning                                      |
| ---------------- | -------------------------------------------- |
| `payload_path`   | Absolute path to the written artifact.       |
| `session_id`     | Validated session id.                        |
| `descriptor`     | Caller-supplied safe descriptor.             |
| `role`           | Artifact role, e.g. `raw`, `summary`, `log`. |
| `created_at_utc` | UTC timestamp used for the artifact.         |
| `sequence`       | Session-global sequence number.              |
| `payload_bytes`  | Size of the stored artifact in bytes.        |
| `content_type`   | Stored content type.                         |
| `extension`      | Stored extension without leading dot.        |

Example:

```json
{
  "payload_path": "/tmp/asdl/sessions/pi-20260602t181522z-a7f3/payloads/20260603t123456z-0001-pr-address-get-feedback-pr-815.raw.json",
  "session_id": "pi-20260602t181522z-a7f3",
  "descriptor": "pr-address-get-feedback-pr-815",
  "role": "raw",
  "created_at_utc": "2026-06-03T12:34:56Z",
  "sequence": 1,
  "payload_bytes": 18421,
  "content_type": "application/json",
  "extension": "json"
}
```

Domain identifiers do not belong in `PayloadReference`. PR numbers, thread IDs, comment IDs, authors, file paths, and line numbers belong in `pr-address` manifest models.

### 4.7 Stable payload errors

The payload layer reserves these stable error types for future Clinkr failures and tests:

- `payload_session_required`
- `payload_session_invalid`
- `payload_root_invalid`
- `payload_directory_unsafe`
- `payload_write_failed`
- `payload_lookup_failed`

A sidecar-write failure in a Clinkr operation is a command failure: exit code `2`, a stable payload error type such as `payload_write_failed`, a useful message, and no compact result `data`. The command must not fall back to printing the raw payload inline.

## 5. Clinkr adapter contract

A `.raw.json` sidecar stores the full Clinkr machine envelope for the operation, not only the `data` object. It is schema-equivalent to the same command's explicit inline JSON machine-envelope output: formatting need not be byte-for-byte identical, but JSON shape and values must be equivalent.

Sidecar-enabled Clinkr commands may return discriminated unions. Machine callers must be able to branch on a stable discriminator such as `payload_mode`.

The adapter/helper boundary is intentionally explicit:

- the pure payload store owns artifact creation and references;
- the Clinkr helper converts command results to raw envelopes and maps write failures to Clinkr failures;
- each command owns its compact manifest schema;
- the Clinkr dispatcher does not auto-spool outputs.

## 6. Compact manifest contract

Compact stdout results are command/domain-specific Pydantic-compatible models. They embed the shared `PayloadReference`; the payload store does not own compact-manifest construction.

Compact manifests should contain enough deterministic facts for an agent to decide what full detail to request next, while excluding large body text by default.

For `pr-address`, compact manifests must include:

- a payload reference/path to the raw sidecar;
- PR metadata;
- counts;
- every relevant feedback item;
- every unresolved review thread;
- non-body item metadata;
- `body_chars` for elided body fields;
- JSON Pointer locators;
- PR-domain locators;
- no body text by default.

## 7. JSON Pointer and detail lookup contract

Reusable detail lookup belongs in `asdl_core.payloads` as a narrow library/API feature. It supports RFC 6901 JSON Pointer lookup against JSON payload artifacts only.

The lookup API accepts only one of:

- a `PayloadReference`; or
- a validated payload artifact path under an allowed payload root/session.

It is not an arbitrary local JSON-file reader. It performs no filtering, search, query-language evaluation, or domain interpretation. It returns the selected JSON value plus minimal artifact/path/pointer metadata.

V1 exposes no generic payload CLI. Agent-facing selected-detail access for the steelthread is through a future `pr-address exec read-feedback-detail` command.

Body locators in compact manifests should include an RFC 6901 JSON Pointer to the body string inside the full raw machine envelope. When useful, they should also include a pointer to the enclosing review, thread, comment, or discussion item. PR-domain locators may include thread id, comment id, review id, discussion comment id, comment index, path, line/start line, resolved/outdated state, author, and bot/human signal. Hashes are not required in v1.

## 8. `pr-address` steelthread contract

`pr-address exec prepare-run` and `pr-address exec get-feedback` eventually accept an explicit `--payload-mode inline|sidecar` option or equivalent.

- Default mode is `sidecar`.
- `sidecar` requires a valid payload session id and fails preflight before GitHub or repository domain work if the id is missing or invalid.
- `inline` bypasses payload session preflight and returns the full raw output for debugging and migration.
- Machine output is a discriminated union: sidecar mode returns a compact manifest with `payload_mode: "sidecar"`; inline mode returns the raw model or raw wrapper tagged with `payload_mode: "inline"`.

Sidecar mode changes transport, not the raw data contract. The raw sidecar contains the same full machine-envelope shape available through inline JSON output.

No bounded body-preview escape hatch is included in v1. Implementers must not add default compact body previews or a `--body-preview-chars` option as part of this Objective. The supported paths to full text are sidecar/subagent access, selected-detail lookup, and explicit inline mode.

## 9. Classification summary and validation contract

`.summary.json` artifacts are separate payload files in the same session. Summary JSON content embeds the source raw artifact's `PayloadReference`; it does not rely on filename proximity, matching descriptors, mutable indexes, or mutation of the raw artifact. Summaries may carry LM-generated classification packets plus validation metadata.

For PR feedback classification:

- the compact manifest is the deterministic authority for validation;
- inline review classification is thread-level: exactly one classification entry per unresolved review thread, with nested locators/comment/body references as needed;
- every manifest feedback item is accounted for exactly once, including unresolved inline review threads, PR-level reviews, and discussion comments;
- informational/noise items carry explicit per-ID accounting rather than disappearing into only aggregate counts;
- existing `pr-address` vocabulary is preserved where possible: `actionable_reviews`, `discussion_actions`, `informational_count`, `pre_existing`, and `complexity`;
- current complexity concepts are preserved unless implementation discovers a strong reason to change them: `pre_existing`, `local`, `single_file`, `cross_cutting`, and `complex`.

Deterministic validation is exposed later as `pr-address exec validate-feedback-classification`. Validation failures return compact structured diagnostics with no body text. Diagnostics identify missing IDs, duplicate IDs, unknown IDs, invalid enum values, unexpected/unaccounted groups, and relevant manifest locators/counts.

The main workflow retries an invalid LM classification once with the structured diagnostics, then fails closed.

## 10. Prompt resolver contract

Prompt resolution belongs under the future `asdl_core.prompts` namespace.

The resolver has a pure, explicit API: callers pass a `repo_root` or `prompt_root`; the resolver does not discover git repository roots itself. Prompt names are safe single segments matching the shared regex, and repo-local prompts live at:

```text
.asdl/prompts/<name>.md
```

The resolver returns content plus provenance metadata, not content alone. Provenance distinguishes at least:

- repo-local prompt: `source: "repo"`, with path;
- embedded default: `source: "embedded_default"`, with a missing/default indicator or message.

Embedded defaults must not obscure `.asdl/prompts` as the editable policy surface. In the implementation slice that adds `subagent-launch.md`, the checked-in prompt and embedded fallback should be identical and protected by a drift test.

The `subagent-launch.md` policy is not created in the docs-first contract slice. When created later, it must be general delegation mechanics only. Required sections cover:

- when to use subagents;
- how to pass file paths;
- Pi launch guidance;
- Claude launch guidance;
- Codex launch guidance;
- fallback behavior when no side-channel subagent is available;
- safety and failure behavior.

It must not contain PR-specific classification schema or task prompt text.

## 11. Future implementation sequence

A conforming implementation should proceed in small slices:

1. implement the shared `asdl_core.payloads` store and opt-in Clinkr helper;
2. implement the prompt resolver and add the `subagent-launch.md` policy with embedded-default drift protection;
3. convert `pr-address exec prepare-run` and `get-feedback` to sidecar defaults with inline mode;
4. add `pr-address exec read-feedback-detail` on top of core JSON Pointer lookup;
5. add classification validation and `.summary.json` writing;
6. update `pr-address` skill/docs once command behavior exists;
7. close with functional tests and Objective evidence.

## 12. Functional test matrix

### 12.1 Payload store

- Reject missing session id in sidecar store construction or command preflight.
- Reject invalid session id values.
- Reject invalid descriptors.
- Reject relative `ASDL_PAYLOAD_ROOT`.
- Create private root/session/payload directories.
- Fail on unsafe existing ASDL-managed directories.
- Write JSON artifacts with `.raw.json` and `.summary.json` suffixes.
- Write text/log artifacts with `.log.txt` suffixes.
- Return `PayloadReference` with all required fields.
- Allocate session-global sequence by scanning existing files.
- Retry on exclusive-create collision.
- Clean up partial files on handled write error.

### 12.2 Clinkr adapter

- `.raw.json` sidecar content is schema-equivalent to the inline machine envelope.
- Sidecar write failure produces a failure envelope with a stable `error_type` and no `data`.
- Inline mode bypasses payload session requirement.
- Sidecar mode preflight happens before domain/GitHub work.

### 12.3 Prompt resolver

- Resolve repo-local `.asdl/prompts/subagent-launch.md` when present.
- Return an embedded default with provenance when the repo prompt is missing and a default exists.
- Reject unsafe prompt names and subdirectory names.
- Detect drift between checked-in prompt text and embedded fallback text.

### 12.4 `pr-address` manifest, detail, and validation

- Default sidecar result contains a compact manifest with no body text.
- Compact manifest lists every expected feedback item with body character counts and locators.
- Raw sidecar contains full bodies.
- `read-feedback-detail` resolves a body pointer and item pointer without dumping the whole payload.
- Classification validator accepts a packet that accounts for all manifest items exactly once.
- Classification validator rejects missing, duplicate, unknown, and invalid enum entries.
- Validator failure reports contain IDs, locators, and counts but no body text.
- `.summary.json` classification artifact embeds the source raw `PayloadReference`.

## 13. Risks and open questions

### 13.1 Risks

- Required session IDs may make default sidecar mode fail in plain terminal use until harnesses/skills pass `ASDL_PAYLOAD_SESSION_ID` or `--payload-session-id`. Mitigation: inline mode remains an explicit escape hatch, and skill/harness guidance must create a valid session id.
- Strict directory permissions can fail on unusual filesystems or preexisting temp roots. Mitigation: fail closed with clear `payload_directory_unsafe` or `payload_root_invalid` errors.
- Supporting the `log` role broadens the shared store beyond the immediate `pr-address` JSON steelthread. Mitigation: this contract only reserves store support; command-output summary implementation remains separate work.
- Reusable JSON Pointer lookup has one immediate JSON consumer. Mitigation: keep it narrow: RFC 6901 against validated payload artifacts only, no query language and no generic CLI.
- Raw sidecar files can contain sensitive PR discussion, code snippets, bot output, and review text. Mitigation: private temp permissions and temp-root scoping; retention remains OS temp cleanup in v1.

### 13.2 Open implementation questions

These questions do not block implementation of the contract:

- exact Python method names and module layout under `asdl_core.payloads` and `asdl_core.prompts`;
- exact Pydantic field names for `pr-address` compact manifests and classification packets, beyond the semantics specified here;
- exact wording of `.asdl/prompts/subagent-launch.md`;
- whether an ADR is warranted after implementation reveals a hard-to-reverse trade-off not already captured by this specification and the Objective record.
