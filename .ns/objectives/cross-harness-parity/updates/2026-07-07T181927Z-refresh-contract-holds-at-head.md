# Refresh: parity contract holds at HEAD; extensions inventory corrected

Provenance: objective-refresh basis target=9fa6a502d from=trunk-HEAD

## Summary

Forensic refresh against trunk HEAD (`9fa6a502d`), 215 repo commits after the
record was last touched (`64969936b`, the 2026-07-05 `@nseng-ai/*` rebaseline).
The whole verified contract still holds; only one factual drift was found and
corrected.

Verified TRUE at HEAD:

- Package scope is `@nseng-ai/*` — no `@ns/` scope survives under `ts/packages/`.
- The single `ns` bin is owned by `@nseng-ai/kernel` (`ts/packages/kernel/package.json` `bin.ns` = `./src/cli/index.ts`), despite a new `@nseng-ai/ns` package existing at `ts/packages/hosts/ns-cli/`.
- All package landmarks resolve: `@nseng-ai/flow`, `@nseng-ai/ccc`, `@nseng-ai/capability-kit`, `@nseng-ai/foundation` (`ts/packages/infra/foundation/`), `@nseng-ai/clinkr`, `@nseng-ai/pi`. Model-slug seams (`foundation/src/primitives/model-slug.ts`, `capability-kit/src/kit/model-slug.ts`) and `capability-kit/src/cmux/focused-terminal-tab.ts` all present.
- **cmux dispatch gap persists**: `ts/packages/capabilities/ccc/src/ns/cli.ts` exposes only the hidden `exec` group with `cmux-workspace-summary` + `autobranch`; no dispatch-plan / dispatch-prompt / open-branch command. ccc is still not wired into `.ns/extensions/`. Dispatch cmux modules (`dispatch-from-trunk.ts`, `dispatch-prompt.ts`, `slot-dispatch-plan.ts`, `slot-open-branch.ts`, `prompt-file.ts`) remain trapped in Pi.
- **flow doctrine gap persists**: exactly four `ns-flow-*` wrapper skills exist (`autobranch`, `branch-latest-commit`, `cp`, `submit`); land/push/autoslot/changes/pull-trunk/regenerate-pr have CLI + Pi bridge but no skill. All ten flow commands are wired under `.ns/extensions/flow/src/commands/`.
- **command-output summaries** still unimplemented (no matching source in `ts/packages`).
- **parity-table full sweep** still not run; the table remains marked STALE.
- Distributed typed parity gates present (`flow-pi-parity`, `handoff-pi-parity`, `objective-pi-parity`, `branch-context-pi-parity`, the pi-tools `*-parity.test.ts` set, plus a new `kernel/test/integration/repo-local-extension-manifest-parity.test.ts`).

Corrected drift:

- `.ns/extensions/` group inventory in `objective.md` said `aretro` and `roaster`; the wired groups are actually `address, branch-context, flow, handoff, objective, retro, reviews` (ccc still absent). Fixed in place.

Checked and found NOT to widen the gap: the many new capability packages
(`plans`, `slots`, `reviews`, `retros`, `harness-artifacts`, `pr-feedback`,
`areg`, `vibechk`, `packagechk`) are CLI/capability packages with no `src/pi/`
registration dirs, so they add no new Pi slash-command surfaces. The parity
table's Pi-surface scope is therefore unchanged by the 215-commit drift; the
pending full sweep is still a rename/verification task, not a large new-surface
enumeration.

## Objective Impact

No change to thesis, scope, completion criteria, or open work. All four open
roadmap items (cmux dispatch CLI, flow skill/doctrine, command-output summaries,
parity-table full sweep) remain open and accurate. Only the extensions-group
inventory line in `objective.md` was corrected.

## Follow-Ups

- The pending parity-review full sweep may additionally audit the `.ns/extensions/` `retro`/`reviews` groups and the `/plans:plan-skill` surface string for whether any warrant parity-table rows.
