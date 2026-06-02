# Agent Payload Side-Channels and Prompt Pluggability

## Thesis

Agent-facing CLI commands should not force large raw payloads into the main conversation transcript when the main agent only needs a compact classification surface and a reliable way to fetch full details on demand. The repository needs a harness-neutral payload side-channel pattern that works in Pi, Claude, and Codex: commands write complete raw machine payloads to standardized private temp files, print compact locator manifests by default, and let agents or subagents perform semantic summarization from file paths rather than pasted JSON.

This Objective tracks the whole architecture plus an end-to-end `pr-address` steelthread. The steelthread matters because PR feedback commands are a concrete, measured source of token growth: in the motivating session, `pr-address exec prepare-run --format json` emitted about 9,674 characters, `get-feedback` emitted about 9,168 characters, and `get-feedback --include-resolved` emitted about 21,771 characters. Review bodies, bot comments, Vercel/Graphite automation, roaster summaries, and resolved-thread history can dominate those payloads even though the main agent usually needs only item identity, location, state, authorship, and enough semantic detail to classify unresolved feedback.

The Objective also tracks the first generalized prompt-pluggability slice. Side-channel summarization depends on harness-specific delegation mechanics, so the repository should introduce a repo-local `.asdl/prompts/subagent-launch.md` policy and a small shared prompt-resolution primitive. That prompt policy is intentionally broader than `pr-address`: it establishes the pattern for future user-editable workflow prompts such as branch naming and commit summaries, while this Objective implements only the launch-policy consumer needed by the PR feedback steelthread.

## Scope

This Objective covers the following design and implementation work:

- A shared payload-store primitive in `asdl-core` for agent side-channel artifacts, used by `pr-address` first.
- A standardized payload path shape under the platform temp directory by default:

  ```text
  <tempdir>/asdl/sessions/<session-id>/payloads/<utc>-<seq>-<descriptor>.<role>.json
  ```

  Examples should look like:

  ```text
  /tmp/asdl/sessions/pi-20260602t181522z-a7f3/payloads/20260602t181701z-0001-pr-address-prepare-run-pr-815.raw.json
  ```

- Payload root/session controls:
  - default root is the platform temp directory joined with `asdl`, with `ASDL_PAYLOAD_ROOT` as an override;
  - canonical session id comes from an explicit option or `ASDL_PAYLOAD_SESSION_ID` when available;
  - if no session id is supplied, the store generates a safe ad-hoc id;
  - supplied session ids must pass a strict path-segment regex such as `^[a-z0-9][a-z0-9._-]{0,127}$`; unsafe ids are rejected, not silently slugified;
  - descriptors use the same safe lowercase slug policy;
  - filename sequence numbers are assigned by scanning existing session payload filenames and using exclusive-create writes to avoid collisions.
- Payload file safety and behavior:
  - write raw payload files privately under the temp root using atomic/exclusive behavior where practical;
  - store the full raw Clinkr machine envelope in `.raw.json` artifacts, not just the `data` object, so exit status and failure shape remain replayable;
  - rely on OS temp cleanup for retention in this version; do not build a GC command or measurement script in this Objective;
  - fail closed when sidecar writing fails rather than falling back to full stdout.
- An opt-in Clinkr/helper pattern rather than automatic framework-wide spooling. Commands opt in and define their own compact stdout shape; the framework/shared helper owns pathing, naming, safety, and file writes.
- Changing `pr-address exec prepare-run` and `pr-address exec get-feedback` defaults because backward compatibility is not required for this change:
  - default stdout is a compact locator manifest, in both JSON and human modes;
  - the complete raw machine envelope is written to a `.raw.json` sidecar;
  - an explicit `--payload-mode inline|sidecar` escape hatch exists, with `sidecar` as the default and `inline` intentionally printing the full raw payload;
  - compact output lists every feedback item with non-body metadata and body locators, including every unresolved review thread;
  - compact output includes `payload_path`, PR metadata, counts, per-body `body_chars`, and body locators, but no body text by default.
- Locator design for `pr-address` feedback bodies:
  - each elided body locator carries a generic JSON Pointer into the raw envelope;
  - when available, locators also carry PR-domain identifiers such as `thread_id`, `comment_id`, `review_id`, `discussion_comment_id`, comment index, path, line/start_line, resolved/outdated state, author, and bot/human signal;
  - no hashes are required in this version.
