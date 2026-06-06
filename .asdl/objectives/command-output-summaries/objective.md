# Harness-Neutral Command Output Summaries

## Thesis

Agents need a deterministic way to run noisy validation commands without forcing full stdout and stderr into the main conversation transcript. Test, lint, typecheck, build, and similar commands often matter as evidence, but the main agent usually needs only the command, cwd, outcome, elapsed time, output size, selected failure excerpts, bounded tails, and locators for full logs.

This Objective tracks a harness-neutral summarized-command surface. The design should build on the shipped payload artifact architecture carried forward by the `agent-payload-artifacts` Objective: complete raw payloads belong in private payload files with compact manifests in the transcript. This Objective does not need a formal dependency model; it should refer back to that architecture in prose and reuse or mirror its path/session/payload conventions when implementation time arrives.

The first-class outcome is a canonical CLI/helper that any harness can invoke. Pi may get a thin adapter or tool, and Claude/Codex agents may invoke the same CLI directly, but the core behavior should not depend on Pi runner-subagent internals. The command-summary surface should fail closed around full-log leakage: full logs are written to payload artifact files, while model-visible output remains bounded and structured by default.

## Scope

This Objective covers the following design and implementation work:

- A harness-neutral summarized-command CLI/helper, with a working name such as `run-command-summary` or `run_command_summary`, that can run noisy commands from Pi, Claude, Codex, or a normal shell workflow.
- Command invocation modes that support both shell-style commands and argv-style execution where practical, with explicit cwd, timeout, and cancellation behavior.
- Full stdout/stderr preservation in payload artifact files, including separate stdout/stderr logs and a combined log or manifest path suitable for later inspection.
- Compact default output in human and machine-readable forms that includes command display, cwd, exit code or signal, elapsed time, outcome, byte and line counts, bounded stdout/stderr tails, selected failure excerpts, and full-log locators.
- Deterministic profile support for common noisy command classes such as generic commands, tests, lint, and typecheck. Profiles should parse obvious counts and failure headers where possible without invoking an LLM.
- A no-leak contract: full raw stdout/stderr must not appear in default transcript-visible output or structured details; agents receive paths and bounded excerpts instead.
- Nonzero command exits are normal summarized-command outcomes, not wrapper exceptions. Wrapper errors are reserved for failures such as invalid arguments, inability to create log files, or inability to spawn the command.
- Thin harness integration for Pi and usage guidance for other harnesses. Pi integration may be a custom tool or adapter over the canonical helper, but the canonical surface remains harness-neutral.
- Documentation or skill guidance that tells agents to prefer the summarized-command surface over direct `bash` for noisy validation commands and to inspect the full log path only when the compact summary is insufficient.
- Functional tests using synthetic large outputs and failures so normal test runs prove bounded behavior without printing huge real logs.

## Non-Goals

- Do not make this a Pi-only runner-subagent feature. Pi can be a consumer, but the core summarized-command behavior should be harness-neutral.
- Do not build a broad automatic bash-output interceptor or framework-wide safety net in the first Objective. Accidental direct `bash` floods may remain possible until a later Objective decides that trade-off.
- Do not require an LM or subagent to summarize command output. The default command summary is deterministic; agents may later inspect full logs or ask a subagent to interpret them, but that is outside the default summarizer.
- Do not migrate every validation workflow or every repo command at once. The first closure can prove the primitive and update the most relevant agent guidance.
- Do not implement payload retention, garbage collection, or durable archive behavior beyond the payload artifact conventions inherited or mirrored from the payload artifact architecture.
- Do not formally model Objective dependencies, Objective graphs, or branch stacking metadata. Refer to the `agent-payload-artifacts` carry-forward contract in prose as the current architectural basis and keep Objective records narrative.
- Do not add strict numeric token-budget tests. The important functional property is that synthetic huge logs are not included in default model-visible output.

## Completion Criteria

