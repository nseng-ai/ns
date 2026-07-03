# Vim List Keys Landed

## Summary

The `/context-profiler` overlay now accepts `j` (down) and `k` (up) as navigation aliases in all three frame types: overview selection, base-detail/turn-list selection, and content-view scrolling. The aliases are advertised in all three always-on footer hint lines as `↑↓/jk`, keeping the hints' every-working-key-is-listed contract. This restores work from an earlier session that was never committed (verified absent from all branches, worktrees, and stashes before reimplementing). Landed on `context-profiler-jk-navigation-aliases` against Graphite parent `context-profiler-opinionated-episode-summary`, implementing the attached planned-branch plan of the same slug.

## Objective Impact

- UI polish only — deliberately **no roadmap row**: a two-key alias is not a semantic capability. Roadmap state is unchanged.
- Closure remains gated on the full stack merging to `master` per the completion criteria.

## Follow-Ups

- A fuller vim navigation set (`g`/`G` top/bottom, `ctrl-d`/`ctrl-u` half-page) was considered and deferred; `h`/`l` would additionally need design care around close-from-overview semantics.
