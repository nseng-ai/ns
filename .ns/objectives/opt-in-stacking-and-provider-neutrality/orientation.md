# Orientation: opt-in-stacking-and-provider-neutrality

**Direction: stacking is becoming an opt-in, provider-neutral capability — plain Git branches plus GitHub PRs are the default workflow, and Graphite is becoming one adapter behind capability-split seams (topology, branch preparation, reconciliation, publication), not the substrate.**

Getting to: remove ambient couplings, introduce discriminated branch-vs-stack targets, and cut capability-split neutral seams with Graphite as sole adapter, following ADR 0049 and `docs/conventions/stack-provider-capability-matrix.md`; later reconcile `docs/conventions/graphite-dependency-boundary.md`.

What you see now: Herdr resolves Graphite trunk at startup, Objective Runner gates on Graphite tracking, Flow trunk paths use `gt` for trunk discovery, Branch Context wires Graphite eagerly, and Flow submit assumes the current stack — all slated for removal or explicit selection.

Avoid: adding new ambient Graphite dependencies (eager gateway construction, universal tracking gates, trunk-via-`gt` in generic workflows); treating stacking as universal in new workflow contracts; monolithic stack-provider interfaces; and contracts a colocated-jj provider could not satisfy — assumed current branch, staging/index semantics, mandatory restack rituals, publication coupled to provider topology handles, or workflows reading provider-private state. Explicitly Graphite-branded surfaces (`ns slot gt`, `[gt]` footer, `/gt:squash-stack`, smart-restack, Flow autobranch) stay Graphite-branded.

Active slice: remove the Herdr startup coupling, then continue through the other named ambient couplings in roadmap order.
