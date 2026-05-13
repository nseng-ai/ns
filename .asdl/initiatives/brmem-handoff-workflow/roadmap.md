# Roadmap

## Work

- [ ] Create the first-party `branch-handoff` skill with Branch Memory storage in namespace `session-artifacts` and key pattern `handoffs/<slug>.md`.
- [ ] Define the skill workflow for deriving or accepting a handoff slug, checking for collisions, writing the Markdown artifact, and reporting the Branch Memory locator.
- [ ] Document how a later session or different harness lists and reads handoff artifacts for the current branch.
- [ ] Validate the steelthread manually by creating and reading at least one handoff artifact on a branch.

## Parked

- [ ] Add support for additional artifact types such as session summaries or lessons learned.
- [ ] Design harvesting of merged-PR session artifacts into a durable knowledge base or corpus.
- [ ] Consider a dedicated CLI only if the skill-only workflow proves too procedural or needs stronger validation.