- Detail retrieval and side-channel summarization:
  - provide enough generic or `pr-address`-specific helper surface for an agent to fetch one selected full body or item from a raw sidecar without printing the whole payload;
  - semantic PR feedback summarization/classification is performed by the agent workflow or subagent, not by the CLI invoking an LLM;
  - the PR feedback summary is a full classification packet, not just a relevance summary: every unresolved inline review thread must appear exactly once, actionable PR-level reviews and discussion comments must be surfaced, and informational/noise items must be counted or accounted for;
  - the main workflow validates the classification packet against the deterministic locator manifest, retries the summarization once with focused correction if validation fails, and then stops rather than executing from an invalid packet;
  - LM-generated summaries/classifications are saved as `.summary.json` artifacts beside the raw payload through the shared payload helper, and a compact version can still be returned to the main transcript.
- Generalized prompt pluggability for this steelthread:
  - introduce a shared repo-local `.asdl/prompts` resolution primitive in `asdl-core`;
  - for v1, the canonical editable scope is repo-local `.asdl/prompts/<name>.md`; additional scopes may be added later;
  - the implementation may carry embedded defaults so workflows remain usable if a repo prompt is missing, but hidden defaults must not obscure the fact that `.asdl/prompts` is the user-editable policy surface;
  - add a checked-in `.asdl/prompts/subagent-launch.md` file with Markdown sections for Pi, Claude, Codex, and fallback behavior;
  - make `subagent-launch.md` a general delegation policy, not a PR-specific task template;
  - keep the PR feedback classification prompt/schema embedded in the `pr-address` skill/package for now.
- Updating the `pr-address` skill/workflow documentation so agents use the side-channel design by default: run the feedback command, pass the raw payload path to a subagent or equivalent side-channel summarizer when available, validate the returned classification, and use bounded inline previews only as an explicit fallback if no side-channel summarizer is available.
- Functional tests for correctness of pathing, sidecar writing, locator manifests, detail lookup, prompt resolution, `pr-address` completeness invariants, and validation behavior. This Objective does not require numeric token/character budget tests or a measurement script.

## Non-Goals

- Do not build a standalone generic payload CLI or prompt CLI in this Objective. `pr-address` wrappers/helpers are acceptable first consumers while the shared primitives stabilize.
- Do not migrate every large-output command in the repo. `pr-address` is the first steelthread; other command migrations are future work.
- Do not add command-level LLM invocation. CLI commands produce deterministic manifests and sidecar files; agents or harness-specific subagents perform semantic judgment.
- Do not make Clinkr automatically spool all large machine outputs. The side-channel behavior is opt-in so each command can define an appropriate compact manifest.
- Do not implement branch-naming, commit-summary, or other future prompt policies now. They should remain parked examples of the `.asdl/prompts` pattern.
- Do not create a payload retention/GC system or measurement script in this Objective. Files live in temp storage and OS cleanup is accepted for v1.
- Do not add strict numeric token/character budget tests. Functional no-leak/completeness behavior matters more than preserving a particular byte count.
- Do not treat resolved PR review threads as actionable unless explicitly included and selected by the workflow; resolved history can be present as metadata/locator-only reference data.
- Do not store credentials, secrets, or unrelated long-lived archives in payload sidecars. The side-channel is a temporary workflow artifact mechanism, not durable memory.
- Do not turn `.asdl/prompts` into a full policy framework with global/user scopes, registries, YAML schemas, UUIDs, or state-machine behavior in this Objective.

## Completion Criteria

- A shared `asdl-core` payload-store primitive can create session payload directories under the configured temp root, validate supplied session ids/descriptors with a strict lowercase slug regex, generate fallback session ids, allocate timestamp/sequence filenames by scan plus exclusive create, and write full raw Clinkr machine envelopes as `.raw.json` artifacts.
- `pr-address exec prepare-run` and `pr-address exec get-feedback` default to sidecar mode and no longer print full review/comment bodies to stdout in normal human or JSON operation. They print compact locator manifests with PR metadata, counts, every feedback item, every unresolved thread, non-body item metadata, per-body `body_chars`, body locators, and `payload_path`.
- `--payload-mode inline|sidecar` or an equivalent explicit option exists, with `sidecar` as default and `inline` as an intentional full-stdout debugging path.
- `pr-address` provides a tested way to retrieve selected full details from a raw sidecar by locator, including JSON Pointer and PR-domain identifiers where applicable.
- The `pr-address` classification workflow is updated so a side-channel agent/subagent can read the raw payload path and return a strict full classification packet. The main workflow validates that every unresolved inline review thread from the manifest appears exactly once, rejects duplicates/missing ids/invalid enum values, retries once for correction, and fails closed if the packet remains invalid.
- LM summary artifacts can be saved as `.summary.json` payload files through the shared payload helper, linked by descriptor/path to the raw payload workflow.
- A shared `.asdl/prompts` resolver exists for repo-local prompt documents, and `.asdl/prompts/subagent-launch.md` is checked in with concrete Pi, Claude, Codex, and fallback launch guidance.
- The `pr-address` skill/reference documentation reflects the new workflow: use compact sidecar defaults, avoid printing raw JSON into the main transcript, prefer side-channel/subagent summarization when available, use explicit bounded preview or inline/full-output paths only as escape hatches, and preserve the unresolved-thread completeness invariant.
- Functional tests cover payload path/session validation, sidecar file creation, sidecar failure behavior, compact manifest shape, body elision/no body text in stdout, locator detail retrieval, prompt resolution behavior, and `pr-address` classification completeness validation. Relevant targeted repo checks pass for changed areas.

