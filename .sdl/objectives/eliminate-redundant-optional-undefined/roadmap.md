# Roadmap

## Work

- [x] Consolidate tracking into one open Objective.
      Created this canonical follow-up record so agents do not choose between reopening the closed normalization Objective, following the original five-PR branch-context plan literally, or adopting a separate hard-enforcement interpretation. The closed Objective remains precedent; this Objective owns active follow-up tracking.

- [~] Finish the current branch-local continuation slice.
      Complete and validate the cleanup already present on `eliminate-optional-undefined-five-pr-stack`: packagechk metadata helpers, GitHub PR feedback fingerprint/status helpers, pr-feedback-watch models, local preview/check models, and worktree-status presentation/internal cleanup. Keep this slice coherent; do not broaden into address, branch-context, handoff, objective, or roaster unless directly connected to existing changes.

- [ ] Record slice evidence and rebaseline touched clusters.
      For the current branch-local slice, record scoped pre/post counts, changed fields, semantic claims, preserved/deferred categories, and validation. Current recomputed touched-cluster inventory at consolidation time was 67 matches across the changed source areas: 30 in `infra/github`, 18 in `worktree-status/src`, 11 in `local-pi-tools/pr-feedback-watch`, and 8 in `local-pi-tools/pr-previews`; `tools/packagechk/src` had no remaining matches in that scoped grep.

- [ ] Decide whether this branch should split before review.
      If packagechk, PR feedback, previews, and worktree-status are not review-coherent as one slice, narrow or split before submission. Preserve the Objective narrative either way.

- [ ] Close after the active slice is delivered or explicitly deferred.
      Closure should summarize the final touched-cluster counts, validation evidence, preserved categories, and any recommended next Objective if a broader hard guard/allowlist policy is later desired.

## Parked

- [ ] Consider a separate hard enforcement / allowlist Objective only if explicitly approved.
      This Objective deliberately does not adopt a repo-wide ban, checked-in allowlist, or zero-count target.
