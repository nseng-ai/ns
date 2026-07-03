# Terminology Audit Evidence

## Summary

Ran the final focused terminology audits for payload artifact cleanup and classified the remaining stale-term hits.

Audit evidence:

- Current active guidance search, excluding the selected transition record, closed historical record, Objective archive, and known non-guidance allowlist, returned no hits for the deleted side-channel spec, closed Objective as current architecture, hidden-channel wording, or sidecar-architecture wording.
- Implementation docs/prompts/source search returned one intentional hit: `packages/asdl-core/CONTEXT.md` uses `_Avoid_: side-channel, hidden channel, raw transcript dump, automatic output spooling` under the `Payload artifact architecture` glossary entry.
- Full stale-term inventory hits are classified as:
  - selected-Objective legacy-boundary prose in `agent-payload-artifacts` itself;
  - closed historical implementation evidence under `agent-payload-sidechannels`;
  - unrelated non-payload wording such as Branch Memory side-channel/hidden-metadata language;
  - glossary rejected-synonym examples in `packages/asdl-core/CONTEXT.md`.

Validation: `just dprint-check` passed.

## Objective Impact

The `Run and record terminology audit evidence` roadmap row is complete. Current prompt policy, active planning guidance, and implementation-facing docs/source no longer point readers to `docs/specs/agent-payload-sidechannels.md` or the closed `agent-payload-sidechannels` Objective as the payload architecture base.

All non-parked roadmap rows are now complete, terminology-policy open questions are resolved, and the remaining old terms are intentionally preserved as classified history, transition prose, rejected synonyms, or unrelated language.

## Follow-Ups

- The Objective appears ready for `objective-close` as completed once the user confirms closure.
- Continue preserving closed `agent-payload-sidechannels` history unless a specific current-reader confusion appears.
