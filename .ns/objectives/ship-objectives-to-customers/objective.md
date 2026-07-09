---
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Consumed as a hard dependency; checkout-free npm distribution of `ns` must land before objectives ship externally.
  - objective: ns-skills-steelthread
    annotation: Consumed for skill delivery; customer onboarding requires objective skills provisioned into Claude Code, Codex, and Pi harness roots via its `ns skills` surface.
  - objective: cross-harness-parity
    annotation: Consumes its reachability contract (shared CLI + skill, Pi additive); onboarding must reach all three harnesses through that doctrine.
  - objective: eve-parity-docs-site
    annotation: Consumes the docs-site shell it owns; customer onboarding needs publishable installation, quickstart, and concept docs on that substrate.
  - objective: skill-management-subsystem
    annotation: Downstream consumer of the reusable skill-management subsystem; customer Objectives rely on its `ns skills`/harness-artifact provisioning surface for skill delivery into Claude Code, Codex, and Pi.
  - objective: extension-descriptor-contract
    annotation: Consumes its landed descriptor contract and managed `ns install`/acquisition machinery; the `ns extension install`/`uninstall`/`update` customer acquisition surface designed here (references/README-draft.md) extends that slice to npm sources and admin verbs.
---

# Ship Objectives to Customers

## Thesis

The Objective capability is the first SDL feature we ship to external customers. Today it is only usable inside this repo checkout: it is delivered as the `ns objective` CLI plus a family of skills plus a Pi extension, all run from source, and the accepted distribution model for every SDL CLI (including `ns` itself) is a run-from-source shim that requires a repo checkout and `ts/node_modules`.

Shipping Objectives externally means a customer with no SDL checkout and no dev toolchain can: install the `ns` CLI from npm, get the objective skills into whichever harness they use (Claude Code, Codex, or Pi), bootstrap their own repo so their agents actually reach for objectives, and follow real documentation — with no standalone objective binary.

**Naming (ADR 0026 `rename-ji-to-ns`, amended by ADR 0028):** the shipped customer surface is the `ns` CLI, and the core cutover has landed — the repo's binary is now `ns`, consumer dirs are `.ns/` (`.ns/objectives/`, `.ns/extensions/`), config is `ns.toml`. The workspace package scope is bare `@nseng-ai/*` (ADR 0028 chose bare `@nseng-ai/*`, superseding ADR 0026's interim `@ns/*` workspace-scope plan), so the packages this Objective touches are `@nseng-ai/kernel` (`ts/packages/kernel`), `@nseng-ai/objectives` (`ts/packages/capabilities/objectives`), and `@nseng-ai/foundation` (`ts/packages/infra/foundation`, with a `./managed-region` export). The published customer CLI target is `@nseng-ai/ns` (`ts/packages/hosts/ns-cli`). All new surface this Objective builds stays ns-named — `ns init`, `ns skills`, `ns objective …`, `ns:objectives:*` block markers, the `@nseng-ai/ns-init` package. The dev/repo bin still runs from source (`ts/packages/kernel/package.json` bin → `./src/cli/index.ts`), but run-from-source is no longer the only path: `checkout-free-sdl-distribution` (closed 2026-07-06) folded kernel into a bundled `@nseng-ai/ns` package, and the full public `@nseng-ai/*` set — including `@nseng-ai/ns` and `@nseng-ai/objectives` — is now published to npm at `0.1.1`, with a registry-backed checkout-free smoke (`npx @nseng-ai/ns@0.1.1 objective list` run from a foreign repo with no ns checkout) passing (see the dependency status below).

This Objective owns the end-to-end customer onboarding thread. Treat it as the parent/umbrella Objective for the customer Objective shipment: its formal Objective Edges identify subobjectives whose delivered scope is consumed here. The sequencing order is:

1. `checkout-free-sdl-distribution` — landed and closed (2026-07-06): `@nseng-ai/ns` and `@nseng-ai/objectives` are published to npm at `0.1.1` and a checkout-free `npx @nseng-ai/ns@0.1.1 objective list` smoke passed, so an installable `ns` now exists.
2. `ns-skills-steelthread` — landed and closed: a first-party `ns skills` list/path/install surface (in `@nseng-ai/harness-artifacts`) now provisions the objective skill into harness roots. The broader `skill-management-subsystem` umbrella remains open for the rest of skill provisioning.
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
- Skill bundling and install are delivered by the first-party `ns skills` surface (from the closed `ns-skills-steelthread`, implemented in `@nseng-ai/harness-artifacts`) and consumed here, not rebuilt: `ns init`'s `RealSkillMaterializer` provisions the objective skill through `provisionFirstPartySkill`. *(The 2026-07-05 open question about shipping skills inside `@nseng-ai/objectives` resolved toward this first-party `ns skills` provisioning path.)*
- `ns objective` is effectively zero-config for a customer — trunk is auto-detected and `objective list` is explicitly Graphite-free — so portability is expected, though not yet verified end-to-end outside this checkout.
- `AGENTS.md` is the portable cross-harness instruction carrier: Codex and Pi read it natively, and Claude Code reaches it via the `CLAUDE.md → @AGENTS.md` import.

Risks:

