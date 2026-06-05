# Active Guidance Terminology Cleanup

## Summary

Updated current active guidance so future work points at the payload artifact architecture instead of the deleted side-channel spec or closed `agent-payload-sidechannels` Objective.

`command-output-summaries` now cites the `agent-payload-artifacts` carry-forward payload artifact contract as its architectural basis without introducing a formal Objective dependency. Its completion criteria, assumptions, and open question now reflect the shipped shared `asdl-core` payload artifact store while leaving command-summary implementation choices open.

Also refreshed `landed-architecture-review` so its objective, roadmap, and current update evidence name the open `agent-payload-artifacts` Objective rather than the closed historical Objective and describe the out-of-scope architecture with payload artifact terminology.

## Objective Impact

The `Update current docs and active Objective references` roadmap row is complete. Active planning docs now use payload artifact terminology for the architecture and no longer point current readers to `docs/specs/agent-payload-sidechannels.md` or to `agent-payload-sidechannels` as the architectural base.

Verification: focused active-guidance searches found no remaining current docs/spec/readme/skill references to the deleted side-channel spec or closed Objective as the payload architecture base. Remaining stale-term hits are intentionally classified as selected-Objective legacy-boundary prose, closed historical Objective evidence, glossary rejected-synonym examples, or unrelated non-payload terminology.

## Follow-Ups

- Run the final terminology audit row and record the classified leftovers plus Markdown validation evidence before closure.
- Leave closed `agent-payload-sidechannels` roadmap/update history intact as provenance unless a future reader-facing issue shows a specific misleading current pointer.
