# Roadmap

## Work

- [x] Confirm `.pi/prompts/objective-stack-impl.md` exists and can be invoked as `/objective-stack-impl objective-stack-prompt-smoke-test`.
- [x] Run the prompt from a normal parent session and have it inspect this Objective, repo state, git state, and Graphite state before planning.
- [x] Create the first smoke-test stack slice: add `docs/objective-stack-prompt-smoke-test/README.md` with a short purpose and revert note.
- [x] Create the second smoke-test stack slice: add `docs/objective-stack-prompt-smoke-test/walkthrough.md` and link it from the README if useful.
- [x] Validate that implementation changes outside Objective metadata are confined to `docs/objective-stack-prompt-smoke-test/`.
- [x] Record an Objective update summarizing whether the prompt produced a two-PR stack, how child-session returns were interpreted, and any manual intervention needed.
- [ ] Decide whether to keep the local test branches for inspection, submit draft PRs, or abandon the smoke-test stack after review.

## Parked

- [ ] A richer smoke test that modifies code or tests.
- [ ] Automatic PR submission as part of the smoke test.
- [ ] Cleanup branch that removes the fixture directory after the prompt workflow is verified.
