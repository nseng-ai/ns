# Payload Side-Channel Contract Settled

## Summary

Created `docs/specs/agent-payload-sidechannels.md` as the durable cross-package contract for payload side-channel artifacts, prompt resolution, and the `pr-address` first steelthread. This slice is intentionally docs-first: no production code, prompt file, generic payload CLI, or `pr-address` skill behavior was changed.

The contract settles the key scope changes from planning: sidecar mode requires a supplied valid session id, commands do not generate fallback session ids, inline mode bypasses payload session preflight, no bounded body-preview escape hatch is included in v1, and selected-detail lookup is a reusable core JSON Pointer feature exposed to agents through `pr-address exec` commands rather than a generic payload CLI.

## Objective Impact

The Objective record now points to the new specification and aligns its scope, completion criteria, assumptions, risks, and open questions with the settled contract. The first roadmap row is complete because the shared payload-store and prompt-resolution contracts are defined before implementation begins.

Prompt launch policy remains part of the Objective, but `.asdl/prompts/subagent-launch.md` is deferred to the later prompt-resolution implementation slice. The future prompt resolver must return content plus provenance and protect the checked-in prompt from embedded-default drift.

## Follow-Ups

- Implement the shared `asdl_core.payloads` store and opt-in Clinkr helper, or implement the prompt resolver next depending on desired sequencing.
- Keep sidecar session validation as preflight before domain/GitHub work.
- Preserve the v1 non-goals: no generated fallback sessions, no bounded body previews, no generic payload CLI, no Clinkr auto-spooling, and no command-level LLM invocation.
