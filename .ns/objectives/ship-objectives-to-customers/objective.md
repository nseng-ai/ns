---
blocked: First external publish is gated on the checkout-free-sdl-distribution hard dependency landing — a customer cannot install `ns` from npm and run it checkout-free until it does.
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Consumed as a hard dependency; checkout-free npm distribution of `ns` must land before objectives ship externally.
  - objective: ns-skills-steelthread
    annotation: Consumed for skill delivery; customer onboarding requires objective skills provisioned into Claude Code, Codex, and Pi harness roots via its `ns skills` surface.
  - objective: cross-harness-parity
    annotation: Consumes its reachability contract (shared CLI + skill, Pi additive); onboarding must reach all three harnesses through that doctrine.
  - objective: eve-parity-docs-site
    annotation: Consumes the docs-site shell it owns; customer onboarding needs publishable installation, quickstart, and concept docs on that substrate.
---

# Ship Objectives to Customers

## Thesis

The Objective capability is the first SDL feature we ship to external customers. Today it is only usable inside this repo checkout: it is delivered as the `ns objective` CLI plus a family of skills plus a Pi extension, all run from source, and the accepted distribution model for every SDL CLI (including `ns` itself) is a run-from-source shim that requires a repo checkout and `ts/node_modules`.

Shipping Objectives externally means a customer with no SDL checkout and no dev toolchain can: install the `ns` CLI from npm, get the objective skills into whichever harness they use (Claude Code, Codex, or Pi), bootstrap their own repo so their agents actually reach for objectives, and follow real documentation — with no standalone objective binary.

**Naming (ADR 0026 `rename-ji-to-ns`, amended by ADR 0028):** the shipped customer surface is the `ns` CLI, and the core cutover has landed — the repo's binary is now `ns`, consumer dirs are `.ns/` (`.ns/objectives/`, `.ns/extensions/`), config is `ns.toml`. The workspace package scope is bare `@nseng-ai/*` (ADR 0028 chose bare `@nseng-ai/*`, superseding ADR 0026's interim `@ns/*` workspace-scope plan), so the packages this Objective touches are `@nseng-ai/kernel` (`ts/packages/kernel`), `@nseng-ai/objectives` (`ts/packages/capabilities/objectives`), and `@nseng-ai/foundation` (`ts/packages/infra/foundation`, with a `./managed-region` export). The published customer CLI target is `@nseng-ai/ns` (`ts/packages/hosts/ns-cli`). All new surface this Objective builds stays ns-named — `ns init`, `ns skills`, `ns objective …`, `ns:objectives:*` block markers, the `@nseng-ai/ns-init` package. The dev/repo bin still runs from source (`ts/packages/kernel/package.json` bin → `./src/cli/index.ts`), but run-from-source is no longer the only path: `checkout-free-sdl-distribution` has folded kernel into a bundled `@nseng-ai/ns` package whose local pack and checkout-free smoke already run `ns objective list` from a foreign repo — only the actual npm publish and a real global/`npx` install verification remain (see the dependency status below).

This Objective owns the end-to-end customer onboarding thread. Treat it as the parent/umbrella Objective for the customer Objective shipment: its formal Objective Edges identify subobjectives whose delivered scope is consumed here. The sequencing order is:

1. `checkout-free-sdl-distribution` — first and currently blocking; customers need an installable `ns` before any external onboarding can be real.
2. `skill-management-subsystem` — next concrete dependency; once the package/bundle shape exists, objective skills need a first-party `ns skills` provisioning path into harness roots.
3. `cross-harness-parity` — then prove the workflow contract across Claude Code, Codex, and Pi; Pi remains additive over shared CLI + skill reachability.
4. `eve-parity-docs-site` — final launch substrate; publishable docs can progress in parallel, but final customer docs should reflect the stabilized install/init/skill surfaces.

This ordering is guidance in parent prose, not an edge taxonomy: Objective Edges remain kind-less, and this record's `blocked` sentence stays focused on the checkout-free hard gate unless another subobjective actively blocks the next useful parent slice.

## Scope

