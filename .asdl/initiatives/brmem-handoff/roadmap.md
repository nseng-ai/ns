# Roadmap

## Work

- [ ] Build the steel thread: a first-party handoff workflow inspired by the existing handoff skill that writes the next-session handoff document into Branch Memory for the current branch.
- [ ] Decide and document the Branch Memory storage convention, including namespace/base area, entry key, overwrite policy, and expected retrieval command.
- [ ] Add next-session loading guidance so an agent can find the stored handoff and continue from it reliably.
- [ ] Add tests or scenario coverage for the write path and load path around the Branch Memory handoff behavior.
- [ ] Extend the workflow design to include a session summary artifact alongside the primary next-session handoff.
- [ ] Extend the workflow design to include a repo-efficiency/self-learning analysis that records what would have made the session faster or clearer.
- [ ] Update skill documentation so agents know when to use the Branch Memory handoff workflow instead of the vendored temp-file handoff.

## Parked

- [ ] Research compound engineering patterns and decide which terminology or practices should shape the self-learning analysis.
- [ ] Consider whether handoff history should support multiple timestamped entries rather than one current branch handoff.
- [ ] Consider whether useful handoff learnings should graduate from Branch Memory into checked-in docs, skills, ADRs, or issues.