- A canonical harness-neutral CLI/helper exists for summarized command execution, with documented command/cwd/timeout/input semantics and clear human plus machine-readable output modes.
- The helper writes complete stdout, stderr, and combined output artifacts to payload artifact log files using the shared payload artifact store and conventions carried forward by `agent-payload-artifacts`.
- Default output is compact and bounded. It reports outcome, command display, cwd, exit code or signal, elapsed time, stdout/stderr byte and line counts, selected bounded tails, detected profile/count information where available, selected bounded failure excerpts, and full-log paths.
- Full stdout/stderr content is absent from default transcript-visible output and absent from structured result details except for bounded tails/excerpts with explicit size limits.
- Test/lint/typecheck/generic profiles can detect obvious success/failure counts and useful failure headers from representative synthetic outputs without relying on real huge logs in tests.
- Nonzero exits, timeouts, and cancellations return normal summarized outcomes with log paths when possible; wrapper exceptions are limited to wrapper failures such as invalid arguments, log creation failure, or spawn failure.
- Pi has a thin integration path, adapter, or explicit tool/prompt guidance that lets Pi agents use the harness-neutral helper instead of direct `bash` for noisy validation commands. Claude/Codex guidance remains phrased in terms of the same canonical helper rather than Pi-specific mechanics.
- Documentation or skill guidance explains when agents should use summarized command execution, when to inspect full logs, and why direct verbose command output is a context footgun.
- Functional tests cover huge-output success, failure excerpts, bounded tails, machine-readable manifests, log file creation, no-leak details, timeout/cancellation behavior where practical, and targeted profile parsing. Relevant targeted checks pass for changed areas.

## Assumptions and Risks

Assumptions:

- The payload artifact architecture carried forward by `agent-payload-artifacts` is the right architectural base for full log preservation and compact locator manifests; the shared payload artifact store is already shipped, and this Objective can decide how directly to reuse it for command-log capture.
- A standalone CLI/helper is the right canonical surface because Pi, Claude, Codex, and humans can all invoke it without depending on one harness's extension API.
- Deterministic summaries are enough for the common validation loop: the main agent needs outcome evidence, counts, bounded tails, failure excerpts, and log paths more often than it needs semantic interpretation of every line.
- Agents in the relevant harnesses can read local payload artifact log paths when deeper inspection is needed.
- The highest-value initial profiles are tests, lint, typecheck, and generic command output; more specialized parsers can be added later.

Risks:

- Payload artifact logs can contain source snippets, secrets accidentally printed by tools, credentials, or private review/test data. Private file permissions and temp-root scoping reduce exposure, but retention remains a risk until a later cleanup policy exists.
- Output formats vary widely across Bun, pytest, ruff, tsc, package managers, and CI tools. Deterministic parsers may miss useful failure structure or produce sparse summaries for some tools.
- If compact summaries are too sparse, agents may overuse full-log inspection and lose some of the context savings. The first design must choose excerpts and tails that are useful without becoming mini-logs.
- Harness adapters may drift if Pi gets a polished tool while Claude/Codex only receive prose guidance. Keeping the CLI/helper canonical mitigates this.
- The design may be tempted to grow into a full bash replacement or automatic output interceptor. That broader safety net is valuable but should be a separate decision because it can surprise users and command authors.
- Shell-command support can introduce quoting and injection footguns. Argv-style execution and explicit display of the command should be available where practical.

## Open Questions

- What final command name and package location should own the canonical helper?
- How directly should the first implementation reuse the shipped `asdl-core` payload artifact store versus adding a command-summary-specific adapter over the same conventions?
- Which concrete output formats should the first test/lint/typecheck parsers support beyond generic tails and failure excerpts?
- Should Pi integration be a custom tool, a command wrapper, or only prompt guidance around invoking the harness-neutral helper?
- What hard caps should apply to tails, failure excerpts, and final manifest text?

## Closure

Outcome: intentionally subsumed into `cross-harness-parity` as a parity-native shared primitive workstream.

No command-output summary implementation shipped under this standalone Objective. The goal remains active, but the durable owner is now `cross-harness-parity` because the decisive architectural constraint is cross-harness parity: the first implementation must be a shared CLI/helper with skill guidance, with any Pi integration kept as an adapter over that canonical surface. The payload artifact relationship remains unchanged; the absorbed work still builds on the carry-forward contract in `agent-payload-artifacts` for private log artifacts, compact manifests, and locators.

This closure prevents duplicate active Objective records from tracking the same future implementation. The original thesis, scope, risks, and open questions above are preserved as historical source material; active planning and completion tracking now belong to `.asdl/objectives/cross-harness-parity/`.
