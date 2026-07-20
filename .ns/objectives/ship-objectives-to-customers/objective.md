---
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Consumed as a hard dependency; checkout-free npm distribution of `ns` must land before objectives ship externally.
  - objective: ns-skills-steelthread
    annotation: Consumed for skill delivery; customer onboarding requires objective skills provisioned into Claude Code, Codex, and Pi harness roots via its `ns skills` surface.
  - objective: cross-harness-parity
    annotation: Consumes its reachability contract (shared CLI + skill, Pi additive); onboarding must reach all three harnesses through that doctrine.
  - objective: eve-parity-docs-site
    annotation: Historical launch-substrate relationship; first customer launch now uses package READMEs while the docs-site Objective is intentionally deferred.
  - objective: skill-management-subsystem
    annotation: Downstream consumer of the reusable skill-management subsystem; customer Objectives rely on its `ns skills`/harness-artifact provisioning surface for skill delivery into Claude Code, Codex, and Pi.
  - objective: extension-descriptor-contract
    annotation: Consumes its landed descriptor contract and managed `ns install`/acquisition machinery; the `ns extension install`/`uninstall`/`update` customer acquisition surface designed here (references/README-draft.md) extends that slice to npm sources and admin verbs.
  - objective: objectives-extension-customer-surface
    annotation: Coordinates this Subobjective, which owns completion of the v1 Objectives extension command surface before release.
  - objective: objectives-bare-core-release
    annotation: Coordinates this Subobjective, which owns publication and checkout-free verification of the bare-core Objectives acquisition path.
  - objective: objectives-claude-onboarding-steelthread
    annotation: Coordinates this Subobjective, which owns the first real customer onboarding journey through Claude Code and synthesizes defects across the shipped seams.
---

# Ship Objectives to Customers

## Thesis

The Objective capability is the first SDL feature we ship to external customers. At this Objective's inception it was only usable inside this repo checkout: delivered as the `ns objective` CLI plus a family of skills plus a Pi extension, all run from source, with the accepted distribution model for every SDL CLI (including `ns` itself) being a run-from-source shim that required a repo checkout and `ts/node_modules`.

Shipping Objectives externally means a customer with no SDL checkout and no dev toolchain can: install the `ns` CLI from npm, get the objective skills into whichever harness they use (Claude Code, Codex, or Pi), bootstrap their own repo so their agents actually reach for objectives, and follow real documentation — with no standalone objective binary.

**Naming (ADR 0026 `rename-ji-to-ns`, amended by ADR 0028):** the shipped customer surface is the `ns` CLI, and the core cutover has landed — the repo's binary is now `ns`, consumer dirs live under `.ns/` (`.ns/objectives/`, plus managed extension storage under `.ns/managed-extensions/`), config is `ns.toml`. The workspace package scope is bare `@nseng-ai/*` (ADR 0028 chose bare `@nseng-ai/*`, superseding ADR 0026's interim `@ns/*` workspace-scope plan), so the packages this Objective touches are `@nseng-ai/kernel` (`ts/packages/kernel`), `@nseng-ai/objectives` (`ts/packages/capabilities/objectives`), and `@nseng-ai/foundation` (`ts/packages/infra/foundation`, with a `./managed-region` export). The published customer CLI target is `@nseng-ai/ns` (`ts/packages/hosts/ns`; relocated from `ts/packages/hosts/ns-cli`, with CLI text generation and composition since moved into this host — the kernel package no longer carries a `bin`). All new surface this Objective builds stays ns-named — `ns init`, `ns skills`, `ns extension …`, `ns objective …`, the `<!-- ns:begin -->` pointer stanza, the `@nseng-ai/ns-init` package. Run-from-source is no longer the only path: `checkout-free-sdl-distribution` (closed 2026-07-06) delivered the first bundled `@nseng-ai/ns` package, and `objectives-bare-core-release` subsequently published and verified the coordinated bare-core `0.1.3` set. In a vanilla foreign repository, registry-served `@nseng-ai/ns@0.1.3` initially lacked `ns objective`; after initialization and `npm:@nseng-ai/objectives@0.1.3` acquisition, all ten Objective skills provisioned into Claude Code and `ns objective list` succeeded without this checkout or `ts/node_modules`.

