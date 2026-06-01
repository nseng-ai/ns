# Roadmap

## Work

- [~] Complete the submit consolidation so `asdl-dev submit` owns durable behavior and Pi exposes it through the shared `/dev:*` command adapter.
  Evidence: current branch adds the CLI command/gateway/tests/docs and removes the legacy Pi-only submit file/tests; remaining work is to reconcile review hardening before treating the migration as review-ready.
- [x] Harden shared command timeout handling for long-running Graphite commands.
      Evidence: `runCommand` now escalates SIGTERM → SIGKILL after a configurable grace window (`timeoutKillGraceMs`, default 5s) and normalizes timed-out runs to exit code 124, all in the generic `command-runner` gateway with no submit-specific process machinery. Tests cover normal close, startup error, SIGTERM-handled timeout, and SIGKILL escalation; targeted command-runner tests and the package typecheck passed. Evidence: PR #787 branch diff against `consolidate-submit-to-asdl-dev-timeout-semantics`.
- [x] Replace presentation-string submit gateway fields with typed semantic result causes.
      Evidence: `SubmitRunResult` now carries `semanticFailureCause`, `CurrentPrVerificationResult` carries typed `cause` variants, `RealSubmitGateway` maps empty-branch/no-current-PR/startup/timeout/generic-failure states to causes, formatter helpers own the existing English guidance, and in-memory fakes model those causes without duplicating final user-facing messages. Targeted submit gateway/scenario tests, package typecheck, `just ts-check`, and `just ts-test` passed.
- [ ] Decide whether `/dev:submit` needs a thin Pi UX wrapper after the headless path is hardened.
      Evidence: either the Objective parks wrapper work with a clear reason, or any wrapper composes the `asdl-dev` core without owning Graphite orchestration, parsing, retries, or failure policy.
- [ ] Re-run the strict code-quality review against the hardened consolidation and capture intentional deferrals.
      Evidence: targeted TypeScript checks/tests pass for `asdl-dev` and `pi-extensions`, and any remaining review comments are resolved, parked, or explicitly justified.

## Parked

- Restoring the deleted rich Pi-only submit workflow as an independent implementation.
- Redesigning Graphite submission semantics beyond the `gt submit -nps --ai` contract used by this command.
- Broad Pi CLI adapter enhancements unrelated to exposing `asdl-dev submit` safely.
- A generalized streaming process-runner abstraction unless the thin Pi UX wrapper decision makes it necessary.
