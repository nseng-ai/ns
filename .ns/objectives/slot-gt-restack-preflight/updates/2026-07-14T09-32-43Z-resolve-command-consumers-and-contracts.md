# Resolve Command Consumers and Contracts

## Summary

Repository evidence corrects the originating audit narrative: the restack fact loop
belongs to `code-gt-restack-resolve`, not Objective Runner, and the remaining descendant
evidence loop belongs to `code-gt-linearize-descendants`, not Thermostack. The command
contracts are now resolved around `--scope downstack|full`, complete descendant output,
fixed-concurrency local evidence, and inline best-effort batched PR metadata.

## Objective Impact

The Objective now tracks only concrete consumers. Generic skill restacks and the Pi
smart-restack wrapper must request full scope explicitly to preserve plain `gt restack`
behavior; the command itself defaults to downstack. `descendants-report` must distinguish
PR absence from PR lookup unavailability without discarding complete local evidence.
Objective Runner and Thermostack are no longer required retrofits absent new matching
repository evidence.

## Follow-Ups

- Implement both schema-first hidden exec commands and their gateway-backed tests.
- Retrofit the three concrete consumers and validate that no stale matching fact loops
  remain.