- **npm distribution of the `ns` CLI (the long pole).** Ship a checkout-free `ns` a customer can install from npm (no `ts/node_modules` precondition) and run `ns objective …` against their own repo. The decided design keeps `@nseng-ai/kernel` permanently `"private": true` and folds its runtime surface — plus `@nseng-ai/objectives` and its hidden `exec` surface — into the published `@nseng-ai/ns` bundle via esbuild, rather than publishing kernel standalone, and replaces the source-path module loader (`ts/packages/kernel/src/runtime/module-loader.ts`). This was deferred capability-by-capability "to the umbrella Objective," which closed (`port-asdl-toolkit-to-typescript`) without doing it, on the recorded rationale that no real external consumer existed yet. This Objective is that consumer. **Owned by the dedicated `checkout-free-sdl-distribution` Objective** (split decided 2026-07-01); consumed here as a hard dependency, since checkout-free `ns` benefits every capability, not just objectives.
- **Skill delivery to the customer's harness.** Objective skills bundled into the npm package and installable into the correct per-harness roots (`.claude/skills/` for Claude Code; `.agents/skills/` for Codex and Pi) via `skill-management-subsystem`'s Pup-inspired `ns skills` list/path/install surface. Shipping CLI and skills together also resolves the CLI↔skill bidirectional dependency.
- **Customer-repo bootstrap / activation.** A first-party path that materializes skills for the harnesses present in a repo, injects a minimal, portable, harness-neutral objective instruction block into `AGENTS.md` (with the `CLAUDE.md → @AGENTS.md` import for Claude Code), creates `.ns/objectives/`, and verifies git posture. Activation has two independent requirements: the capability materialized where each harness looks, and the agents instructed to use it.
- **Onboarding documentation content.** Real (non-placeholder) concept and quickstart content for objectives in `docs-site` (installation, quickstart, concepts/objectives, tools/objective). The docs-site shell and stack are owned by `eve-parity-docs-site`; this Objective owns the objective-specific content and its publication gating.
- **Harness coverage.** Claude Code, Codex, and Pi are all first-class customer targets. Cross-harness reachability (deterministic logic in a shared CLI, a skill driving it, the Pi extension purely additive) is owned by `cross-harness-parity`; this Objective consumes it and adds the onboarding coverage for all three.

## Non-Goals

- No standalone `objective` binary; the supported surface is the `ns` CLI (`ns objective …`).
- No contributor / dev-environment onboarding (`just`, pnpm, direnv, `slot`, source shims). Those serve SDL developers, not a customer who only wants objectives.
- No marketplace, remote skill registry, semantic-version solver, or dependency graph.
- No re-implementation of skill install-path logic here; consume `skill-management-subsystem`.
- No hidden state, telemetry, or account/licensing system in v1.
- Not shipping every harness on the platform list in v1 — only Claude Code, Codex, and Pi (Cursor, opencode, Gemini, Windsurf parked).

## Completion Criteria

- A customer with no SDL checkout can install `ns` from npm and run `ns objective …` against their own repo, checkout-free (no `ts/node_modules`).
- The objective skills install into a customer's Claude Code, Codex, and Pi harnesses through a first-party command, landing in the correct per-harness roots.
- A first-party bootstrap step activates objectives in a customer repo: a minimal portable `AGENTS.md` instruction block (idempotent, upgradeable, removable), `.ns/objectives/` present and committed, and git posture verified.
- A customer can follow real installation and quickstart docs to create → advance → update → close their first objective, with no placeholder pages, and the docs site is publishable.
- Onboarding is verified end-to-end in a throwaway non-SDL repo for **all three of Claude Code, Codex, and Pi** (decided 2026-07-01; stronger than the prior "Claude Code and Codex, Pi if feasible" bar).
- Explicit decisions are recorded for the Resolved Decisions below.

## Assumptions and Risks

Assumptions:

- npm is the customer install vector for the `ns` CLI. (User-confirmed.)
- The supported surface is the `ns` CLI, not a standalone objective binary. (User-confirmed.)
- Skill bundling and install are delivered by `skill-management-subsystem` and do not need to be rebuilt here. *(Under revision 2026-07-05: the Pi-style extension model may ship objective skills inside `@nseng-ai/objectives` instead — see Open Questions.)*
- `ns objective` is effectively zero-config for a customer — trunk is auto-detected and `objective list` is explicitly Graphite-free — so portability is expected, though not yet verified end-to-end outside this checkout.
- `AGENTS.md` is the portable cross-harness instruction carrier: Codex and Pi read it natively, and Claude Code reaches it via the `CLAUDE.md → @AGENTS.md` import.

Risks:

- The checkout-free npm bundle is the long pole, but its owner (`checkout-free-sdl-distribution`) has nearly closed it: bundle strategy, runtime-dependency triage, the esbuild build/bundle step, checkout-dependent shim replacement, and the published-name decision have all landed, and `@nseng-ai/ns` local pack + `publish:dry-run` + a checkout-free smoke (install a packed tarball into a foreign repo and run `ns objective list`) pass. The module-loader replacement is in progress and the actual npm publish plus a real global/`npx` install verification remain, so external shipping still stalls until those land.
- Objective may carry hidden checkout / `ts/node_modules` assumptions: the CLI loads the objective capability and hidden `exec` surface through kernel extension discovery. The checkout-free smoke now runs `ns objective list` from a packed `@nseng-ai/ns` tarball in a foreign repo, largely de-risking first-party Objective discovery outside a checkout; a published artifact with the objective skills bundled in, and a real global/`npx` install, remain unverified.
- Writing into a customer's `AGENTS.md` risks clobbering their content; needs a safe managed-block design. Mitigable.
- Codex cannot make explicit-only skills zero-ambient, so objective skills always cost context on Codex. Acceptable, but must be documented.
- Coordinating across three in-flight dependency Objectives risks sequencing stalls; mitigate by treating them as dependencies with explicit interface expectations rather than blocking work.

