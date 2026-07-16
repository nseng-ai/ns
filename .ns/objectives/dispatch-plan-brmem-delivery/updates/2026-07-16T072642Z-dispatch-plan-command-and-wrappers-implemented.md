# Dispatch Plan command and wrappers implemented

## Summary

The explicit `ns dispatch plan <plan-ref>` kernel command is locally implemented over the existing dispatch spine. It resolves and validates one Saved Plan before mutation, preflights Branch Memory synchronization, prepares and delivers dispatch-owned context, reuses source/preflight/anchor/trigger/stamp phases, sends only the typed locator into the Workflow, and emits progressive-disclosure human output plus complete machine and marked anchor-PR provenance.

The `/ns:dispatch:plan` Pi extension accepts an explicit plan path or selects the latest Saved Plan evidenced in the current Pi session, then delegates an explicit path to the kernel. The portable `dispatch-plan` skill remains explicit-path and invoke-only; neither wrapper owns transport. Fake-driven command scenarios cover missing input, setup refusal, publication and remote-verification partial failures, workflow-start recovery, help/runtime parity, and prompt compatibility.

No real Branch Memory write, source or anchor push, pull-request mutation, workflow trigger, publication, or other external mutation occurred.

## Objective Impact

The command and wrapper roadmap row is complete in post-landing Objective state. Repository TypeScript tests and checks, style guard, dependency checks, dprint, skill validation, and runtime parity passed for the implementing commits.

All planned local product behavior is now implemented. The workflow/sandbox row remains in progress only because `build:deployable` is blocked by absent local Vercel Project Settings. The real end-to-end dispatch remains the explicit human-run interlude and cannot be attempted by local autorun.

## Follow-Ups

- Obtain successful `build:deployable` evidence from an already linked or repository-supported hermetic checkout without running unconfirmed external setup.
- Merge the settled README contract into the durable Vercel capability README once implementation rows are considered locally complete and concurrent broader README work is reconciled.
- Run the separately authorized live proof for exact Snapshot Ref delivery, supervisor precheck, harness `brmem get`, plan execution, agent commit, and anchor-PR landing.
