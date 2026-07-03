# Roadmap

## Work

- [x] Add the `proto-objective-impl` internal skill.
  - Scope: Create a prototype skill that reads a selected Objective, distinguishes autonomy-designed from human-assisted operation, requires an upfront preview, defines branch/commit/PR-submission boundaries, and preserves the no-hidden-run-ledger rule.
  - Evidence: `skills/proto-objective-impl/SKILL.md` exists with internal metadata and documented runner guidance; `.agents`/`.claude` skill links resolve to the canonical source; `dprint check skills/proto-objective-impl/SKILL.md skills-lock.json` passed.

- [x] Add the `/proto:objective-impl` Pi wrapper/picker.
  - Scope: Provide an opt-in prototype command that selects an explicit active Objective and injects the selected slug into `proto-objective-impl`, reusing existing picker/skill-expansion patterns where practical.
  - Evidence: `.pi/extensions/proto.ts` registers a dedicated project-local adapter backed by `ts/packages/pi-extensions/src/proto.ts`; the wrapper accepts explicit Objective slugs/paths, reuses active Objective picker behavior, expands `proto-objective-impl`, and leaves existing `/objective:*` command names unchanged.

- [x] Harden the prototype with targeted tests and validation.
  - Scope: Cover deterministic helper logic, command routing, and safety-boundary behavior such as explicit selection and preview-scoped PR submission wording. Keep canonical Objective docs and main surfaces unchanged unless a narrow blocker appears.
  - Evidence: `ts/packages/pi-extensions/test/proto.test.ts` covers registration, explicit selection, fallback, picker/cancel/no-active/non-UI behavior, changed-Objective suggestions, and command-surface separation; `just ts-check`, `just ts-test`, and `just dprint-check` passed.

## Parked

- [ ] Graduate the prototype to a main `/objective:impl` surface.
  - Parked because real dogfood should inform whether the prototype deserves to become canonical.

- [ ] Promote standing/autoobjective conventions into `docs/objective-system.md`.
  - Parked because the current design intentionally keeps these conventions in the prototype design brief and skill until implementation experience proves they are stable.

- [ ] Define a repo-wide `proto-` naming convention.
  - Parked because this Objective uses `proto-` for this runner only and does not attempt to settle broader naming policy.
