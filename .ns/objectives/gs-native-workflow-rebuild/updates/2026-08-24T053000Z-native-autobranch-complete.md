# Native GS autobranch vertical slice completed

## Summary

`ns gs autobranch` now owns dirty cached-trunk bootstrap and dirty invoking-provider-worktree tracked-top extension for exactly gh-stack v0.1.0. It prepares a bounded GS-owned slug and checkpoint message before authorization, preserves the required mutation orders, and classifies only observed completion, refusal, known partial failure, or ambiguity.

The complete surface includes the canonical thin `ns-gs-autobranch` skill and native `/ns:gs:autobranch` Pi router. The router captures the exact effective skill before mutation, invokes a fresh JSON CLI with `--yes`, returns without an LM turn on completion, reports refusal, and hands only known-partial or ambiguous evidence to the captured skill. The duplicate provisional `/ns:flow:gs:autobranch` registration is retired; its old canonical skill and overlays remain unreachable pending separate mechanical deletion. Graphite behavior and `/ns:flow:gs:autoslot` remain unchanged.

## Evidence

- `docs/research/gh-stack-v0.1.0-autobranch-contract.md`
- GS fake-driven core and real gateway tests, CLI schema/help scenarios, and linked-worktree provider-authority scenarios
- Pi routing, strict envelope/process agreement, required-skill, acknowledgement-order, parity, and cold fresh-loader tests
- exact skill overlay/lock inventory validation

## Objective Impact

The Native autobranch vertical slice roadmap row is complete. The Objective permits transfer and retirement of duplicate provisional GS-owned Flow surfaces only when the complete native replacement lands; unrelated Flow behavior remains unchanged.

## Follow-Ups

- Delete the unreachable old Flow autobranch canonical skill and overlays in the separate mechanical cleanup PR.
- Complete provider-worktree concurrency and initiating-worktree recovery evidence.
- Settle autoslot destination provider establishment and source disposition.
