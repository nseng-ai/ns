# ADR 0050: Portable skill-first Objective autorun

## Status

Accepted

## Context

Objective autorun was exposed primarily through a Pi command-backed skill and a project-local model-visible `objective_runner_step` tool. The tool mechanically combined the ADR 0024 `runner-begin` and `runner-finish` commands with Pi subagent dispatch. That arrangement made an orchestration workflow expressed mostly in Markdown appear to require the ns CLI and a repository-local Pi extension even when a repository already had Git, Objective Markdown records, and a harness capable of implementation delegation.

ADR 0024 remains the stricter protocol for one runner-attested Objective Runner step. ADR 0037 remains the publication boundary for a real Runner Checkpoint. Neither decision requires every autorun to use those facilities, but portable execution must not imitate their attestation or provenance.

## Decision

`objective-autorun` is a normally model-invocable, self-contained skill and the primary orchestration surface. `/ns:objective:autorun` remains an optional Pi picker that selects an Objective and injects the same skill; it owns no execution protocol.

At launch, autorun probes the exact help surfaces for both `ns objective exec runner-begin` and `ns objective exec runner-finish`. It selects `ns-bookended` mode only when both probes succeed. Otherwise it selects `portable` mode. A user may force portable mode. An explicit request for ns-bookended mode fails closed when either command is unavailable. The selected mode and its guarantees are shown in the launch preview before confirmation.

In `ns-bookended` mode, autorun directly performs the ADR 0024 begin, harness dispatch, and finish sequence. `runner-finish` owns verification and the provenance commit. The resulting Runner Checkpoint is **runner-attested**. The advanced `objective-runner-step` skill remains an invoke-only ns-specific workflow, but autorun does not depend on loading it.

In `portable` mode, the parent manages one attached non-trunk feature branch for the entire run and accepts at most one coherent slice per step. Before dispatch it records the branch, HEAD, status, Objective, and selected slice. The implementation child leaves changes uncommitted and has no external-write authority. The parent inspects the diff, verifies unchanged branch and HEAD, checks scope and repository state, runs appropriate validation, and creates one ordinary local commit for an accepted slice. These conclusions are **parent-verified**. Portable commits do not carry Objective Runner provenance and are not Runner Checkpoints.

Objective tracking remains parent judgment between implementation steps. Material tracking may be committed separately and is reported separately from implementation commits.

Portable autorun is local-only. ADR 0037 publication is unavailable in portable mode because its input requires a real committed Runner Checkpoint. Any later push, submit, or pull-request operation is a separate, explicitly requested normal workflow after autorun ends.

The project-local `.pi/extensions/objective-autorun.ts` tool and its `objective_runner_step` registration are removed without a compatibility shim.

## Consequences

- Git plus checkout-local Objective Markdown and harness implementation capability are the minimum portable runtime; direct skill use does not require ns, Graphite, Branch Context, or Pi.
- Every preview and digest names the execution mode and verification authority. “Objective Runner” and “Runner Checkpoint” remain reserved for the ADR 0024 protocol.
- Portable mode favors simple reviewability: one feature branch for the run and one ordinary commit per accepted implementation step.
- Capability loss changes the previewed mode and requires confirmation; it cannot silently weaken requested guarantees.
- The retained Pi command remains useful for selection while avoiding duplicated workflow behavior.
- ADR 0024 remains valid for deterministic begin/finish attestation, and ADR 0037 remains valid for narrowly bound publication after that attestation. They are not rewritten because portable mode is an additional, explicitly weaker trust contract rather than a replacement for either decision.

## Alternatives

- **Require ns bookends for all autorun:** rejected because it makes a prompt-driven workflow needlessly host- and repository-specific.
- **Treat parent verification as equivalent to a Runner Checkpoint:** rejected because it erases the trust boundary and could incorrectly authorize ADR 0037 publication.
- **Keep or promote the Pi-only tool:** rejected because the skill can express both loops and the tool makes Pi mechanics appear fundamental.
- **Create a branch per portable step:** rejected because one feature branch with one commit per accepted slice supplies portable reviewability without requiring Graphite or branch-context machinery.
