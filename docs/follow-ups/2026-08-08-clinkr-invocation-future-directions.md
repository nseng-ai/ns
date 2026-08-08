# Follow-up: Clinkr invocation future directions

**Point in time:** 2026-08-08\
**Origin:** final follow-up from Objective `clinkr-output-and-interaction-model`, incorporating its parked `mcp-as-third-host.md` analysis\
**Status at capture:** deliberately deferred; not part of Clinkr's current supported surface or the Objective's completion gate

## Why this follow-up exists

The Objective established a deliberately small invocation contract: finite JSON request input, invocation-scoped text and raw-byte output, rendering capability, and host-owned semantic confirmation and selection. Standalone process adapters and Pi are the supported production host shapes exercised by that work; tests provide strict fakes and capture.

Several broader models could become useful, but implementing them now would turn demonstrated host needs into a speculative protocol. This note preserves the evidence and constraints needed to judge those directions later. It is a point-in-time planning input, not a commitment, specification, roadmap, or implicit condition of Objective closure. Revalidate all claims against current code, SDKs, and protocols before acting.

## Reopening rule

Do not reopen this design space because a richer abstraction appears cleaner or more general. Reopen one direction only when its evidence threshold below is met by a concrete supported consumer or repeated production limitation. Keep each resulting project bounded: evidence for one direction does not authorize the others.

## Direction 1: semantic Response or event models

A host-neutral `Response`, final-presentation type, or event stream could let commands return structured outcomes that adapters map to terminal rendering, machine envelopes, or another transport. Such a model might eventually replace some direct sink writes, but the current invocation-scoped output contract already supports terminal, Pi, and tests without requiring a new ontology.

**Evidence required to reopen:**

- two production hosts need materially different presentations of the same command result and cannot derive them reliably from the command's existing result plus captured output;
- callers need typed outcome data that cannot be represented by current command outcomes or machine envelopes without parsing rendered text; or
- repeated command implementations duplicate the same result-to-presentation mapping, with examples showing that a shared semantic type would remove duplication without encoding one host's vocabulary.

Before designing, inventory concrete result shapes, error mappings, and consumers. Prove that a smaller command-owned result type does not solve the problem. Do not introduce `ClinkrResponse`, `ClinkrFinalPresentation`, or a general event protocol from hypothetical transport symmetry alone.

**Current boundary:** semantic Response and event models are not part of Clinkr's current supported surface and are not a completion gate for `clinkr-output-and-interaction-model`.

## Direction 2: richer standalone terminal adapters

A standalone adapter could use a rich interaction library for arrow-key selection, masked input, live validation, or other terminal-native prompts while preserving semantic operations at the Clinkr boundary. Prior interaction-library analysis favored `@inquirer/prompts` behind the adapter, with `@inquirer/testing` for adapter conformance, rather than exposing Inquirer, Clack, or `prompts` types through Clinkr APIs.

**Evidence required to reopen:**

- a shipped standalone command requires a specific interaction that line-based confirmation or selection cannot provide acceptably;
- the interaction has explicit fallback and non-interactive behavior, including cancellation and cleanup requirements; and
- an adapter spike proves the library can stay behind semantic Clinkr capabilities without leaking streams, raw mode, key events, cursor state, or lifecycle types into command contracts.

At reopening, compare the candidate library's maintenance, accessibility, testability, and terminal cleanup behavior against the current adapter. Pi must continue to use Pi's runtime UI instead of running a terminal prompt library inside the TUI.

**Current boundary:** rich terminal prompting beyond the existing semantic adapters is not part of Clinkr's current supported surface and is not a completion gate for `clinkr-output-and-interaction-model`.

## Direction 3: streamed progress and notices

Long-running commands may eventually need semantic progress updates or notices distinct from final output. A host could render those as transient terminal status, Pi UI updates, logs, or protocol notifications. Today, ordinary invocation-scoped output sinks are the supported mechanism; no general progress or notice lifecycle is promised.

**Evidence required to reopen:**

- a production command has measured user-facing latency long enough that final-only presentation is inadequate;
- at least two hosts need different handling of the same intermediate information, so plain text writes are demonstrably insufficient;
- the consumer requirements specify ordering, cancellation, backpressure, terminal/non-terminal behavior, and whether events are durable or transient; and
- tests show that a bounded progress or notice capability solves the cases without requiring a universal event bus.

Prefer a narrow capability such as progress reporting over a unified event ontology when that is all the evidence supports. Keep diagnostics, logs, user notices, and final outcomes distinct unless consumers prove they share semantics.

**Current boundary:** semantic streamed progress and notices are not part of Clinkr's current supported surface and are not a completion gate for `clinkr-output-and-interaction-model`.

## Direction 4: raw-command or PTY virtualization

