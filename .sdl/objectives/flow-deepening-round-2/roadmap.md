# Roadmap

Candidate numbers refer to the review at `architecture-review.html` in this
directory.

## Work

- [x] Collapse the Graphite command channel (review #1)
      One deep channel module owns streamed-vs-raw, normalization, and gt
      arg-building; `graphite-maintenance.ts` and the land pipeline call it, and
      the `pi` triplet stops threading through the land options bags. Land as its
      own reviewable slice given the live-path blast radius.
      Evidence: land scenario + integration tests pass driving a scripted channel
      instead of the outermost `pi.exec`.
- [x] Give each autobranch failure one home (review #2)
      Co-locate each failure's verdict + message with its union arm in one
      catalog; unify the `dirty-*` and `latest-commit-*` flows onto one
      prepare→transact→catalog shape; move `AutobranchFlowOutcome` /
      `AutobranchFlowResult` out of `dirty-worktree.ts`.
      Evidence: autobranch unit + scenario tests pass.
- [x] Unify the PR-description update path and close the fingerprint overwrite bug (review #3)
      Fold `prepareRegeneratedPrDescription` and `orchestratePrDescription` into
      one update module that takes the managed-region fingerprint policy; delete
      the `shared/pr-description.ts` duplicate.
      Evidence: a test shows the regenerate path now skips an already-current
      body; existing pr-description + submit scenario tests pass.

## Parked

- [ ] Collapse the sdl-land round trip (review #4, Worth exploring)
      Six representations of "the stack" with duplicated `type↔kind` mappers and
      operation-label heuristics. Parked: touches the **Flow Land Compatibility
      Boundary** / **Flow Stack Preflight Adapter** — sequence with any land
      extraction, not against it.
- [ ] Unify the land presentation surface (review #5, Worth exploring)
      One outcome is formatted, re-wrapped, and mirrored across `presentation.ts`,
      `land-presentation.ts`, and `command-stream.ts`, split by rendering
      mechanism rather than by outcome. Unblocked by review #1.
- [ ] Delete the forwarder shims (review #6, Worth exploring)
      Inline six single-purpose rename/re-export files (`shared/git.ts`,
      `text-helpers.ts`, `checkpoint-message.ts`, `submit/format.ts`,
      `autobranch/short-sha.ts`, `land-stack/graphite-metadata-command.ts`); keep
      only many-consumer naming seams.
- [ ] De-leak the submit gateway (review #7, Worth exploring)
      Move Graphite-stderr classification behind `SubmitGateway` so it returns
      domain results; co-locate each failure shape with its message so branches
      stop bouncing `submit.ts` ⇄ `submit-format.ts`.
