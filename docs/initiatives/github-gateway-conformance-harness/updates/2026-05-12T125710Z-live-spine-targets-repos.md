# Live Conformance Spine Targets Explicit Repositories

## Summary

The current branch adds the first opt-in live GitHub conformance spine under `packages/asdl-core/live_conformance/github/` and makes the real GitHub gateways accept an explicit `owner/name` repository target. The live harness now has pytest options for `--run-live-github`, `--github-conformance-repo`, mutation opt-in, and run ids; preflight tests for `gh`, auth, rate limits, repository reachability, and persistent fixture catalog entries; and a first read-only `PRGateway.get_pr_for_branch` live check against the `pr_basic_lookup` fixture.

The fixture contract in `docs/github-gateway-conformance-fixtures.md` was refreshed to match that runtime boundary, including the `just live-github-readonly <owner/name>` convenience recipe and the checked-in catalog approach for persistent fixtures.

Validation: `uv run pytest packages/asdl-core/tests/gateways/test_real_issue_gateway.py packages/asdl-core/tests/gateways/test_real_pr_gateway.py packages/asdl-core/live_conformance/github/test_preflight.py packages/asdl-core/live_conformance/github/test_readonly_pr_gateway.py` passed with 43 tests passing and 7 live tests skipped because `--run-live-github` was not supplied.

## Roadmap Context

This completes the fixture/runtime configuration contract as a checked-in operating draft and completes the opt-in live conformance spine for read-only runs. It also resolves the repository-targeting prerequisite by passing explicit repos through `gh -R` where supported and by parsing explicit `owner/name` values for GraphQL and REST helpers instead of relying on ambient `gh repo view` context.

The first read-only parity slice is only partially advanced: the real `PRGateway` live check exists, but the persistent fixture identifiers are still placeholders until the canonical repository is provisioned, and the slice does not yet pair the same scenario against a fake gateway through a shared parity helper.

## Initiative Impact

The durable plan should no longer treat fixture-contract work or the live conformance spine as not started. Future work can build from the explicit repository configuration boundary instead of reopening whether real gateways need repository selection.

The canonical repository, visibility, maintainer, credential model, and exact persistent fixture identities remain open. The next initiative work should provision or select the canonical repository and update the fixture catalog, then finish the read-only fake/real parity slice against those real fixture identities.

## Follow-Ups

- Provision or select the canonical conformance repository and replace placeholder catalog entries in `packages/asdl-core/live_conformance/github/fixtures.py` with real persistent fixture identities.
- Add a fake-side or shared parity helper for the `pr_basic_lookup` scenario so the read-only slice validates fake and real behavior, not only the real gateway against GitHub.
- Run the live read-only command against the canonical repository once it exists and record any setup, fixture, rate-limit, or semantic drift findings.
