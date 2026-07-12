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

The Objective capability is the first SDL feature we ship to external customers. At this Objective's inception it was only usable inside this repo checkout: delivered as the `ns objective` CLI plus a family of skills plus a Pi extension, all run from source, with the accepted distribution model for every SDL CLI (including `ns` itself) being a run-from-source shim that required a repo checkout and `ts/node_modules`.

Shipping Objectives externally means a customer with no SDL checkout and no dev toolchain can: install the `ns` CLI from npm, get the objective skills into whichever harness they use (Claude Code, Codex, or Pi), bootstrap their own repo so their agents actually reach for objectives, and follow real documentation — with no standalone objective binary.

**Naming (ADR 0026 `rename-ji-to-ns`, amended by ADR 0028):** the shipped customer surface is the `ns` CLI, and the core cutover has landed — the repo's binary is now `ns`, consumer dirs live under `.ns/` (`.ns/objectives/`, plus managed extension storage under `.ns/managed-extensions/`), config is `ns.toml`. The workspace package scope is bare `@nseng-ai/*` (ADR 0028 chose bare `@nseng-ai/*`, superseding ADR 0026's interim `@ns/*` workspace-scope plan), so the packages this Objective touches are `@nseng-ai/kernel` (`ts/packages/kernel`), `@nseng-ai/objectives` (`ts/packages/capabilities/objectives`), and `@nseng-ai/foundation` (`ts/packages/infra/foundation`, with a `./managed-region` export). The published customer CLI target is `@nseng-ai/ns` (`ts/packages/hosts/ns`; relocated from `ts/packages/hosts/ns-cli`, with CLI text generation and composition since moved into this host — the kernel package no longer carries a `bin`). All new surface this Objective builds stays ns-named — `ns init`, `ns skills`, `ns extension …`, `ns objective …`, the `<!-- ns:begin -->` pointer stanza, the `@nseng-ai/ns-init` package. Run-from-source is no longer the only path: `checkout-free-sdl-distribution` (closed 2026-07-06) delivered the bundled `@nseng-ai/ns` package, and the full public `@nseng-ai/*` set — including `@nseng-ai/ns`, `@nseng-ai/objectives`, `@nseng-ai/harness-artifacts`, and (since `0.1.2`) a standalone `@nseng-ai/kernel` — is published to npm, registry latest `0.1.2` (2026-07-07). The registry-backed checkout-free smoke (`npx @nseng-ai/ns objective list` run from a foreign repo with no ns checkout) passed against the batteries-included shape; the published `0.1.2` predates the same-day bare-core unbundle commit (see Risks).

This Objective owns the end-to-end customer onboarding thread. Treat it as the parent/umbrella Objective for the customer Objective shipment: its formal Objective Edges identify subobjectives whose delivered scope is consumed here. The sequencing order is:

1. `checkout-free-sdl-distribution` — landed and closed (2026-07-06): `@nseng-ai/ns` and `@nseng-ai/objectives` were published to npm (initially `0.1.1`) and a checkout-free `npx @nseng-ai/ns@0.1.1 objective list` smoke passed, so an installable `ns` now exists.
2. `ns-skills-steelthread` — landed and closed: a first-party `ns skills` list/path/install surface (in `@nseng-ai/harness-artifacts`) now provisions the objective skill into harness roots. The broader `skill-management-subsystem` umbrella remains open for the rest of skill provisioning.
3. `cross-harness-parity` — closed 2026-07-11, intentionally concluded rather than completed: it delivered the parity doctrine and reachability contract (deterministic logic in a shared CLI, a skill driving it, Pi additive); its remaining verification goals fold into the end-to-end docs/onboarding effort this Objective drives.
4. `eve-parity-docs-site` — final launch substrate; publishable docs can progress in parallel, but final customer docs should reflect the stabilized install/init/skill surfaces.

This ordering is guidance in parent prose, not an edge taxonomy: Objective Edges remain kind-less, and this record carries no `blocked` sentence while no subobjective actively blocks the next useful parent slice.

## Scope

