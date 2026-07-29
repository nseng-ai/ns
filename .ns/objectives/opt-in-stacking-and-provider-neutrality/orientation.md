# Orientation: opt-in-stacking-and-provider-neutrality

**Direction: stacking is becoming an opt-in, provider-neutral capability — plain Git branches plus GitHub PRs are the default workflow, and Graphite is becoming one adapter behind capability-split seams (topology, branch preparation, reconciliation, publication), not the substrate.**

Getting to: remove ambient couplings, introduce discriminated branch-vs-stack targets, and cut capability-split neutral seams with Graphite as sole adapter, following ADR 0049 and `docs/conventions/stack-provider-capability-matrix.md`; later reconcile `docs/conventions/graphite-dependency-boundary.md`.

What you see now: Herdr derives trunk from the cached origin/HEAD git fact (no `gt trunk`), only after an implementation command selects the Local-trunk basis. Flow trunk paths use `gt` for trunk discovery, Branch Context wires Graphite eagerly, and Flow submit assumes the current stack — all slated for removal or explicit selection. Objective Runner still gates on Graphite tracking, but that mechanism change is parked pending a broader runner rethink.

Avoid: adding new ambient Graphite dependencies (eager gateway construction, universal tracking gates, trunk-via-`gt` in generic workflows); hardening the current Objective Runner/autorunner with an interim provider contract; treating stacking as universal in new workflow contracts; monolithic stack-provider interfaces; and contracts a colocated-jj provider could not satisfy — assumed current branch, staging/index semantics, mandatory restack rituals, publication coupled to provider topology handles, or workflows reading provider-private state. Explicitly Graphite-branded surfaces (`ns slot gt`, `[gt]` footer, `/gt:squash-stack`, smart-restack, Flow autobranch) stay Graphite-branded.

Active slice: move generic Flow trunk discovery off Graphite, then continue through the remaining non-parked ambient couplings in roadmap order.
