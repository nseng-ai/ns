# Roadmap

## Work

- [~] Complete the submit consolidation so `asdl-dev submit` owns durable behavior and Pi exposes it through the shared `/dev:*` command adapter.
      Evidence: current branch adds the CLI command/gateway/tests/docs and removes the legacy Pi-only submit file/tests; remaining work is to reconcile review hardening before treating the migration as review-ready.
- [ ] Harden shared command timeout handling for long-running Graphite commands.
      Evidence: `runCommand` enforces timeout completion robustly, including SIGTERM escalation when needed, and tests cover timeout/startup/close behavior without reintroducing submit-specific process machinery.
- [ ] Replace presentation-string submit gateway fields with typed semantic result causes.
      Evidence: submit formatting owns English prose, `RealSubmitGateway` returns semantic causes for empty-branch/no-current-PR/startup/timeout/failure states, and in-memory fakes model those states without duplicating final user-facing messages.
- [ ] Decide whether `/dev:submit` needs a thin Pi UX wrapper after the headless path is hardened.
      Evidence: either the Objective parks wrapper work with a clear reason, or any wrapper composes the `asdl-dev` core without owning Graphite orchestration, parsing, retries, or failure policy.
- [ ] Re-run the strict code-quality review against the hardened consolidation and capture intentional deferrals.
      Evidence: targeted TypeScript checks/tests pass for `asdl-dev` and `pi-extensions`, and any remaining review comments are resolved, parked, or explicitly justified.

## Parked

- Restoring the deleted rich Pi-only submit workflow as an independent implementation.
- Redesigning Graphite submission semantics beyond the `gt submit -nps --ai` contract used by this command.
- Broad Pi CLI adapter enhancements unrelated to exposing `asdl-dev submit` safely.
- A generalized streaming process-runner abstraction unless the thin Pi UX wrapper decision makes it necessary.