- **npm distribution of the `ns` CLI (the long pole).** Ship a checkout-free `ns` a customer can install from npm (no `ts/node_modules` precondition) and run `ns objective …` against their own repo. The original decided design kept `@nseng-ai/kernel` `"private": true` and folded its runtime surface — plus `@nseng-ai/objectives` and its hidden `exec` surface — into the published `@nseng-ai/ns` bundle via esbuild rather than publishing kernel standalone; the landed shape still bundles the host, but `@nseng-ai/kernel` now also publishes standalone (first registry version `0.1.2`, 2026-07-07), superseding the permanently-private posture. This distribution work was deferred capability-by-capability "to the umbrella Objective," which closed (`port-asdl-toolkit-to-typescript`) without doing it, on the recorded rationale that no real external consumer existed yet. This Objective is that consumer. **Owned by the dedicated `checkout-free-sdl-distribution` Objective** (split decided 2026-07-01; closed 2026-07-06); consumed here as a hard dependency, since checkout-free `ns` benefits every capability, not just objectives.
- **Skill delivery to the customer's harness.** Objective skills bundled into the npm package and installable into the correct per-harness roots (`.claude/skills/` for Claude Code; `.agents/skills/` for Codex and Pi). Delivery is consumed from `@nseng-ai/harness-artifacts` (`skill-management-subsystem`), not rebuilt: the `ns skills` list/path/install surface plus descriptor-declared bundled-artifact provisioning during `ns init`/`ns extension` activation. Shipping CLI and skills together also resolves the CLI↔skill bidirectional dependency.
- **Customer-repo bootstrap / activation.** A first-party path that materializes skills for the harnesses present in a repo, activates agent instructions through the pointer-stanza architecture (one minimal permanent `<!-- ns:begin -->` stanza in `AGENTS.md` pointing at the committed, tool-owned, wholly regenerated `.ns/instructions.md`), creates extension-declared consumer dirs such as `.ns/objectives/`, and verifies git posture. Activation has two independent requirements: the capability materialized where each harness looks, and the agents instructed to use it.
- **Customer acquisition surface.** The `ns extension` verb group (`install`, `uninstall`, `update`, `list`) with the explicit `npm:`/local source-spec grammar shared verbatim with `ns.toml` — designed here (`references/README-draft.md`) over `extension-descriptor-contract`'s landed machinery.
- **Onboarding documentation content.** Real (non-placeholder) concept and quickstart content for objectives in `docs-site` (installation, quickstart, concepts/objectives, tools/objective). The docs-site shell and stack are owned by `eve-parity-docs-site`; this Objective owns the objective-specific content and its publication gating.
- **Harness coverage.** Claude Code, Codex, and Pi are all first-class customer targets. Cross-harness reachability (deterministic logic in a shared CLI, a skill driving it, the Pi extension purely additive) was doctrine delivered by the now-closed `cross-harness-parity`; this Objective consumes it and adds the onboarding coverage for all three.

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
- A first-party bootstrap step activates objectives in a customer repo: a minimal portable `AGENTS.md` instruction pointer (idempotent, upgradeable, removable), `.ns/objectives/` present and committed, and git posture verified.
- A customer can follow real installation and quickstart docs to create → advance → update → close their first objective, with no placeholder pages, and the docs site is publishable.
- Onboarding is verified end-to-end in a throwaway non-SDL repo for **all three of Claude Code, Codex, and Pi** (decided 2026-07-01; stronger than the prior "Claude Code and Codex, Pi if feasible" bar).
- Explicit decisions are recorded for the Resolved Decisions below.

## Assumptions and Risks

Assumptions:

