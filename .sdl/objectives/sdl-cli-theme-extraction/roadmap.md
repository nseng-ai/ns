# Roadmap

## Work

- [x] Establish the new SDL house-style CLI theme package. `@sdl/cli-theme` now owns the former Clinkr theme primitives and focused tests under `ts/packages/infra/cli-theme/`; Clinkr retains generic command/runtime substrate code.
- [x] Rewire existing theme consumers to the new package and remove the `@sdl/clinkr/theme` export. Live TypeScript imports now use `@sdl/cli-theme`, consumer manifests depend on it, and `@sdl/clinkr` no longer exports `./theme`.
- [x] Add or update import-boundary tests so `@sdl/clinkr` cannot import the SDL theme package and display dependencies stay outside Clinkr's generic core graph. `core-import-isolation` now rejects Clinkr production imports of `@sdl/cli-theme`; `@sdl/cli-theme` has a package-boundary test against capability imports, Clinkr private subpaths, `process.*`, and command exit primitives.
- [x] Document the new boundary in the relevant package/context docs: Clinkr owns command/runtime/caps/IO/stream mechanics; the SDL CLI theme package owns house-style presentation primitives. Current CLI UX guidance now points to `@sdl/cli-theme`; a package-specific `CONTEXT.md` and full context-map rebaseline are deferred to repo-ontology/package-context work rather than folded into this extraction.
- [x] Rebaseline the migrated-command duplication analysis after the package move so follow-up decisions are based on the new boundary, not stale `@sdl/clinkr/theme` paths. Current matrix: keep domain outcome/status/caps policy local, treat Slot navigation as the clearest next implementation slice, and defer table/Markdown consolidation until requirements prove a lower primitive or shared composer.
- [ ] Assess outcome/result discriminator to result-block mapping across Flow commands. Decide whether to prototype flow-local first, promote to the theme package, or leave command-specific; include exit-code/refusal/warn guardrail implications in the decision.
- [ ] Assess success-with-warnings rendering. Decide whether it is a tiny shared helper in the theme package, a command-face helper, or not worth extracting beyond local cleanup.
- [ ] Assess caps-resolution duplication. Decide whether Flow's host-aware resolver should move into Clinkr, the theme package, SDL host/capability kit, or remain specialized.
- [x] Finish assessing Slot navigation footer migration. Slot navigation success rendering is now Slot-local and shared across `slot goto`, `slot checkout`, and `slot gt up/down` through `navigation-presentation.ts`; the legacy plain footer renderer no longer has live source/test references.
- [ ] Assess table rendering. Decide whether `@sdl/core/text-table` and the moved theme table are intentionally distinct, should consolidate, or need a lower terminal-text primitive; add a Markdown table composer if repeated Markdown boilerplate warrants it.
- [ ] Assess status-to-intent mapping helpers. Promote only mappings that are presentation grammar rather than domain status policy.
- [x] Close or update overlapping roadmap rows in `cli-ux-north-star` as appropriate so UX rollout tracking and this package-boundary Objective do not drift. Current CLI UX house-style, audit, objective, and roadmap guidance now names `@sdl/cli-theme` for house-style primitives while preserving historical update provenance.

## Parked

- [ ] Moving `@sdl/clinkr/stream` out of Clinkr. Revisit only if evidence shows the stream package is SDL house-style presentation rather than generic terminal live-region mechanics.
- [ ] Broad redesign of result-block grammar beyond the current signed-off house style.
- [ ] Styling additional hidden `exec`, payload, or agent-only surfaces outside the normal CLI UX rollout criteria.
