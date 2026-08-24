# Semantic Update: minimal restack-resolve CLI implemented

## Summary

`ns gs restack-resolve` now implements the local gh-stack v0.1.0 advancement contract. It selects start
or continuation from minimal Git state, enforces the reviewed guards and Tier-2 authorization, invokes
at most one official public provider mutation, then reinspects minimal Git state to classify completed,
conflict-stopped, or refused recovery.

Every `gh stack` call uses the command-local noninteractive environment overlay. The implementation has
no public continuation flag, dry-run, force, topology/range/ref snapshot, occupancy or ancestry model,
postcondition array, provider-private state, network API, or raw Git continuation/abort.

## Objective Impact

This implementation deliberately supersedes the broader CLI design recorded in the earlier Saved Plan
and donor implementation evidence. In particular, the CLI no longer claims that topology, selected
ranges, ref snapshots, worktree occupancy, ancestry matrices, or provider views are needed to advance
one local restack step. Those concerns must not be restored without new provider evidence and a new
reviewed contract.

## Follow-Ups

Focused unit and gateway tests cover strict schemas, version and Git guards, continuation readiness,
authorization, exact argv/environment overlays, one-mutation behavior, full/downstack completion,
initial and subsequent conflict stops, bounded diagnostics, and recovery-last rendering. Integration
coverage exercises the public ns route and real Git observations. The portable GS skill and thin
`/ns:gs:restack-resolve` Pi router remain pending, so the Objective roadmap row stays in progress.
