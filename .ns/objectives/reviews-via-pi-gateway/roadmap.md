# Roadmap

## Work

- [x] Add the `pi` harness to the reviews capability: extend `ReviewsHarness` and `resolveReviewsModelReference` to accept `vercel-ai-gateway/<model>` refs, implement `PiProcessReviewRunner` against the `ReviewHarnessRunner` seam (headless pi, findings-JSON contract, `reviewResponseFromFindingsPayload` parsing), and wire it through `RoutingReviewRunner` and `core/context.ts`.
      Evidence: focused Reviews tests and full repo validation (`just`) pass; tests cover exact args, stdin prompt transport, isolation/tool flags, tolerant single-object parsing, schema validation, and process failure mapping.
- [~] Route both `ns.toml` review profiles (`reviews_quick`, `reviews_deep`) through `vercel-ai-gateway/...` and prove a local deep review run end-to-end on the pi harness.
  Evidence: both profiles now resolve through the Pi route. The credential is available locally, but `ns reviews run` writes the Reviews Branch Memory log and the attached-plan protocol forbids Branch Memory mutation in this implementation session, so the end-to-end deep run remains pending.
- [x] Rework `.github/workflows/reviews.yml`: use the catalog-pinned workspace Pi CLI as the only review harness, drop the Claude Code/Codex install and `codex login` steps, and pass only `AI_GATEWAY_API_KEY`.
      Evidence: Pi `0.80.5` supports the selected flags and stdin transport. Because pnpm exposes the pinned binary under the existing `@nseng-ai/ns` package rather than root `ts/node_modules/.bin`, the workflow adds `ts/packages/hosts/ns/node_modules/.bin` to `PATH` and verifies `pi --version`.
- [~] Turn the CI review lane back on: remove `local_only: true` from `ns-typescript-style-tripwire` and `reinvented-abstractions-tripwire`, and prove with a real PR that both quick reviews run green in the CI matrix and post findings.
  Evidence: `ns reviews list --ci --format json` returns exactly the two tripwires and the four deep definitions remain local-only; a real PR matrix run and findings publication remain pending.

## Parked

- Nothing parked. Deep-review CI enablement and claude-code/codex runner retirement are non-goals (see objective.md), not deferred work.
