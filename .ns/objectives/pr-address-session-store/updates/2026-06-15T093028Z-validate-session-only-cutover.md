# Validate session-only cutover

## Summary

`validate-feedback-classification` has crossed the session-store boundary and is now session-only.

The operation requires `--pr-number` plus exactly one agent-authored classification source (`--classification-json` or `--classification-file`). It resolves the compact manifest from the payload session by PR number, includes `resolved_inputs.manifest` in validate results after manifest resolution, writes the PR-scoped classification artifact on successful validation, and omits `classification_reference` on validation-negative output.

Removed validate flags are no longer part of the command surface: `--payload-json`, `--payload-file`, `--manifest-json`, `--manifest-file`, and `--persist-session` now fail as Clinkr/commander usage errors. `classification-template` and `plan-feedback` intentionally keep their explicit/stdin/session compatibility modes for now.

Evidence considered: local working-tree changes on branch `validate-feedback-classification-session-only`; Graphite parent `update-duplicate-abstraction-review-guidance`; no current-branch PR; full TypeScript check and full TypeScript test passed. The local branch has no committed diff against the Graphite parent yet, so this update treats the current uncommitted branch changes as the post-landing state.

## Objective Impact

This completes the validate-specific portion of the Objective's validation gate and starts the broader composed-input removal row. The prior reground evidence that validation still had split/wrapper compatibility is now historical for validate: manifest input is session-resolved, and the only remaining file/JSON input is the agent-authored classification packet.

The Objective is not complete. `plan-feedback`, batch build, checkpoint, finalization, stack build, mutation, compact stdout defaults, and the broader skill rewrite still remain. The validation cutover does not change the no-implicit-mutation rule; mutation helpers still need explicit artifact references in a later slice.

## Follow-Ups

- Continue removing composed pipeline-produced inputs from the remaining helpers without reintroducing validate compatibility paths.
- Keep `classification-template` and `plan-feedback` compatibility modes until their own roadmap slices deliberately remove them.
- Reuse the same session-resolved input and `resolved_inputs` audit pattern when migrating later build/checkpoint/finalization helpers.
