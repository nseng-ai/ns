# Native GS autobranch vertical slice completed

## Summary

`ns gs autobranch` now owns dirty cached-trunk bootstrap and dirty invoking-provider-worktree tracked-top extension for exactly gh-stack v0.1.0. It prepares a bounded GS-owned slug and checkpoint message before authorization, uses named autobranch Consumer Gateways, preserves the exact checkpoint-before-init and add-before-checkpoint mutation orders, and classifies only observed completion, refusal, known partial failure, or ambiguity.

The command has a finite strict Clinkr schema, TTY confirmation or `--yes`, public Git/provider post-observation after mutation failure, and forward-only recovery. It does not fetch, scan peers, access provider-private state, retry, roll back, manage Slots, push, mutate GitHub, or import Flow.

The complete surface includes the canonical thin `ns-gs-autobranch` skill and native `/ns:gs:autobranch` Pi router. The router captures the exact effective skill before mutation, invokes a fresh JSON CLI with `--yes`, returns without an LM turn on completion, reports refusal, and hands only known-partial or ambiguous evidence to the captured skill. The duplicate provisional `/ns:flow:gs:autobranch` registration and skill were retired; Graphite behavior and `/ns:flow:gs:autoslot` remain unchanged.

## Evidence

- `docs/research/gh-stack-v0.1.0-autobranch-contract.md`
- GS fake-driven core and real gateway tests, CLI schema/help scenarios, and linked-worktree provider-authority scenarios
- Pi routing, strict envelope/process agreement, required-skill, parity, and cold fresh-loader tests
- exact skill overlay/lock inventory validation

## Objective Impact

The Native autobranch vertical slice roadmap row is complete. The Objective scope is narrowed to permit transfer and retirement of duplicate provisional GS-owned Flow surfaces only when the complete native replacement lands; unrelated Flow behavior remains unchanged.

## Follow-Ups

- Complete provider-worktree concurrency and initiating-worktree recovery evidence.
- Settle autoslot destination provider establishment and source disposition.
- Implement reconciliation, submit, PR inventory, and landing as later command-sized slices.