## Assumptions and Risks

Assumptions:

- No backward compatibility is required for the current `pr-address exec prepare-run` and `get-feedback` stdout schemas; changing the defaults is acceptable because the current behavior is an agent-token footgun.
- `pr-address` is the right steelthread because its payloads have already been measured in-session and contain both deterministic structure and semantic feedback that benefits from LM judgment.
- Deterministic compaction should be the default for large command outputs; semantic LM summarization should be opt-in for domains where useful interpretation requires judgment, such as PR feedback classification.
- Agents and subagents in Pi, Claude, and Codex can reliably receive a file path and read a temp sidecar in the same local environment, or can fall back to explicit inline/preview modes when they cannot.
- A strict lowercase slug regex for payload session ids/descriptors is better than silent slugification because wrappers and agents should know when they supplied unsafe path material.
- OS temp cleanup is acceptable for v1 because payloads are short-lived workflow artifacts, not durable records.
- Repo-local `.asdl/prompts` is the right first prompt-pluggability surface. Additional scopes can be added later without changing the steelthread's thesis.
- Keeping the PR feedback task prompt/schema embedded in `pr-address` is acceptable for v1 because the completeness invariant is domain-critical; only launch mechanics need user-editable policy now.

Risks:

- Raw sidecar files can contain sensitive PR discussion, code snippets, bot output, and review text. Private temp permissions and temp-root scoping reduce exposure, but relying on OS cleanup means the files can outlive the immediate command.
- Harness behavior may diverge: Pi has an explicit runner-subagent tool, while Claude and Codex availability depends on the surrounding harness. The `.asdl/prompts/subagent-launch.md` policy must be concrete enough to guide all three without pretending they have identical primitives.
- Locator-only manifests may be too sparse for a harness that cannot run a side-channel summarizer. The design needs an explicit bounded-preview fallback, but the exact option name and default remain to be finalized.
- Changing existing `pr-address` JSON output may break untracked scripts even if no backward compatibility is required. The explicit `--payload-mode inline` escape hatch mitigates debugging and migration pain.
- The prompt-pluggability idea can easily expand into branch naming, commit summaries, generic prompt CLIs, or global/user scopes. Those are intentionally parked so this Objective can close around one end-to-end steelthread.
- A framework-level auto-spooler might look attractive once the payload store exists, but automatic behavior could surprise command authors and users. Keeping opt-in command manifests is part of the safety boundary.
- Summary validation can fail because model output is incomplete or malformed. The workflow must fail closed after one focused retry rather than allowing partial feedback handling.

## Open Questions

- What exact bounded-preview escape hatch should be exposed for no-subagent harnesses? The leading candidate from the design grill was `--body-preview-chars N` with default `0`, where positive values include capped previews in the compact manifest.
- Should the selected-detail reader be a generic payload helper, a `pr-address` helper, or both in the first implementation slice? The design direction favors `pr-address` wrappers first while the generic helper stabilizes.
- What exact JSON schema should the PR feedback classification packet use for actionable threads, actionable reviews, discussion actions, informational counts, complexity enum values, and locator references?
- How should embedded defaults for `.asdl/prompts/subagent-launch.md` be surfaced when a repo-local prompt is missing, given the desired long-term direction of repo-local `.asdl/prompts` as the canonical editable scope?
- Should any part of this design rise to an ADR after implementation reveals a hard-to-reverse trade-off, or is the Objective plus skill/reference documentation sufficient?
- Which future Objective should pick up branch-naming and commit-summary prompt policies once this steelthread proves the `.asdl/prompts` pattern?
