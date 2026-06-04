# Roadmap

## Work

- [ ] Define the harness-neutral summarized-command contract and payload artifact manifest shape.
      Evidence: the contract names the canonical invocation surface, command/cwd/timeout/cancellation semantics, output modes, outcome taxonomy, log payload paths, bounded transcript-visible fields, no-leak guarantees, and how it refers back to the `agent-payload-sidechannels` architecture without a formal Objective dependency model.
- [ ] Implement the canonical CLI/helper for payload artifact command capture.
      Evidence: commands can be spawned with explicit cwd and timeout behavior, stdout/stderr/combined logs are written to private payload artifact files, nonzero exits produce normal summarized outcomes, wrapper failures stay distinct, and default human/machine output remains compact.
- [ ] Add deterministic summary profiles for noisy validation commands.
      Evidence: generic, test, lint, and typecheck profiles produce bounded tails, useful failure excerpts, obvious counts where parseable, and sparse-but-correct summaries when formats are unknown.
- [ ] Add thin harness integration and agent guidance.
      Evidence: Pi agents have a practical adapter/tool or documented invocation path, Claude/Codex guidance references the same canonical helper, and agents are instructed to use summarized command execution instead of direct verbose `bash` for noisy validation commands.
- [ ] Prove no-leak behavior with functional tests and documentation updates.
      Evidence: synthetic huge-output success and failure cases preserve full logs in payload artifact files while default content/details remain bounded; timeout/cancellation and profile parsing are covered where practical; docs explain full-log inspection and context-savings behavior.

## Parked

- A broad automatic bash-output interceptor or framework-wide output safety net.
- A Pi-only runner-subagent test-summary tool as the canonical implementation.
- LM/subagent semantic interpretation of command logs as default summarizer behavior.
- Migration of every validation command or package workflow to the new helper.
- Payload retention, garbage collection, or durable archive policy beyond inherited payload artifact conventions.
- Formal Objective dependency graphs or machine-modeled stacking relationships.
- Strict numeric token-budget tests or measurement scripts.
