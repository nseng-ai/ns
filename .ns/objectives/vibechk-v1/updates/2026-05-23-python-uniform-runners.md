# Python Uniform Runners

## Summary

V1 will be implemented as a Python CLI and will treat `claude`, `codex`, and `pi` uniformly as runner adapters. The durable `vibechk` product surface remains the same bundle, diff, report, and publish workflow; runner-specific behavior belongs behind a common Python contract with raw artifacts preserved and normalized metrics set to `null` when unavailable.

Pi-specific SDK/session-forking ideas remain valuable but are explicitly parked behind the first Python implementation instead of becoming a special v1 execution path.

## Objective Impact

This changes v1 from a `claude-code`-only runner with future extensibility to a first version that supports three named runner adapters: `claude`, `codex`, and `pi`. It also clarifies that uniformity is at the runner-contract and reporting layer, not a promise that every runner exposes identical metrics.

The roadmap now calls for per-runner metric normalization, runner selection/config-difference coverage, and parked Pi-native SDK or extension work.

## Follow-Ups

- Keep runner-specific raw artifacts in bundles so normalization does not discard evidence.
- Ensure reports clearly surface runner/model/version/config differences, especially for cross-runner comparisons.
- Validate the initial Python runner contract before adding deeper Pi SDK/session-forking behavior.