- npm is the customer install vector for the `ns` CLI. (User-confirmed.)
- The supported surface is the `ns` CLI, not a standalone objective binary. (User-confirmed.)
- Skill/artifact delivery is consumed from `@nseng-ai/harness-artifacts`, not rebuilt: the first-party `ns skills` list/path/install surface (from the closed `ns-skills-steelthread`) remains for first-party skills, and `ns init`/`ns extension` activation provisions extension-declared bundled artifacts through the descriptor activation surface (`prepareDeclaredArtifactActivation`/`applyPreparedDeclaredArtifactActivation` behind ns-init's `ArtifactActivationGateway`). This replaced the interim `SkillMaterializer` seam, which no longer exists in `@nseng-ai/ns-init`. *(The 2026-07-05 open question about shipping skills inside `@nseng-ai/objectives` resolved toward first-party provisioning; the objectives extension now declares its activation contribution — instructions section plus `consumerDirs: [".ns/objectives"]` — in its descriptor.)*
- `ns objective` is effectively zero-config for a customer — trunk is auto-detected and `objective list` is explicitly Graphite-free — so portability is expected, though not yet verified end-to-end outside this checkout.
- `AGENTS.md` is the portable cross-harness instruction carrier: Codex and Pi read it natively, and Claude Code reaches it via the `CLAUDE.md → @AGENTS.md` import.

Risks:

- The checkout-free npm bundle was the long pole; its owner (`checkout-free-sdl-distribution`) closed 2026-07-06. The full public `@nseng-ai/*` set is published, registry latest `0.1.2` (2026-07-07), `@nseng-ai/ns` exposes `bin.ns` and the expected kernel subpath exports, and a registry-backed checkout-free smoke (`npx @nseng-ai/ns@0.1.1 objective list` from a foreign repo with no ns checkout) passed. This long-pole risk is retired.
- Objective may carry hidden checkout / `ts/node_modules` assumptions: the CLI loads the objective capability and hidden `exec` surface through kernel extension discovery. The registry-backed smoke confirmed first-party Objective discovery works from a published artifact in a foreign repo with no checkout — but only for the batteries-included shape. What remains unverified end-to-end is the acquisition-path flow (`ns extension install npm:@nseng-ai/objectives`) plus the `ns init` activation path in a throwaway repo (the Claude-Code verification row).
- The registry shape still bundles objectives: npm latest `0.1.2` (published 2026-07-07T19:18Z) predates the same-day commit that removed Objective commands from the default `@nseng-ai/ns` host. The source-side unbundle has landed (the host no longer depends on `@nseng-ai/objectives`, and the checkout-free smoke now asserts Objective commands are absent from default help); the remaining exposure is the bare-core republish and re-verification through the `ns extension install npm:@nseng-ai/objectives` path before the docs/verification rows can complete.
- Writing into a customer's `AGENTS.md` risks clobbering their content; mitigated by the landed pointer-stanza managed-region design (one minimal permanent stanza; all regenerated content lives in `.ns/instructions.md`).
- Codex cannot make explicit-only skills zero-ambient, so objective skills always cost context on Codex. Acceptable, but must be documented.
- Dependency-Objective coordination risk has largely retired: four of the six edge counterparts are closed (`checkout-free-sdl-distribution`, `ns-skills-steelthread`, `extension-descriptor-contract`, and `cross-harness-parity` — the last intentionally concluded, its residual verification folding into this Objective's docs/onboarding thread). The open dependencies are `eve-parity-docs-site` (docs un-gating still depends on the rest of the docs corpus it owns) and the `skill-management-subsystem` umbrella.

## Resolved Decisions

Resolved 2026-07-01 in a design grilling session (full record:
`updates/20260701T185244Z-grilling-decisions-and-distribution-split.md`).

- **npm distribution structure → SPLIT** into the dedicated `checkout-free-sdl-distribution`
  Objective; a hard dependency here, not this Objective's spine.
- **Instruction block → LEAN.** Day-one block teaches only that objectives exist, to run
  `ns objective list` before non-trivial work and read overlapping records, and to use the
  objective skills/CLI. `load-orientations` and Tracking-Gate prose are opt-in/upgradeable,
  not day-one. *(The fat-block delivery vehicle was later superseded by the 2026-07-09
  pointer-stanza architecture, which also reversed the `load-orientations` exclusion.)*
- **Bootstrap home → `ns init`**, a thin repo-level composing orchestrator.
- **AGENTS.md write → managed `BEGIN`/`END` block** + the `CLAUDE.md → @AGENTS.md` import.
  Not copy-paste. *(Superseded in form 2026-07-09: the managed region is now the minimal
  `<!-- ns:begin -->` pointer stanza; content lives in `.ns/instructions.md`.)*
- **Pi slash extension → internal/additive.** `ns objective` CLI + skills is the single
  portable customer substrate on all three harnesses.
- **Mandatory harness bar → all three** (Claude Code + Codex + Pi) verified end-to-end.
  *(Superseded 2026-07-05 for the first shipped slice — see below; the all-three bar
  remains the eventual target.)*

Resolved 2026-07-05 in a happy-path charting session with the owner (full record:
`updates/20260705T185714Z-happy-path-pi-install-decisions.md`):

- **Delivery model → Pi-style extension install.** The published `@nseng-ai/ns` core is
  **bare** (no capabilities); `@nseng-ai/objectives` publishes standalone and customers
  add it with a new install surface mimicking `pi install` / `pi remove` / `pi update`.
  Packaging supersession recorded in `checkout-free-sdl-distribution`; the acquisition UX
  is designed and owned here.
- **The happy path is three commands**, and it is the first thing shipped:
  `npm install -g @nseng-ai/ns` → install the objectives extension → `ns init` (in the
  customer repo). The path must never touch slot/flow/brmem/Graphite. *(The 2026-07-05
  "user-level settings only" note was amended 2026-07-09 to repo-level `ns.toml` only,
  and the install-before-init order was superseded 2026-07-10 — see below.)*
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
  bundled, superseding the batteries-included first-release shape; an
  unbundling/republish slice is required before customer launch.
- **Acquisition verbs live under the `ns extension` group** (`install`, `uninstall`,
  `update`, `list`, plus existing `point`/`points`). Top-level `ns install` is retired;
  top-level `ns update` narrows to reserved self-update.
- **Explicit `npm:` source-spec grammar** (Pi parity; no bare npm names): the CLI
  argument is verbatim the `ns.toml` `extensions = [...]` entry. Versioned = pinned,
  unversioned = floating. Happy path amends to
  `npm install -g @nseng-ai/ns` → `ns extension install npm:@nseng-ai/objectives` →
  `ns init` (order later superseded — see 2026-07-10).
- **Removal verb is `uninstall`** (mirrors `install`; no `remove` alias);
  **`ns extension update` requires exactly one source target** (no `--all` in v1).
- **Repo-level `ns.toml` is the only settings home in v1**, amending the 2026-07-05
  "user-level settings only" note; a user scope may layer on later.
- **Generic `ns init` direction settled**: `init` stays a core built-in for its
  extension-agnostic duties; objectives-specific behavior baked into it was a mistake.
  Extensions contribute activation content through a descriptor activation surface.

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
- **No migration machinery**: the old `ns:objectives:*` fat block existed only in
  `ns-init` source/tests (no real repo carried it); the migration landed as in-place
  code/test changes in the implementation slice.

Derived design (first build slice, see the update for full rationale): skill delivery
depends on `skill-management-subsystem`'s copy-into-harness-roots slice (not areg's symlink
model); `ns init` lives in the `@nseng-ai/ns-init` capability package (amended
2026-07-05 from the grilling session's `@nseng-ai/init`: the ns-attached name says this is
the ns product bootstrapping itself, not a generic peer capability; the package is
`private: true` permanently and ships only folded into the `@nseng-ai/ns` bundle) reusing
`@nseng-ai/foundation/managed-region`; `--harness` is explicit/required (no sniffed
default); git posture is verify-and-write, never commit. *(The interim faked
`SkillMaterializer` gateway from this slice was later removed in favor of the descriptor
activation surface.)*

Resolved 2026-07-10 for the first customer-complete install slice:

- **Initialization precedes installation.** `ns init`, not extension administration, owns
  project harness selection. `ns extension install` consumes persisted harnesses and
  fails before acquisition or durable writes when they are missing or invalid. This
  supersedes the prior install-before-init happy-path order.
- **Install is exact-spec idempotent and identity-safe.** Exact reruns ensure missing npm
  bytes and reconcile activation without refreshing an already-present floating package;
  a different spec for the same canonical npm package or local path is rejected rather
  than silently replacing the declaration.
- **Apply uses forward recovery.** Descriptor and activation preflight failures write no
  durable project state; a mid-apply failure preserves and reports completed duties so an
  exact rerun can converge.

## Open Questions

Reopened 2026-07-05 by the Pi-style extension-install decision; resolved 2026-07-09 in
the README-driven design session (see Resolved Decisions above):

- **`ns install` surface design** — RESOLVED and now largely implemented: acquisition
  verbs live under the `ns extension` group with the explicit `npm:`/local-path
  source-spec grammar; settings home is repo-level `ns.toml` only; `ns extension update`
  is single-target; self-update stays reserved at top-level `ns update` (the retired
  top-level extension-update flags are rejected with a usage error). Canonical design:
  `references/README-draft.md`. `ns extension install`, identity-matched `uninstall`,
  and single-target `update` have all landed with full activation reconciliation; the
  remaining verb is `ns extension list`.
- **Where objective skills ship** — RESOLVED: the objectives extension declares its
  activation contribution (instructions section + `.ns/objectives` consumer dir) in its
  descriptor, and bundled artifacts are provisioned into selected harness roots by the
  generic activation machinery consumed from `@nseng-ai/harness-artifacts`; the
  first-party `ns skills` surface remains for checkout-side first-party skills.
  End-to-end provisioning from the published tarball into a customer repo is still to be
  verified (Claude-Code verification row).
- **Where `ns init` lives** — RESOLVED and implemented as a split: core owns a generic
  `init` orchestrator (git posture, harness persistence, pointer-stanza +
  `.ns/instructions.md` mechanics, declared-artifact provisioning); extensions own their
  activation content, contributed through the descriptor `activation` field. The
  de-objectives-ification of `@nseng-ai/ns-init` has landed; the bare-core republish it
  gated remains roadmap work.
