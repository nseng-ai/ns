# Direct Parent-Context Findings Re-scope

## Summary

The original item 4 requirement for bounded previews plus durable full-findings files was re-evaluated. The new decision is to return useful bounded scout findings directly in the parent Pi session context, with existing child Pi `sessionFile` paths serving as the overflow/debug path for raw transcripts.

Target caps for this slice are about 8k characters per scout task and 32k characters total across the fan-out result. No new `$XDG_STATE_HOME` findings artifact, retrieval handle, or retrieval command is part of this slice.

## Objective Impact

- `objective.md` completion criteria now require direct bounded scout findings plus child session-file pointers, not a new full-findings store.
- Roadmap item 4 is re-scoped from "Preview + pointer result plumbing" to "Direct parent-context findings shaping."
- The scout section contract remains prompt- and contract-test-enforced in this slice; runtime heading validation is not required and should not block useful child output.
- The home-directory-guard bypass decision remains open and continues to gate routine real-child dogfooding.

## Follow-Ups

- Implement item 4 with direct result caps and wording that points users to existing child session files for raw output.
- Keep live inline progress rendering as the separate item 5.
- Do not add durable result artifacts or retrieval tooling unless a future Objective update explicitly changes this decision.
