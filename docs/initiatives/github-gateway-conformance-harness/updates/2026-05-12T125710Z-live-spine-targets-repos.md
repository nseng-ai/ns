# Live Spine and Explicit Repository Targeting Land

## Summary

The opt-in live GitHub conformance spine now exists for read-only runs, and real GitHub gateways can be pointed at an explicit `owner/name` repository instead of relying on ambient checkout state. The harness has configuration and preflight checks, a checked-in fixture catalog boundary, and an initial real-side PR branch lookup scenario.

Validation showed the targeted gateway and live-harness pytest slice passing locally with live tests skipped unless explicitly enabled.

## Roadmap Context

This completes the opt-in read-only conformance spine and the explicit repository-targeting prerequisite. It also completes the fixture/runtime configuration contract as an operating draft aligned with the harness entry point.

The first read-only parity slice is only partially complete: the real-side scenario exists, but the canonical repository still needs real fixture identities and the same scenario still needs fake-side or shared parity assertions.

## Initiative Impact

Future work should build from explicit repository configuration rather than reopening ambient-repository targeting. The next durable initiative questions are operational: which repository is canonical, which credentials are acceptable, and which persistent fixture entries prove the first parity scenarios.

The roadmap should keep repository provisioning and fake/real parity as active work while treating the live spine itself as completed.

## Follow-Ups

- Provision or select the canonical conformance repository and replace placeholder catalog entries with real fixture identities.
- Add fake-side or shared parity assertions for the `pr_basic_lookup` scenario.
- Run the read-only live command against the canonical repository and record any setup, fixture, rate-limit, or semantic drift findings.
