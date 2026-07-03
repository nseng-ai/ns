# Flow autoslot result block

## Summary

`sdl flow autoslot` has migrated to the signed-off CLI house style (`house-style.md`). Unlike the
prior flow-local ports, autoslot's autobranch + slot-checkout workflow is orchestrated in CCC and
reports its settled outcome through `CommandIo.notify(...)`, so presentation landed **CCC-local**
rather than in the flow wrapper.

What changed:

- New CCC-local renderer `ts/packages/ccc/src/autoslot-presentation.ts` — the CCC twin of the flow
  capability's `workflow-result-block.ts`. Same headline grammar (bold + intent-paint + leading glyph,
  §3), concise-success / detailed body tiers (§4), and dimmed `Cwd:` evidence; it is a pure string
  builder over `caps` + typed facts. It lives in CCC because the flow capability sits **above** CCC —
  importing a flow renderer downward into CCC would invert the dependency — and the Objective's standing
  rule forbids cross-package extraction. CCC already depends on `@sdl/clinkr`.
- `ts/packages/ccc/src/autoslot.ts` now styles its four durable outcomes through the renderer:
  - **slot move success** → `success` (green ✓) on stdout (`info` notify): headline + `Worktree:` body +
    the copyable `sdl slot co <branch>` navigation line at normal weight (house-style §7.5).
  - **branch created, slot move skipped** (dirty post-autobranch worktree) → `refusal` (warn ✗) on
    stderr (`warning` notify, exit 0): the branch was created, the slot move is a guardrail-declined
    follow-up, not a failure.
  - **branch created, slot checkout failed** → `failure` (red ✗) on stderr (`error` notify, exit 1) with
    the structured `formatSlotCheckoutFailureCause` cause in the body.
  - **autobranch failure before slot checkout** → `failure` (red ✗) or, using the PR-2
    `AutobranchFlowResult.outcome` discriminator, `refusal` (warn ✗) when autobranch declined a guardrail
    (pushed-HEAD / child-branch / root-/merge-commit). Both flip the exit code via the `error` notify
    level — the visual intent lives in the rendered block, the level owns stdout/stderr routing and
    exit (so a declined guardrail renders warn, not red, while still exiting 1).
- The flow wrapper `ts/packages/capabilities/flow/src/commands/autoslot.ts` resolves caps at the
  host-extension seam via `resolveFlowStreamCaps(ctx)` (§1) and threads them through `runFlowCccCli` →
  `runAutoslotCli` → `createAutoslotFlow`. No other behavior changed.
- CCC `CommandIo` semantics preserved: transient progress stays on `phase(...)` / `onOutput` (stderr),
  durable outcomes on `notify(...)`, `error`-level notify flips the CLI exit. No machine output
  contract, no raw exit, no new dependency edge (CCC already depended on `@sdl/clinkr`).

Tests:

- `ts/packages/ccc/test/autoslot-presentation.test.ts` (new): success/failure/refusal tiers +
  truecolor/mono/ascii caps degradation for the CCC renderer.
- `ts/packages/ccc/test/autoslot.test.ts`: caps threaded into the flow/CLI fixtures; durable-outcome
  assertions now `stripAnsi` the styled blocks and assert the house-style headlines, the preserved
  cause text, and the copyable navigation line. Phase/exit/routing assertions unchanged.
- `ts/packages/capabilities/flow/test/scenario/autoslot-command.test.ts` (new): exercises the wrapper
  end-to-end through `runFlowCccCli` on the outcomes that settle before slot checkout (snapshot probe
  failure; clean-worktree eligibility refusal), asserting house-style stderr blocks, exit codes, no
  Graphite branch creation, and that transient phases route through `onOutput` on stderr (never stdout).
  The happy slot-move path uses a real `SlotClient` (filesystem/git side effects), so its domain
  coverage stays in the CCC unit suite per the no-real-backend default-lane policy.

## Objective impact

- `cli-surface-audit.md` now marks `sdl flow autoslot` as Done.
- Establishes the precedent for CCC-owned side-effect commands: when the outcome facts are computed in
  CCC and reported via `CommandIo.notify`, the house-style renderer lives CCC-local next to them, not in
  the flow wrapper. This is the documented resolution of the plan's "flow-wrapper vs CCC-local" decision
  for autoslot (standalone `ccc` does not expose autoslot, but the typed outcome is only available in
  CCC, and the flow wrapper sees only opaque notify text).
- Remaining P0 flow side-effect surfaces: `regenerate-pr` and `land` (the latter as a two-PR
  discovery + redesign mini-stack).

## Follow-ups

- `autoslot-presentation.ts` and the flow-local `workflow-result-block.ts` are now near-identical
  house-style block builders in two packages. The user's standing decision is no extraction in this
  plan; record any future promotion to a shared renderer as parked, not in-plan.
- `land` is the other `runFlowCccCli` consumer and the other CCC-owned presentation surface; its PR can
  reuse this CCC-local presentation precedent (and may want a richer block than autoslot's).

## Evidence

Validation run after implementation:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/ccc/test/autoslot.test.ts packages/ccc/test/autoslot-presentation.test.ts packages/capabilities/flow/test/scenario/autoslot-command.test.ts`
  — passed (18 tests).
- `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-guard`,
  `just dprint-check`, `just ts-deps-check` — see commit/PR for the recorded run.
