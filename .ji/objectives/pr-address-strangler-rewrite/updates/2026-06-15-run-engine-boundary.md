# RunEngine Boundary Added to Steel Thread

## Summary

Inspection confirmed the strangler plan should not be only a `core/` versus `legacy/` reshuffle. The first implementation slice must establish the new `PrAddressRunEngine`/RunKernel boundary so the agent-facing protocol becomes a small verb set rather than a renamed payload/session protocol.

The Objective now treats `feedback`, `details`, and `status` as the read-only proof of that boundary, while preserving the six-verb target shape: `feedback`, `details`, `plan`, `batch`, `status`, and `reply`.

## Objective Impact

The durable scope now allows hidden internal run state only behind the RunEngine. Agent-visible persistence vocabulary remains forbidden: no payload paths, descriptors, roles, locators, compact/full modes, sessions, or latest-artifact references should appear in the new command contract.

Completion criteria and roadmap now require the RunEngine boundary and a `details` verb in addition to `feedback` and `status`. Production `plan`, `batch`, and `reply` are parked for follow-up work.

## Follow-Ups

- During implementation, decide the minimum stable detail-handle shape that avoids JSON pointer / payload-path leakage.
- Keep any internal run ledger implementation-state-only; GitHub remains the source of truth for status.
- Guard against a too-thin façade that preserves the old payload/session protocol under new names.