Raw commands currently own their argv tail and invocation-scoped byte output. They intentionally do not receive the structured JSON request contract. PTYs, general stdin, raw mode, key events, cursor/screen state, resize handling, and terminal-session lifecycle would form a substantially different execution model.

**Evidence required to reopen:**

- a named supported embedded host must run a specific existing raw or terminal-oriented command that cannot be replaced by a structured command;
- byte input/output, TTY detection, resize, signals, cancellation, and cleanup requirements are documented from that consumer;
- a threat and failure analysis covers control-sequence safety, process isolation, resource leaks, and host-renderer corruption; and
- a prototype proves that the required behavior can be isolated behind an explicit raw/PTY capability split without broadening structured command contracts.

Do not infer a general PTY requirement from the existence of raw byte sinks. Reject raw commands in hosts that cannot safely supply their required capabilities rather than silently inheriting ambient process terminal state.

**Current boundary:** raw-command input virtualization, PTYs, terminal sessions, and related controls are not part of Clinkr's current supported embedded surface and are not a completion gate for `clinkr-output-and-interaction-model`.

## Direction 5: additional production hosts, including MCP

### Preserved MCP case

Clinkr's schema-first commands and invocation-scoped services suggest that an MCP adapter could eventually derive tool input schemas and expose the same business logic without hand-building a second command surface. The original Objective reference mapped a possible richer channel model as follows:

| Candidate Clinkr concept | Candidate MCP mapping                               |
| ------------------------ | --------------------------------------------------- |
| Request                  | Tool call arguments derived from the command schema |
| Response                 | Tool result and error representation                |
| Progress                 | Progress notifications                              |
| Notice                   | Logging/message notifications                       |
| Semantic interaction     | MCP's applicable elicitation mechanism              |

This is design evidence, not a current Clinkr contract: Response, Progress, and Notice are deferred concepts, and an adapter must map from the interfaces that actually exist when work begins.

The preserved 2026-07 analysis also noted an anticipated stateless, multi-round-trip MCP shape: unanswered elicitation returns an input-required result and the client retries with supplied answers. If that protocol shape remains current, Clinkr's strict fake interaction—predetermined answers and failure on unexpected prompts—is useful adapter precedent. It also makes replay safety important: a command must confirm before mutation or be idempotent up to an unanswered interaction. This claim came from a then-current MCP announcement and must be checked against the authoritative specification and supported SDK before implementation.

### Evidence required to reopen

- a named production consumer needs one or more ns/Clinkr capabilities through MCP or another specific host;
- that consumer identifies the exact commands, authentication and trust posture, deployment model, error semantics, and interaction requirements;
- the current host protocol and SDK are stable enough to implement and test against authoritative conformance behavior;
- a mapping exercise shows which existing Clinkr capabilities are sufficient and identifies any gap from concrete calls rather than anticipated protocol symmetry; and
- commands selected for replay-style elicitation are audited for mutation-before-confirmation and idempotence.

An eventual MCP project must also resolve structured outcome to tool-result/error mapping, agent auto-answer trust policy, cancellation, and the exclusion or explicit capability split of raw commands. Cross-call state should remain explicit and consumer-visible rather than becoming hidden process-global session state.

### Option-preserving constraints

Regardless of whether MCP is pursued, the current boundaries preserve host portability:

- keep request schemas authoritative and machine-derivable;
- keep interaction semantic and satisfiable by injected answers rather than terminal-only dialogue;
- keep rendering and process streams out of business logic;
- keep services and output invocation-scoped; and
- confirm before mutation, or make pre-interaction work safe to replay.

These are useful design tests, not an obligation to build a third host.

**Current boundary:** MCP and every other additional production host are not part of Clinkr's current supported surface and are not a completion gate for `clinkr-output-and-interaction-model`. A concrete consumer should start a separate bounded Objective rather than extending the completed one by implication.

## Verification required before acting

For any direction:

1. Read the current Clinkr, Foundation, SDK, and host documentation and inspect the implementation rather than relying on this dated note.
2. Name the production consumer and capture failing or inadequate scenarios under the existing invocation contract.
3. Recheck relevant external protocols and libraries against primary sources.
4. Define the smallest new capability and its unsupported cases before choosing a general ontology.
5. Prove standalone, embedded, fake-driven, and headless behavior where applicable, including absence of ambient process input/output leakage.
6. Create a new Objective if the work spans multiple semantic slices. Do not use this follow-up as a parallel roadmap.

## Promotion signal

Promote one direction into a new Objective only when:

- its direction-specific evidence threshold is met;
- a named owner or product surface requires the capability;
- current consumers and failure cases are documented;
- the first bounded implementation slice and validation evidence are known; and
- the proposal preserves the structured-command boundary or explicitly justifies a separate capability family.

No promotion signal in this note is satisfied merely by closing `clinkr-output-and-interaction-model`.