- The checkout-free npm bundle was the long pole; its owner (`checkout-free-sdl-distribution`) closed 2026-07-06. The full public `@nseng-ai/*` set (19 packages) is published and registry-verified at `0.1.1`, `@nseng-ai/ns@0.1.1` exposes `bin.ns` and the expected kernel subpath exports, and a registry-backed checkout-free smoke (`npx @nseng-ai/ns@0.1.1 objective list` from a foreign repo with no ns checkout) passed. This long-pole risk is retired.
- Objective may carry hidden checkout / `ts/node_modules` assumptions: the CLI loads the objective capability and hidden `exec` surface through kernel extension discovery. The registry-backed `npx @nseng-ai/ns@0.1.1 objective list` smoke confirms first-party Objective discovery works from a published artifact in a foreign repo with no checkout. What remains unverified end-to-end is the customer skills-provisioning and `ns init` activation path in a throwaway repo (the Claude-Code verification row).
- Writing into a customer's `AGENTS.md` risks clobbering their content; needs a safe managed-block design. Mitigable.
- Codex cannot make explicit-only skills zero-ambient, so objective skills always cost context on Codex. Acceptable, but must be documented.
- Coordinating across three in-flight dependency Objectives risks sequencing stalls; mitigate by treating them as dependencies with explicit interface expectations rather than blocking work.
- The bare-core reaffirmation (2026-07-09) partially reopens packaging risk: the registry-verified `0.1.1` shape bundles objectives, so the checkout-free smoke evidence does not cover the target shape. The unbundling slice must republish and re-verify through the `ns extension install npm:@nseng-ai/objectives` path before the docs/verification rows can complete.

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

Resolved 2026-07-09 in a README-driven design session with the owner (design artifact:
`references/README-draft.md`; full record:
`updates/20260709T165911Z-extension-acquisition-surface-designed.md`):

- **Bare core reaffirmed.** The published `@nseng-ai/ns` ships with no extensions
  bundled, superseding the batteries-included `0.1.1` shape; an unbundling/republish
  slice is required before customer launch.
- **Acquisition verbs live under the `ns extension` group** (`install`, `uninstall`,
  `update`, `list`, plus existing `point`/`points`). Top-level `ns install` is retired;
  top-level `ns update` narrows to reserved self-update.
- **Explicit `npm:` source-spec grammar** (Pi parity; no bare npm names): the CLI
  argument is verbatim the `ns.toml` `extensions = [...]` entry. Versioned = pinned,
  unversioned = floating. Happy path amends to
  `npm install -g @nseng-ai/ns` → `ns extension install npm:@nseng-ai/objectives` →
  `ns init`.
- **Removal verb is `uninstall`** (mirrors `install`; no `remove` alias);
  **`ns extension update` requires exactly one source target** (no `--all` in v1).
- **Repo-level `ns.toml` is the only settings home in v1**, amending the 2026-07-05
  "user-level settings only" note; a user scope may layer on later.
- **Generic `ns init` direction settled**: `init` stays a core built-in for its
  extension-agnostic duties; objectives-specific behavior baked into it was a mistake.
  Extensions contribute activation content through a descriptor activation surface that
  needs its own design slice.

Resolved 2026-07-09 in a follow-up activation-surface design session with the owner
(design artifact: `references/init-activation-design.md`; full record:
`updates/20260709T183829Z-init-activation-surface-designed.md`):

- **Trunk detection is generic git posture**, kept in core `ns init` (reworded away from
  its objectives-specific justification).
- **Pointer-stanza architecture.** `AGENTS.md` gets one minimal permanent fenced stanza
  pointing at `.ns/instructions.md`; all instruction content lives in that **committed,
  tool-owned, wholly regenerated** file. Extension install/uninstall/update never touch
  `AGENTS.md` again.
- **Descriptor `activation` field, plain data only** (no activation hook): optional
  `instructions` (one markdown section) + `consumerDirs` (created with `.gitkeep`, never
  deleted by ns). Core does all writing; new optional field on the promoted descriptor
  contract, coordinated per `extension-descriptor-contract` policy at implementation.
- **Orientations ship day-one** in the objectives extension's contributed section
  (supersedes the 2026-07-01 lean-block exclusion of `load-orientations`, whose cost
  rationale the pointer architecture removes).
- **No migration machinery**: the old `ns:objectives:*` fat block exists only in
  `ns-init` source/tests (no real repo carries it); migration is in-place code/test
  changes in the implementation slice.

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

Reopened 2026-07-05 by the Pi-style extension-install decision; resolved 2026-07-09 in
the README-driven design session (see Resolved Decisions above):

- **`ns install` surface design** — RESOLVED: acquisition verbs live under the
  `ns extension` group with the explicit `npm:`/local-path source-spec grammar; settings
  home is repo-level `ns.toml` only; `ns extension update` is single-target;
  self-update stays reserved at top-level `ns update`. Canonical design:
  `references/README-draft.md`. Implementation (with `ns-cli-design` discipline at
  build time) is roadmap work; the already-landed top-level local-package
  `ns install <source>` slice (`ts/packages/kernel/src/extensions/install-command.ts`)
  is substrate/migration input, not the final customer surface.
- **Where objective skills ship** — RESOLVED: the objective skill is provisioned through
  the first-party `ns skills` list/path/install surface (`@nseng-ai/harness-artifacts`),
  and `ns init`'s `RealSkillMaterializer` binds to `provisionFirstPartySkill`. End-to-end
  provisioning from the published tarball into a customer repo is still to be verified
  (Claude-Code verification row).
- **Where `ns init` lives** — RESOLVED as a split: core owns a generic `init`
  orchestrator (git posture, harness persistence, pointer-stanza + `.ns/instructions.md`
  mechanics, artifact provisioning); extensions own their activation content, contributed
  through the descriptor `activation` field. The activation surface design is complete
  (2026-07-09, `references/init-activation-design.md`); the remaining work is the
  implementation slice de-objectives-ifying `@nseng-ai/ns-init` before the bare-core
  republish.