## Resolved Decisions

Resolved 2026-07-01 in a design grilling session (full record:
`updates/20260701T185244Z-grilling-decisions-and-distribution-split.md`).

- **npm distribution structure → SPLIT** into the dedicated `checkout-free-sdl-distribution`
  Objective; a hard dependency here, not this Objective's spine.
- **Instruction block → LEAN.** Day-one block teaches only that objectives exist, to run
  `ns objective list` before non-trivial work and read overlapping records, and to use the
  objective skills/CLI. `load-orientations` and Tracking-Gate prose are opt-in/upgradeable,
  not day-one.
- **Bootstrap home → `ns init`**, a thin repo-level composing orchestrator.
- **AGENTS.md write → managed `BEGIN`/`END` block** (areg-style `ns:objectives:*` markers,
  idempotent/upgradeable/removable) + the `CLAUDE.md → @AGENTS.md` import. Not copy-paste.
- **Pi slash extension → internal/additive.** `ns objective` CLI + skills is the single
  portable customer substrate on all three harnesses.
- **Mandatory harness bar → all three** (Claude Code + Codex + Pi) verified end-to-end.
  *(Superseded 2026-07-05 for the first shipped slice — see below; the all-three bar
  remains the eventual target.)*

Resolved 2026-07-05 in a happy-path charting session with the owner (full record:
`updates/20260705T185714Z-happy-path-pi-install-decisions.md`):

- **Delivery model → Pi-style extension install.** The published `@nseng-ai/ns` core is
  **bare** (no capabilities); `@nseng-ai/objectives` publishes standalone and customers
  add it with a new `ns install <source>` surface mimicking `pi install` / `pi remove` /
  `pi update`. Packaging supersession recorded in `checkout-free-sdl-distribution`;
  the acquisition UX (`ns install`/`remove`/`update`) is designed and owned here.
- **The happy path is three commands**, and it is the first thing shipped:
  `npm install -g @nseng-ai/ns` → `ns install @nseng-ai/objectives` → `ns init` (in the
  customer repo). `ns install` is user-level settings only; repo activation stays in
  `ns init`. The path must never touch slot/flow/brmem/Graphite.
- **First-slice harness bar → Claude Code only**, explicitly superseding the 2026-07-01
  all-three bar for this slice; Codex and Pi verification follow after the Claude Code
  path ships.
- **Ship bar → fully live.** Both packages actually published to npm, the docs site
  publicly deployed (Vercel gate removed, nseng.ai), and a stranger able to follow Get
  Started end-to-end with zero improvisation.

Derived design (first build slice, see the update for full rationale): skill delivery
depends on `skill-management-subsystem`'s copy-into-harness-roots slice (not areg's symlink
model); `ns init` lives in a new `@nseng-ai/ns-init` capability package (amended
2026-07-05 from the grilling session's `@nseng-ai/init`: the ns-attached name says this is
the ns product bootstrapping itself, not a generic peer capability; the package is
`private: true` permanently and ships only folded into the `@nseng-ai/ns` bundle) reusing
`@nseng-ai/foundation/managed-region`; `--harness` is explicit/required (no sniffed default); git
posture is verify-and-write, never commit; the skill step is a faked `SkillMaterializer`
gateway until the bundle lands.

## Open Questions

Reopened 2026-07-05 by the Pi-style extension-install decision:

- **`ns install` surface design** (with the `ns-cli-design` skill): accepted source
  forms for v1 (npm name only, or also local path/git), where installed-extension
  settings live (global/XDG vs `-l` local vs `ns.toml`) and their schema, `ns update` v1
  scope (self, extensions, both, or deferred), and naming conformance with kernel CLI
  conventions. Runtime loader-side resolution is owned by
  `checkout-free-sdl-distribution`.
- **Where objective skills ship in the extension model**: inside `@nseng-ai/objectives`
  itself, or still via the `skill-management-subsystem` `ns skills` bundle path? This
  decides how much of the planned `ns skills install` slice survives and what the
  `SkillMaterializer` real impl binds to.
- **Where `ns init` lives**: in the bare core (must work with zero extensions installed)
  or contributed by the objectives extension. The `@nseng-ai/ns-init` package scaffold
  described above predates the bare-core split and may need re-homing.
