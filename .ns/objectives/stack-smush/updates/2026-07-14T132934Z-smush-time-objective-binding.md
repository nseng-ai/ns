# Smush-time Objective binding completed

## Summary

`code-smush` now binds every successful packaging or repackaging run to one active
owning Objective by default. An explicitly supplied slug/path is validated with
`ns objective exec read-objective`; otherwise the workflow lists active candidates and
asks the user to select one without inferring ownership from stack, branch, PR, path,
package, or hidden metadata.

The ratified Slice Map proposal displays either the selected Objective or a separately
confirmed unbound override. Bound runs append a timestamped immutable packaging-event
Semantic Update containing the source run, construction path and generation, ordered
Decision/Span branch map, validation summary, Decision-branch handoff, and replacement
close candidates. The event is committed into the packaged tip: it remains a supporting
commit for a Decision tip and is absorbed into the final Span Squash for a Span tip.
Every replacement generation creates a distinct event; prior events are never edited.

The workflow re-derives topology before writing the event and explicitly treats the
manifest as historical evidence rather than current Slice Map state. A merely mentioned
Objective is not treated as selection. The event avoids tip SHA
self-reference and preserves all local-only, no-PR, no-remote, and no-new-CLI
boundaries.

## Objective Impact

The **Smush-time objective binding** roadmap row is complete. Packaging now leaves a
durable, reviewable breadcrumb in the owning Objective's update stream, unblocking the
post-submit decide skill's discovery of the canonical home for Decision records.

An unbound override remains available only through explicit pre-mutation confirmation
and is shown loudly in both proposal and completion output. Selection, event creation,
validation, commit, re-squash, or final verification failure stops without automatic
rollback and without conversion to bypass; the exact state and every backup prefix
created so far (with absent backups identified) are left for user-directed recovery.

The Objective/branch-context/handoff Fog is narrowed only for smush-time binding.
Runner-step, attached-plan, and multi-session handoff interactions remain unresolved.
The slice is validated with repository formatting, skill-registry, Objective-structure,
link, stale-reference, diff-integrity, and default repository gates.

## Follow-Ups

- Author the decide skill against the packaging-event and decisions-log conventions.
- Prove the binding phase during a later explicitly requested real smush; this prose
  slice deliberately does not mutate a live submitted stack.
- Keep classification-aware submit titling, replacement-cycle evidence capture,
  runner-step integration, branch-context, and handoff integration in their existing
  roadmap/Fog scopes.
