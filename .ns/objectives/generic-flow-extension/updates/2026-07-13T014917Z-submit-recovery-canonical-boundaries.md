# Submit recovery now uses canonical descriptor and Git boundaries

## Summary

Review remediation removed two parallel implementation paths from submit-check recovery.
Production recovery now supplies Flow's preloaded extension descriptor to the SDK point
catalog, where the existing descriptor normalization and same-id merge logic replace the
incomplete mirrored recovery definition while preserving unrelated built-ins. The
packaged recovery prompt therefore resolves as the descriptor's `default` source with its
real descriptor provenance; the separate `missing`-to-built-in prompt fallback is gone.

Repository discovery now consumes only `GitGateway.optionalRepoRoot`. The Flow Pi
entrypoint composes `RealGitGateway` over the existing Pi exec channel, while fake-driven
tests inject constructor-state Git gateways. Flow no longer walks parent directories or
inspects `.git` files and directories directly.

## Objective Impact

This strengthens the completed recovery slice without changing its product contract. The
public `ns flow submit` surface, `flow.submit.pre.recovery` point id, stable failure marker,
`--no-checks`, repository override precedence, fail-fast prompt policy, and one-turn
recovery ordering are unchanged. The SDK built-in mirror remains explicit fallback debt
for callers without descriptor evidence rather than the production source for Flow's
packaged default.

Focused Flow and SDK tests, the checked-in descriptor integration test, TypeScript format,
lint and typecheck, the TypeScript style guard, and the repository `just` entrypoint pass.
The descriptor integration test also reads the resolved packaged default from its real
path. The Objective remains open because adopter documentation, audit-driven
genericization work, and README promotion remain active.

## Follow-Ups

- Keep broader preinstalled point-catalog consolidation separate from this narrow recovery
  remediation.
- Continue the existing adopter documentation, audit-resolution, and README-promotion
  roadmap rows without changing the settled submit recovery contract.
