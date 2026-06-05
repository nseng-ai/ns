# Agent Payload Artifacts Terminology Completion

## Thesis

The payload artifact architecture is implemented, but some active docs still describe the pattern with stale channel-oriented language. That vocabulary makes the design sound like an implicit communication path instead of an explicit artifact contract: commands write private payload files, compact manifests carry payload references and locators, and agents inspect selected artifacts or selected details when needed.

This Objective supersedes the closed `agent-payload-sidechannels` Objective for only the remaining terminology and documentation cleanup. The completed implementation work should stay closed; this Objective exists to make current public and agent-facing wording match the shipped payload artifact model.

The old standalone spec at `docs/specs/agent-payload-sidechannels.md` has no current canonical role. Its implementation-relevant facts are carried forward below in payload artifact terminology; historical Objective records may still mention the old path as provenance, but current work should not point readers there.

## Scope

- Audit current code, docs, skills, specs, prompts, and active Objective records for stale channel-oriented wording that is actually about payload artifacts.
- Rewrite the repo-local subagent launch policy and its embedded fallback so it describes payload artifact inspection, path-and-locator passing, selected-detail lookup, and fallback behavior without implying a hidden communication channel.
- Remove stale durable spec references from current docs. The deleted `docs/specs/agent-payload-sidechannels.md` path should not be replaced by another standalone spec unless future implementation work needs one; this Objective record is the current carry-forward terminology and contract note.
- Update active Objective records that refer to the payload artifact architecture, especially command-output summary planning, so new work cites the fresh terminology.
- Preserve historical Semantic Updates, old Objective slugs, and closure records as history unless they are actively misleading current readers.
- Run targeted text audits after edits and record clear closure evidence showing that remaining old payload terms are historical, unrelated to payload artifacts, or intentionally preserved compatibility references.

## Non-Goals

- Do not reopen the completed payload-store, prompt resolver, `pr-address` compact manifest, selected-detail lookup, or classification-validation implementation work.
- Do not rename the old Objective directory or rewrite its historical update log.
- Do not rename unrelated concepts from other domains; this Objective is only about payload artifact terminology.
- Do not create a generic payload CLI, prompt CLI, retention/GC system, bounded body previews, or command-level LLM behavior.
- Do not rewrite every historical branch note, archived update, or old filename solely to erase history.

## Carry-Forward Payload Artifact Contract

Use this section as the current durable summary of the shipped architecture after deleting the stale standalone side-channel spec.

Payload artifacts let agent-facing commands keep large machine-readable results out of the main transcript without losing inspectability. A payload-enabled command writes the complete raw result to a private local artifact, then prints a compact manifest containing enough identity, counts, payload references, and locators for an agent to decide what to inspect next.

Core vocabulary:

- **Payload root:** the configured root directory for payload artifacts, defaulting to the absolute platform temp directory joined with `asdl`.
- **Session id:** a safe single path segment supplied by a harness, workflow, environment variable, or explicit command option to group artifacts for one agent task/session.
- **Descriptor:** a safe caller-supplied artifact descriptor such as `pr-address-get-feedback-pr-815`.
- **Artifact role:** the artifact's workflow role. V1 roles are `raw`, `summary`, and `log`.
- **Payload reference:** the store-owned facts for a written artifact: absolute path, session id, descriptor, role, creation time, sequence, byte count, content type, and extension.
- **Compact manifest:** the transcript-visible command result that embeds a payload reference and locators while eliding large body text by default.
- **Locator:** a stable pointer to content inside a raw artifact, usually an RFC 6901 JSON Pointer plus domain identifiers.

Operational constraints:

- Payload mode requires a valid supplied session id from an explicit option such as `--payload-session-id` or from `ASDL_PAYLOAD_SESSION_ID`; commands must not invent fallback session ids in payload mode.
- Inline mode is the explicit debugging/migration escape hatch and bypasses payload-store preflight.
- Payload artifact paths follow the pattern `<payload-root>/sessions/<session-id>/payloads/<utc>-<seq>-<descriptor>.<role>.<extension>`.
- Safe session ids, descriptors, and prompt names are lowercase single path segments matching `^[a-z0-9][a-z0-9._-]{0,127}$`; invalid values are rejected rather than slugified.
- The payload store owns validated paths, private directory/file creation where supported, sequence allocation, complete writes, cleanup of handled partial-write failures, and returned payload references.
- Payload-enabled Clinkr commands store the full Clinkr machine envelope in `.raw.json` artifacts. The raw artifact is schema-equivalent to explicit inline JSON output.
- The Clinkr dispatcher does not automatically spool every output; commands opt in and own their compact manifest schemas.
- Payload write/preflight failures fail closed with stable payload error types and no fallback dump of the raw payload into the transcript.

