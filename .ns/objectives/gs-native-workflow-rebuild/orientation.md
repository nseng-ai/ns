# Orientation: gs-native-workflow-rebuild

**Direction: build the everyday stacked-development loop in `@nseng-ai/gs` from native `github/gh-stack` semantics, not as a Flow adapter or a Graphite-shaped abstraction.**

Getting to: deliver command-sized vertical slices from one explicit stack worktree, verifying repository-shared Git refs, invoking-worktree gh-stack facts, and GitHub authority separately before shipping each CLI, portable skill, and Pi surface.

What you see now: gh-stack v0.1.0 stores topology and locks in each worktree's private Git directory while branch refs are shared. GS inventory now reports only Git's canonical current-worktree gh-stack view with explicit provenance; provisional autoslot still moves a branch without moving gh-stack membership.

Keep GS independent of Flow. Keep Slots optional. Keep one stack in one stable worktree unless public gh-stack commands prove safe destination establishment and source disposition. Preserve forward-only recovery.

Avoid private-state copying or mutation, repository-global claims from one worktree's gh-stack view, cross-worktree concurrency assumptions, universal stack-tool interfaces, and Flow retirement under this Objective.

Active slice: finish stack-worktree architecture evidence by revalidating `restack-resolve` wrong-worktree, independent-lock concurrency, initiating-worktree recovery, and Slot composition. The corrected `ns gs list` storage premise and thin `/ns:gs:restack-resolve` Pi router now exist, but they do not settle those mutating-workflow questions.