This Objective owns the end-to-end customer onboarding thread. Treat it as the parent/umbrella Objective for the customer Objective shipment: its formal Objective Edges identify subobjectives whose delivered scope is consumed here. The sequencing order is:

1. `checkout-free-sdl-distribution` — landed and closed (2026-07-06): `@nseng-ai/ns` and `@nseng-ai/objectives` were published to npm (initially `0.1.1`) and a checkout-free `npx @nseng-ai/ns@0.1.1 objective list` smoke passed, so an installable `ns` now exists.
2. `ns-skills-steelthread` — landed and closed: a first-party `ns skills` list/path/install surface (in `@nseng-ai/harness-artifacts`) now provisions the objective skill into harness roots. The broader `skill-management-subsystem` umbrella remains open for the rest of skill provisioning.
3. `cross-harness-parity` — closed 2026-07-11, intentionally concluded rather than completed: it delivered the parity doctrine and reachability contract (deterministic logic in a shared CLI, a skill driving it, Pi additive); its remaining verification goals fold into the end-to-end docs/onboarding effort this Objective drives.
4. `objectives-bare-core-release` — closed 2026-07-14 after publishing coordinated `0.1.3`, verifying registry tarballs, and passing the foreign-repository bare-core acquisition smoke.
5. `eve-parity-docs-site` — intentionally deferred 2026-07-14; it no longer gates launch. Canonical package READMEs are the customer documentation surface for the first shipment.

This ordering is guidance in parent prose, not an edge taxonomy: Objective Edges remain kind-less, and this record carries no `blocked` sentence while no subobjective actively blocks the next useful parent slice.

## Scope

- **npm distribution of the `ns` CLI (the long pole).** Ship a checkout-free `ns` a customer can install from npm (no `ts/node_modules` precondition) and run `ns objective …` against their own repo. The original decided design kept `@nseng-ai/kernel` `"private": true` and folded its runtime surface — plus `@nseng-ai/objectives` and its hidden `exec` surface — into the published `@nseng-ai/ns` bundle via esbuild rather than publishing kernel standalone; the landed shape still bundles the host, but `@nseng-ai/kernel` now also publishes standalone (first registry version `0.1.2`, 2026-07-07), superseding the permanently-private posture. This distribution work was deferred capability-by-capability "to the umbrella Objective," which closed (`port-asdl-toolkit-to-typescript`) without doing it, on the recorded rationale that no real external consumer existed yet. This Objective is that consumer. **Owned by the dedicated `checkout-free-sdl-distribution` Objective** (split decided 2026-07-01; closed 2026-07-06); consumed here as a hard dependency, since checkout-free `ns` benefits every capability, not just objectives.
- **Skill delivery to the customer's harness.** Objective skills bundled into the npm package and installable into the correct per-harness roots (`.claude/skills/` for Claude Code; `.agents/skills/` for Codex and Pi). Delivery is consumed from `@nseng-ai/harness-artifacts` (`skill-management-subsystem`), not rebuilt: the `ns skills` list/path/install surface plus descriptor-declared bundled-artifact provisioning during `ns init`/`ns extension` activation. Shipping CLI and skills together also resolves the CLI↔skill bidirectional dependency.
- **Customer-repo bootstrap / activation.** A first-party path that materializes skills for the harnesses present in a repo, activates agent instructions through the pointer-stanza architecture (one minimal permanent `<!-- ns:begin -->` stanza in `AGENTS.md` pointing at the committed, tool-owned, wholly regenerated `.ns/instructions.md`), creates extension-declared consumer dirs such as `.ns/objectives/`, and verifies git posture. Activation has two independent requirements: the capability materialized where each harness looks, and the agents instructed to use it.
- **Customer acquisition surface.** The `ns extension` verb group (`install`, `uninstall`, `update`, `list`) with the explicit `npm:`/local source-spec grammar shared verbatim with `ns.toml` — designed here (`references/README-draft.md`) over `extension-descriptor-contract`'s landed machinery.
- **Onboarding documentation content.** Canonical install, activation, and Objective-lifecycle guidance in the `@nseng-ai/ns` and `@nseng-ai/objectives` package READMEs. The first customer launch uses these READMEs; the public docs-site expansion is intentionally deferred and no longer gates this Objective.
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
- A customer can follow the canonical package READMEs to create → advance → update → close their first objective without improvisation.
- Onboarding is verified end-to-end in a throwaway non-SDL repo for **all three of Claude Code, Codex, and Pi** (decided 2026-07-01; stronger than the prior "Claude Code and Codex, Pi if feasible" bar).
- Explicit decisions are recorded for the Resolved Decisions below.

