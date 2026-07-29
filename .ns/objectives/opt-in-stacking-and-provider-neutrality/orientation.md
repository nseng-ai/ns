# Orientation: opt-in-stacking-and-provider-neutrality

**Direction: stacking is becoming an opt-in, provider-neutral capability — plain Git branches plus GitHub PRs are the default workflow, and Graphite is becoming one adapter behind capability-split seams (topology, branch preparation, reconciliation, publication), not the substrate.**

Getting to: remove ambient couplings, introduce discriminated branch-vs-stack targets, and cut capability-split neutral seams with Graphite as sole adapter, following ADR 0049 and `docs/conventions/stack-provider-capability-matrix.md`; later reconcile `docs/conventions/graphite-dependency-boundary.md` and related guidance.

What you see now: Herdr and generic Flow `pull-trunk`/checkpoint paths derive trunk from cached git `origin/HEAD` facts. Branch Context defaults to plain-git execution but still constructs Graphite eagerly; Flow submit assumes the current Graphite stack, and Flow land's command path always selects its Graphite stack target. Objective Runner still gates on Graphite tracking, but that mechanism change is parked pending a broader runner rethink.

Avoid: adding new ambient Graphite dependencies (eager gateway construction, universal tracking gates, trunk-via-`gt` in generic workflows); hardening the current Objective Runner/autorunner with an interim provider contract; treating stacking as universal in new workflow contracts; monolithic stack-provider interfaces; and contracts a colocated-jj provider could not satisfy — assumed current branch, staging/index semantics, mandatory restack rituals, publication coupled to provider topology handles, or workflows reading provider-private state. Explicitly Graphite-branded surfaces (`ns slot gt`, `[gt]` footer, `/gt:squash-stack`, smart-restack, Flow autobranch) stay Graphite-branded.

Active slice: make Branch Context's provider construction policy-selected and lazy, then audit no-provider behavior before introducing the broader target and capability seams.
