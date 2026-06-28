# Roadmap

## Work

- [ ] Establish the new SDL house-style CLI theme package. Move the current `@sdl/clinkr/theme` primitives, exports, and tests into the new package with minimal behavior change; keep Clinkr focused on generic command/runtime substrate.
- [ ] Rewire existing theme consumers to the new package and remove the `@sdl/clinkr/theme` export. Preserve current human output snapshots/expectations except for intentional package/import changes.
- [ ] Add or update import-boundary tests so `@sdl/clinkr` cannot import the SDL theme package and display dependencies stay outside Clinkr's generic core graph.
- [ ] Document the new boundary in the relevant package/context docs: Clinkr owns command/runtime/caps/IO/stream mechanics; the SDL CLI theme package owns house-style presentation primitives.
- [ ] Rebaseline the migrated-command duplication analysis after the package move so follow-up decisions are based on the new boundary, not stale `@sdl/clinkr/theme` paths.
- [ ] Assess outcome/result discriminator to result-block mapping across Flow commands. Decide whether to prototype flow-local first, promote to the theme package, or leave command-specific; include exit-code/refusal/warn guardrail implications in the decision.
- [ ] Assess success-with-warnings rendering. Decide whether it is a tiny shared helper in the theme package, a command-face helper, or not worth extracting beyond local cleanup.
- [ ] Assess caps-resolution duplication. Decide whether Flow's host-aware resolver should move into Clinkr, the theme package, SDL host/capability kit, or remain specialized.
- [ ] Finish assessing Slot navigation footer migration. Generalize `navigation-presentation.ts` if appropriate, move checkout and `gt up/down` to the new presentation path, and delete the legacy plain footer when no consumers remain.
- [ ] Assess table rendering. Decide whether `@sdl/core/text-table` and the moved theme table are intentionally distinct, should consolidate, or need a lower terminal-text primitive; add a Markdown table composer if repeated Markdown boilerplate warrants it.
- [ ] Assess status-to-intent mapping helpers. Promote only mappings that are presentation grammar rather than domain status policy.
- [ ] Close or update overlapping roadmap rows in `cli-ux-north-star` as appropriate so UX rollout tracking and this package-boundary Objective do not drift.

## Parked

- [ ] Moving `@sdl/clinkr/stream` out of Clinkr. Revisit only if evidence shows the stream package is SDL house-style presentation rather than generic terminal live-region mechanics.
- [ ] Broad redesign of result-block grammar beyond the current signed-off house style.
- [ ] Styling additional hidden `exec`, payload, or agent-only surfaces outside the normal CLI UX rollout criteria.
