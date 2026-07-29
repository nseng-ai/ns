# Herdr Pi adapter extraction implemented

## Summary

The Herdr host boundary is implemented end to end in the `extract-herdr-pi-host-adapter` working tree. `@nseng-ai/pi-ns-herdr` now owns direct Pi discovery, all nine command identities (eight base and one optional Handoff command), interaction and presentation, launch-option/command construction, package parity metadata, and the deliberate `@nseng-ai/pi-ns-handoffs/handoff-launch` composition edge.

`@nseng-ai/herdr` now exposes focused command metadata and Herdr resource operations through its thin `./api` subpackage. It retains labels, explicit caller targeting, Slot-backed prepared destination creation, pane process launch, and the hidden durable-reference Handoff ns command, while dropping `src/pi`, `./pi*` exports, the `pi` subpackage, Pi Runtime coupling, and the temporary extension-to-Handoffs-host tier debt.

## Objective Impact

The extraction retires one remaining extension-owned Pi surface and proves the intended adapter-to-adapter composition boundary. Focused package typechecks and tests pass, including 142 adapter tests and the extension's hidden-command test.

## Follow-Ups

Flow, Pi-native internal extractions, and the final repository-wide structural guards remain open. This update does not close the Objective.
