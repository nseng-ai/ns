# Spec Deleted and Contract Carried Forward

## Summary

Deleted the stale standalone `docs/specs/agent-payload-sidechannels.md` spec instead of preserving it as a compatibility shim or renaming it to a new spec path. The implementation-relevant payload artifact contract is now summarized directly in `agent-payload-artifacts/objective.md` under current terminology.

Also updated the closed `agent-payload-sidechannels` Objective's current contract pointer so readers are not sent to the deleted spec path as active guidance.

## Objective Impact

The canonical terminology and compatibility-boundary roadmap row is complete. Current work should cite the `agent-payload-artifacts` Objective's carry-forward contract or use payload artifact terms directly. Historical references to the removed spec path remain provenance unless they are actively misleading current readers.

## Follow-Ups

- Refresh `.asdl/prompts/subagent-launch.md` and its embedded fallback to remove side-channel wording.
- Update active Objective references, especially `command-output-summaries`, so future work cites payload artifact terminology rather than the old Objective/spec name.
- Run the final terminology audit and classify any remaining stale terms before closure.
