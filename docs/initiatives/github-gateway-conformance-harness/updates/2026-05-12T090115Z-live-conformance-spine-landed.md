# Live Conformance Spine Changes Roadmap State

## Summary

The opt-in live GitHub conformance spine now exists and is kept out of the
default test path. The initiative no longer needs to treat the spine shape as an
open design question; remaining work can focus on fixture selection, parity
assertions, and CI wiring.

The same work resolved the repository-targeting question for real GitHub
gateways: conformance can select an explicit repository instead of relying on
ambient checkout or process context.

## Roadmap Context

- **Establish the opt-in live conformance spine:** move out of `Remaining`;
  treat as completed, or completed pending curator validation if the initiative
  wants a review pass before closing it.
- **Define the test-repository fixture contract:** partially advanced, but the
  canonical repository, visibility/owner, CI token model, and actual golden
  fixtures remain unresolved.
- **Prove the first read-only fake/real parity slice:** still next; the existing
  seed is a starting point, not the completed shared parity contract.

## Initiative Impact

`roadmap.md` and `initiative.md` now need curation:

- `roadmap.md` still lists the opt-in live conformance spine as remaining.
- `initiative.md` still asks whether explicit repository/cwd injection is
  needed; the current direction is explicit repository selection.

Future initiative text should emphasize the remaining decisions: choosing the
canonical conformance repository, verifying golden fixtures, building parity
helpers/assertions, and wiring scheduled/manual CI.

## Follow-Ups

- Curate `roadmap.md` and `initiative.md` to reflect the landed spine and
  explicit repository selection.
- Decide the canonical conformance repository, owner/visibility, and CI token
  model.
- Build the first read-only fake/real parity slice against a verified golden
  PR/issue scenario.
