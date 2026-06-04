# Roadmap

## Work

- [x] Complete the submit consolidation so `asdl-dev submit` owns durable behavior and Pi exposes it through the shared asdl-dev command adapter under `/code:*`.
      Evidence: the CLI command/gateway/tests/docs landed and the legacy Pi-only submit file/tests were removed; `submit` is now surfaced as `/code:submit` via `asdlDevCodeExtension()` (`piNamespace: "code"`) rather than `/dev:submit` (commit `c5e579b5`). Strict review hardening is tracked as the remaining closeout row rather than as incomplete consolidation.
- [x] Harden shared command timeout handling for long-running Graphite commands.
      Evidence: `runCommand` now escalates SIGTERM → SIGKILL after a configurable grace window (`timeoutKillGraceMs`, default 5s) and normalizes timed-out runs to exit code 124, all in the generic `command-runner` gateway with no submit-specific process machinery. Tests cover normal close, startup error, SIGTERM-handled timeout, and SIGKILL escalation; targeted command-runner tests and the package typecheck passed. Evidence: PR #787 branch diff against `consolidate-submit-to-asdl-dev-timeout-semantics`.
- [x] Replace presentation-string submit gateway fields with typed semantic result causes.
      Evidence: `SubmitRunResult` now carries `semanticFailureCause`, `CurrentPrVerificationResult` carries typed `cause` variants, `RealSubmitGateway` maps empty-branch/no-current-PR/startup/timeout/generic-failure states to causes, formatter helpers own the existing English guidance, and in-memory fakes model those causes without duplicating final user-facing messages. Targeted submit gateway/scenario tests, package typecheck, `just ts-check`, and `just ts-test` passed.
- [x] Decide whether `/code:submit` needs a thin Pi UX wrapper after the headless path is hardened.
      Evidence: no dedicated wrapper is required for this Objective. The closure target is the generic asdl-dev command adapter under `/code:*`; wrapper code should only be added if final review or validation uncovers a concrete regression that cannot be handled by the generic adapter.
- [ ] Run the final strict review and closeout pass against the hardened consolidation.
      Evidence: strict review runs against the current `asdl-dev submit` plus `/code:submit` mirror; blocking findings are fixed within the existing `asdl-dev` / `pi-extensions` boundaries; non-blocking findings and any accepted UX caveats are recorded as intentional deferrals; targeted TypeScript checks/tests pass for changed areas; the Objective is updated or closed with final evidence.

## Parked

- Restoring the deleted rich Pi-only submit workflow as an independent implementation.
- Redesigning Graphite submission semantics beyond the `gt submit -nps --ai` contract used by this command.
- Broad Pi CLI adapter enhancements unrelated to exposing `asdl-dev submit` safely.
- A generalized streaming process-runner abstraction; the no-wrapper closeout decision means it is not needed for this Objective.
