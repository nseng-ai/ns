# Roadmap

## Work

- [ ] Add the `pi` harness to the reviews capability: extend `ReviewsHarness` and `resolveReviewsModelReference` to accept `vercel-ai-gateway/<model>` refs, implement `PiProcessReviewRunner` against the `ReviewHarnessRunner` seam (headless pi, findings-JSON contract, `reviewResponseFromFindingsPayload` parsing), and wire it through `RoutingReviewRunner` and `core/context.ts`.
      Evidence: unit tests beside the existing claude-code/codex runner tests pass; repo validation (`just`) green.
- [ ] Route both `ns.toml` review profiles (`reviews_quick`, `reviews_deep`) through `vercel-ai-gateway/...` and prove a local deep review run end-to-end on the pi harness.
      Evidence: `ns reviews run` with the deep profile completes and emits findings locally.
- [ ] Rework `.github/workflows/reviews.yml`: install a pinned pi CLI as the only review harness, drop the Claude Code/Codex install and `codex login` steps, and pass only `AI_GATEWAY_API_KEY`.
- [ ] Turn the CI review lane back on: remove `local_only: true` from `ns-typescript-style-tripwire` and `reinvented-abstractions-tripwire`, and prove with a real PR that both quick reviews run green in the CI matrix and post findings.
      Evidence: `ns reviews list --ci` returns the two tripwires; a PR's reviews matrix run is green with published findings.

## Parked

- Nothing parked. Deep-review CI enablement and claude-code/codex runner retirement are non-goals (see objective.md), not deferred work.