## Assumptions and Risks

Assumptions:

- npm is the customer install vector for the `ns` CLI. (User-confirmed.)
- The supported surface is the `ns` CLI, not a standalone objective binary. (User-confirmed.)
- Skill/artifact delivery is consumed from `@nseng-ai/harness-artifacts`, not rebuilt: the first-party `ns skills` list/path/install surface (from the closed `ns-skills-steelthread`) remains for first-party skills, and `ns init`/`ns extension` activation provisions extension-declared bundled artifacts through the descriptor activation surface (`prepareDeclaredArtifactActivation`/`applyPreparedDeclaredArtifactActivation` behind ns-init's `ArtifactActivationGateway`). This replaced the interim `SkillMaterializer` seam, which no longer exists in `@nseng-ai/ns-init`. *(The 2026-07-05 open question about shipping skills inside `@nseng-ai/objectives` resolved toward first-party provisioning; the objectives extension now declares its activation contribution — instructions section plus `consumerDirs: [".ns/objectives"]` — in its descriptor.)*
- `ns objective` is effectively zero-config for a customer — trunk is auto-detected and `objective list` is explicitly Graphite-free. The `0.1.3` foreign-repository acquisition smoke verified this CLI portability outside the checkout; the full agent-driven lifecycle remains for onboarding verification.
- `AGENTS.md` is the portable cross-harness instruction carrier: Codex and Pi read it natively, and Claude Code reaches it via the `CLAUDE.md → @AGENTS.md` import.

Risks:

- The checkout-free npm bundle was the long pole; its owner (`checkout-free-sdl-distribution`) closed 2026-07-06. The full public `@nseng-ai/*` set is published, registry latest `0.1.2` (2026-07-07), `@nseng-ai/ns` exposes `bin.ns` and the expected kernel subpath exports, and a registry-backed checkout-free smoke (`npx @nseng-ai/ns@0.1.1 objective list` from a foreign repo with no ns checkout) passed. This long-pole risk is retired.
- De-risked for the CLI acquisition path: the registry-backed `0.1.3` smoke proved bare core, `ns init`, `ns extension install npm:@nseng-ai/objectives@0.1.3`, all ten Claude Code skill artifacts, and `ns objective list` in a foreign repository without checkout dependencies. What remains unverified is the fresh Claude Code agent following published docs through create → next → update → close without improvisation.
- De-risked: coordinated `0.1.3` replaced the stale batteries-included `0.1.2` registry shape. Strict tarball verification confirmed bare core and standalone Objectives artifacts before the acquisition smoke passed.
- Canonical package README guidance now exists in source for bare-core setup and the Objective lifecycle, but it postdates the `0.1.3` publication and is not yet registry-served evidence. A future package publication must expose it before the fresh-session customer journey can count as README-verbatim launch verification.
- Writing into a customer's `AGENTS.md` risks clobbering their content; mitigated by the landed pointer-stanza managed-region design (one minimal permanent stanza; all regenerated content lives in `.ns/instructions.md`).
- Codex cannot make explicit-only skills zero-ambient, so objective skills always cost context on Codex. Acceptable, but must be documented.
- Dependency-Objective coordination risk has largely retired: `checkout-free-sdl-distribution`, `ns-skills-steelthread`, `extension-descriptor-contract`, and `cross-harness-parity` are closed; `eve-parity-docs-site` is intentionally deferred and no longer gates launch. The remaining open dependency is the broader `skill-management-subsystem` umbrella.

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
- **Ship bar → fully live.** Both packages actually published to npm and a stranger able
  to follow the canonical package READMEs end-to-end with zero improvisation. *(Amended
  2026-07-14: the docs-site deployment is intentionally deferred and no longer part of
  the first launch bar.)*

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

- **`ns install` surface design** — RESOLVED and implemented: acquisition verbs live
  under the `ns extension` group with the explicit `npm:`/local-path source-spec grammar;
  settings home is repo-level `ns.toml` only; `ns extension update` is single-target;
  self-update stays reserved at top-level `ns update` (the retired top-level
  extension-update flags are rejected with a usage error). Canonical design:
  `references/README-draft.md`. Install, identity-matched uninstall, single-target update,
  and deterministic read-only list have all landed.
- **Where objective skills ship** — RESOLVED: the objectives extension declares its
  activation contribution (instructions section + `.ns/objectives` consumer dir) in its
  descriptor, and bundled artifacts are provisioned into selected harness roots by the
  generic activation machinery consumed from `@nseng-ai/harness-artifacts`; the
  first-party `ns skills` surface remains for checkout-side first-party skills.
  Published `0.1.3` provisioning is now verified for Claude Code: all ten declared
  Objective skills landed under `.claude/skills/` in a foreign repository. Codex and Pi
  breadth remains parked after the first shipped slice.
- **Where `ns init` lives** — RESOLVED and implemented as a split: core owns a generic
  `init` orchestrator (git posture, harness persistence, pointer-stanza +
  `.ns/instructions.md` mechanics, declared-artifact provisioning); extensions own their
  activation content, contributed through the descriptor `activation` field. The
  de-objectives-ification of `@nseng-ai/ns-init` has landed; the bare-core republish it
  gated remains roadmap work.

## Closure

Closed 2026-07-20 as deferred (umbrella synthesis; launch intentionally paused).

Outcome: the shipping substrate is built; the launch itself is deferred. All three coordinated Subobjectives are closed: `objectives-extension-customer-surface` (v1 Objectives extension command/inspection surface), `objectives-bare-core-release` (published bare-core and standalone Objectives artifacts with checkout-free verification), and `objectives-claude-onboarding-steelthread` (closed 2026-07-20 as deferred with partial evidence — see its closure for the restart point). Consumed dependencies all landed and closed: checkout-free npm distribution, `ns skills` provisioning, cross-harness reachability doctrine, and the extension descriptor contract. This umbrella also delivered the customer-facing `ns extension install|uninstall|update` lifecycle design and the core/extension `ns init` split.

Cross-child lessons worth carrying:

- **README-driven design held up as the launch substrate** after the docs-site was deferred: package READMEs proved sufficient as the canonical install/quickstart surface, and defects found by verification were README defects to fix, not verifier improvisation to tolerate.
- **Publication is the recurring bottleneck**, not implementation: multiple children ended gated on "republish a qualified version," and the accepted decision to skip a republish is exactly what left the onboarding journey unfinished.
- **Foreign-repo verification catches what checkout-based testing cannot** (provisioning roots, pointer stanzas, ambient-credential false passes); keep that bar for any future launch attempt.

Restart pointer: resuming the customer launch means reopening the onboarding journey from its record's restart state — publish a newly qualified package version, run the documented Claude Code journey end to end in an isolated foreign repo, and synthesize defects across seams. The bare-core republish residue noted in this record's design-decision log goes first.

Closure decision made in the 2026-07-20 open-objective portfolio review (make the deferred launch state honest rather than carrying a dormant umbrella as open WIP).
