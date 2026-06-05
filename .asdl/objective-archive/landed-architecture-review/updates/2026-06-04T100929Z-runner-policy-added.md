# Runner Policy Added

## Summary

The Objective now includes durable `## Definition of Progress` and `## Runner Policy` sections. The policy allows `objective-next` to offer confirmed execution for one non-parked roadmap cluster at a time after the Tracking Gate passes, with a bounded preview and explicit confirmation before material action.

Default execution is local worktree edits only: inspect code, make targeted source/test/doc changes when warranted, run relevant local validation, and update this Objective with meaningful evidence. Branch creation, commits, Graphite stack operations, PR submission, publishing, deployment, and other write-capable external systems remain out of scope unless explicitly included in a confirmed execution preview.

## Objective Impact

This converts the Objective from recommendation-only planning into an execution-friendly record while preserving the architecture-review boundaries. Future `objective-next` runs can advance the cmux cluster and later clusters directly when the preview is narrow, validates locally, and stops before broad rewrites, cross-Objective primary deliverables, ambiguous product judgment, slug identity changes, hidden state, or unvalidated changes.

## Follow-Ups

- Rerun `objective-next` for `landed-architecture-review` and offer a bounded execution preview for the cmux command-suite seam.
- After the cmux slice finishes, record whether it implemented a targeted deepening change or parked the cluster with rationale.