Inspection and fallback behavior:

- Compact manifests should contain deterministic facts, payload references, and JSON Pointer/domain locators, but no large body text by default.
- Selected-detail lookup is a narrow RFC 6901 JSON Pointer read against validated JSON payload artifacts; it is not a generic local JSON query system.
- Agent workflows should pass artifact paths and locators to focused subagents or helpers when available.
- When no suitable subagent/helper is available, agents should use deterministic selected-detail lookup, targeted file reads, or explicit inline/full-output mode if the workflow provides one.
- If no fallback path can provide enough evidence, agents should stop and report the limitation rather than act on an incomplete summary.

`pr-address` shipped steelthread:

- `pr-address exec prepare-run` and `pr-address exec get-feedback` default to payload mode and support explicit inline mode.
- Payload mode returns compact manifests with `payload_mode: "payload"`, payload references, PR metadata, counts, feedback items, unresolved review thread information, body character counts, JSON Pointer locators, and PR-domain locators.
- Inline mode returns the full raw output tagged with `payload_mode: "inline"`.
- `pr-address exec read-feedback-detail` reads selected full body/item details from raw payload artifacts through supported manifest locators.
- `pr-address exec validate-feedback-classification` validates that an LM/subagent classification packet accounts for every manifest item exactly once and fails closed with compact diagnostics on missing, duplicate, unknown, or invalid entries.
- `.summary.json` artifacts remain reserved by the shared payload store, but `pr-address` v1 does not require a supported classification-summary write command.

Prompt policy constraints:

- Repo-local prompts live at `.asdl/prompts/<name>.md` and use safe single-segment prompt names.
- Prompt resolution returns content plus provenance and may fall back to embedded defaults.
- `.asdl/prompts/subagent-launch.md` is the editable policy surface for general delegation mechanics. Its embedded fallback should stay text-identical via the existing drift test.
- The subagent launch policy must describe artifact path/locator passing, fallback behavior, and fail-closed validation in harness-neutral terms. It must not contain PR-specific classification schema or imply a hidden communication channel.

Still out of scope:

- generic payload or prompt CLIs;
- hidden generic payload `exec` commands;
- automatic spooling for all Clinkr outputs;
- command-level LLM invocation;
- payload retention, garbage collection, or crash-proof durability tooling;
- bounded body previews such as `--body-preview-chars`.

## Completion Criteria

- Current agent-facing prompt policy files use payload artifact/path/locator terminology and no longer describe the workflow as a hidden channel.
- Current durable docs and active Objective references no longer point to the deleted `docs/specs/agent-payload-sidechannels.md`; current guidance either cites this Objective's carry-forward contract or uses payload artifact terminology directly.
- Active Objective records and roadmap prose that guide future work use payload artifact terminology for the architecture.
- A repo text audit shows no stale channel-oriented hits in current payload artifact docs, skills, prompts, or implementation docs, excluding historical records, old closed Objective identity, and explicitly documented legacy aliases.
- The old closed Objective contains a supersession note pointing to this Objective, while this Objective contains a fresh scope limited to remaining terminology work.
- Relevant Markdown formatting checks pass or any remaining validation limitation is recorded with the closure evidence.

## Assumptions and Risks

Assumptions:

- The implementation behavior is already correct; the remaining problem is vocabulary, canonical references, and reader guidance.
- Keeping the old Objective slug intact is preferable to a slug migration because Objective slugs are durable historical identity.
- The old standalone spec path is not needed as a compatibility shim; current readers should find the carry-forward contract in this Objective and shipped behavior in code/tests.
- Some old terms may remain acceptable in historical update filenames or prose if rewriting them would damage provenance more than it helps current readers.
- Terms from unrelated domains may appear in repo-wide search results, but they are outside this Objective unless they describe payload artifact behavior.

Risks:

- Deleting the old spec path can break stale links in historical records or branches; closure evidence should classify those as historical, not current guidance.
- Over-aggressive search-and-replace could corrupt historical evidence or unrelated domains.
- Leaving too many compatibility mentions could make the rename look incomplete; closure evidence needs a precise allowlist of intentional leftovers.
- Active Objectives such as command-output summaries may drift if they continue to cite the old terminology as the architectural base.

## Open Questions

No terminology-policy questions remain open. Closed Objective records, the selected Objective's own legacy-boundary prose, glossary `_Avoid_:` examples, and unrelated non-payload uses of old terms may remain as classified audit leftovers; current public guidance should expose payload artifact terminology rather than the legacy side-channel name.
