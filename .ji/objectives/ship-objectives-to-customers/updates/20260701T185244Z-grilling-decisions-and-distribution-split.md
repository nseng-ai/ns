# Onboarding design grilling: open questions resolved, distribution split out

## Summary

A design grilling session (grounded in a full read of the current `ts/` packaging
state and the three dependency Objectives) resolved every Open Question in this
Objective, plus the internal design of the first build slice (`sdl init`). Ground-truth
findings that shaped the decisions:

- **The checkout-free npm bundle is a large, genuinely-unstarted long pole.** `ts/` is a
  pure run-from-source monorepo: `sdl`'s bin points at raw `./src/cli.ts` run through
  jiti; there is **no build/bundle/dist step, no publish config anywhere**, and
  `.sdl/extensions/AGENTS.md` calls checked-in bundled artifacts "a liability." The kernel
  reaches `@sdl/objective` via a **source-path jiti alias loader**
  (`ts/packages/kernel/src/sdk/module-loader.ts`) resolving `@sdl/...` to absolute on-disk
  `.ts` paths, plus checked-in `.sdl/extensions/objective/` manifests that re-export
  workspace source. Everything runs off `ts/node_modules` via a hard-coded `NODE_PATH`.
  Checkout-free therefore requires: a new build/bundle step, replacing that source-path
  loader, un-`private`-ing `@sdl/kernel` + transitive deps, and replacing the shims.
- **`skill-management-subsystem` is greenfield** — no `sdl skills` command exists; only a
  plan + Pup report + areg's symlink-based install.
- **areg's symlink skill model does not fit customers.** areg materializes first-party
  skills by symlinking `.claude/skills/<name>` → `.agents/skills/<name>` → repo-internal
  `skills/<name>/`. A customer has no `skills/` source tree; their skills arrive **bundled
  in the installed npm package** and must be **copied** into harness roots as real dirs.
- **The managed-block machinery is already a shared primitive:** `@sdl/core/managed-region`
  (`managedRegionBounds`), which `ts/packages/tools/areg/src/operations/init.ts` already
  consumes. areg's `init` also already does append/update/already-current/malformed
  handling and `--yes` — a strong *pattern reference*, but it is dev-facing (clones a
  `BOOTSTRAP_REPO`, hard-codes the symlink skill convention).
- `eve-parity-docs-site` is built and buildable; the objective pages (installation,
  quickstart, concepts/objectives, tools/objective) exist as **Lorum-ipsum placeholders** —
  a fill-in-the-prose job, deploy-gated.

## Objective Impact

### Open Questions — all resolved

1. **npm distribution structure → SPLIT.** Checkout-free npm distribution of `sdl` becomes
   its own Objective (`checkout-free-sdl-distribution`); it benefits every capability, not
   just objectives, and is the biggest/riskiest chunk. This Objective keeps it as a **hard
   dependency**, and its own near-term work proceeds against a run-from-source install.
2. **Instruction block content → LEAN.** Day-one block teaches only: objectives exist and
   live in `.sdl/objectives/`; before non-trivial work run `sdl objective list` and read any
   overlapping objective's `objective.md` + `roadmap.md`; use the objective skills/CLI to
   create → advance → update → close. `load-orientations` (nothing to load in a fresh repo)
   and Tracking-Gate prose (already lives inside the `objective-next` skill) are layered in
   later by the upgradeable managed block, not shipped day-one.
3. **Bootstrap home → `sdl init`.** A thin repo-level composing orchestrator (not
   `sdl objective init`, not folded into `sdl skills install`).
4. **AGENTS.md write → managed BEGIN/END block**, areg-style markers (`sdl:objectives:*`),
   idempotent/upgradeable/removable, plus the `CLAUDE.md → @AGENTS.md` import. Not
   copy-paste-only.
5. **Pi slash extension → internal/additive.** `sdl objective` CLI + skills is the single
   portable customer substrate on all three harnesses; `@sdl/objective-pi` (private) stays
   an internal convenience, not a v1 customer surface.
6. **Mandatory harness bar → all three** (Claude Code + Codex + Pi) verified end-to-end.
   This is stronger than the prior "at least Claude Code and Codex (Pi if feasible)"
   wording; completion criteria updated accordingly.

### Derived decision

- **Skill delivery backend → depend on `skill-management-subsystem`; drive a minimal
  copy-into-harness-roots slice** (copy bundled skill dirs → `.claude/skills/` +
  `.agents/skills/`, idempotent). Do **not** reuse areg's symlink model. `sdl init` composes
  this. Customer skill delivery is gated on (a) skills bundled into the npm package (the
  split-off distribution Objective) and (b) this copy mechanism.

### First build slice — `sdl init` core (bundle-independent parts)

- **Home →** new **`@sdl/init`** capability package, surfaced as top-level `sdl init` the
  way `@sdl/objective` is wired. Reuses `@sdl/core/managed-region`; treats areg's `init` as
  a pattern reference only (no dependency on the dev-facing tool).
- **Harness selection →** explicit `--harness` flag **required, no sniffed default**;
  persist the chosen set to `sdl.toml` so upgrade re-runs reuse it (explicit-origin, not a
  guessed default).
- **Git posture →** verify + write, **never commit**: require a git repo (clear error +
  "run git init" if absent), verify trunk is detectable, write the managed block + create
  `.sdl/objectives/` (with `.gitkeep`), leave staging/commit to the customer. Reuses
  `@sdl/git` probes.
- **Skill seam →** typed **`SkillMaterializer`** gateway interface owned by `@sdl/init`,
  faked for scenario tests + a clearly-labeled stub real-impl now ("skill install pending
  bundle"); wire the real impl to skill-management's copy op in-process when it lands. This
  keeps the whole activation flow scenario-testable now.

### Dependency map

- **Unblocked now** (against run-from-source): `@sdl/init` (managed block writer, lean
  instruction text, `.sdl/objectives/` + git posture, faked skill seam); docs prose.
- **Gated on `checkout-free-sdl-distribution`:** the npm bundle → skills bundled in the
  package → the real `SkillMaterializer` → E2E verification on all three harnesses.

### Domain-modeling items to reconcile

- **"harness"** (this Objective) vs **"agent"** (areg's `[areg].agents` in `sdl.toml`) —
  reconcile the config vocabulary before `sdl init` reads/writes harness selection.
- Marker namespace `sdl:objectives:*` coexisting with areg's `areg:skills:*`.
- `SkillMaterializer` as the named seam between activation and skill delivery.

Provenance: design grilling session; grounded in HEAD read of `ts/` packaging +
dependency Objectives. No code changed in this update.

## Follow-Ups

- Create + link the `checkout-free-sdl-distribution` Objective (done alongside this update).
- Scaffold `@sdl/init`: package skeleton, `SkillMaterializer` interface + fake + stub,
  managed-block/git-posture operation surface with scenario tests.
- Reconcile the harness/agent config vocabulary in a `CONTEXT.md` pass before wiring
  `sdl init` harness selection.
- Fill the placeholder objective docs pages (installation, quickstart,
  concepts/objectives, tools/objective) and un-gate publication.
