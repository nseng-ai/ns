---
blocked: First external publish is gated on the checkout-free-sdl-distribution hard dependency landing — a customer cannot install `ji` from npm and run it checkout-free until it does.
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Consumed as a hard dependency; checkout-free npm distribution of `ji` must land before objectives ship externally.
  - objective: skill-management-subsystem
    annotation: Consumed for skill delivery; customer onboarding requires objective skills provisioned into Claude Code, Codex, and Pi harness roots via its `ji skills` surface.
  - objective: cross-harness-parity
    annotation: Consumes its reachability contract (shared CLI + skill, Pi additive); onboarding must reach all three harnesses through that doctrine.
  - objective: eve-parity-docs-site
    annotation: Consumes the docs-site shell it owns; customer onboarding needs publishable installation, quickstart, and concept docs on that substrate.
---

# Ship Objectives to Customers

## Thesis

The Objective capability is the first SDL feature we ship to external customers. Today it is only usable inside this repo checkout: it is delivered as the `ji objective` CLI plus a family of skills plus a Pi extension, all run from source, and the accepted distribution model for every SDL CLI (including `ji` itself) is a run-from-source shim that requires a repo checkout and `ts/node_modules`.

Shipping Objectives externally means a customer with no SDL checkout and no dev toolchain can: install the `ji` CLI from npm, get the objective skills into whichever harness they use (Claude Code, Codex, or Pi), bootstrap their own repo so their agents actually reach for objectives, and follow real documentation — with no standalone objective binary.

**Naming (ADR 0024, `rename-sdl-to-ji`):** the shipped customer surface is the `ji` CLI, and the core cutover has landed — the repo's binary is now `ji`, consumer dirs are `.ji/` (`.ji/objectives/`, `.ji/extensions/`), config is `ji.toml`, and the package-scope sweep renamed the packages this Objective touches to `@ji/kernel` (`ts/packages/kernel`), `@ji/objective` (`ts/packages/capabilities/objective`), and `@ji/core` (`ts/packages/infra/core`). All new surface this Objective builds stays ji-named — `ji init`, `ji skills`, `ji objective …`, `ji:objectives:*` block markers, the `@ji/init` package. The rename changed names only: the CLI is still run-from-source (the kernel bin points at raw `src/cli/index.ts`), so the checkout-free gap is unchanged.

This Objective owns the end-to-end customer onboarding thread. The long pole (checkout-free npm distribution of `ji`) was split into the dedicated `checkout-free-sdl-distribution` Objective (decided 2026-07-01) and is consumed here as a hard dependency. This Objective also depends on in-flight work for skill bundling (`skill-management-subsystem`), the documentation site (`eve-parity-docs-site`), and cross-harness reachability (`cross-harness-parity`).

## Scope

- **npm distribution of the `ji` CLI (the long pole).** Make `@ji/kernel` and its required runtime workspace dependencies publishable (`@ji/kernel` is still `"private": true` and the workspace has no build/publish config), replace the source-path module loader (`ts/packages/kernel/src/runtime/module-loader.ts` resolves `@ji/...` aliases to on-disk `.ts` source paths) so `@ji/objective` and its hidden `exec` surface are bundled, produce a checkout-free bundle (no `ts/node_modules` precondition), and publish a versioned package to npm. This was deferred capability-by-capability "to the umbrella Objective," which closed (`port-asdl-toolkit-to-typescript`) without doing it, on the recorded rationale that no real external consumer existed yet. This Objective is that consumer. **Owned by the dedicated `checkout-free-sdl-distribution` Objective** (split decided 2026-07-01); consumed here as a hard dependency, since checkout-free `ji` benefits every capability, not just objectives.
- **Skill delivery to the customer's harness.** Objective skills bundled into the npm package and installable into the correct per-harness roots (`.claude/skills/` for Claude Code; `.agents/skills/` for Codex and Pi) via `skill-management-subsystem`'s Pup-inspired `ji skills` list/path/install surface. Shipping CLI and skills together also resolves the CLI↔skill bidirectional dependency.
- **Customer-repo bootstrap / activation.** A first-party path that materializes skills for the harnesses present in a repo, injects a minimal, portable, harness-neutral objective instruction block into `AGENTS.md` (with the `CLAUDE.md → @AGENTS.md` import for Claude Code), creates `.ji/objectives/`, and verifies git posture. Activation has two independent requirements: the capability materialized where each harness looks, and the agents instructed to use it.
- **Onboarding documentation content.** Real (non-placeholder) concept and quickstart content for objectives in `docs-site` (installation, quickstart, concepts/objectives, tools/objective). The docs-site shell and stack are owned by `eve-parity-docs-site`; this Objective owns the objective-specific content and its publication gating.
- **Harness coverage.** Claude Code, Codex, and Pi are all first-class customer targets. Cross-harness reachability (deterministic logic in a shared CLI, a skill driving it, the Pi extension purely additive) is owned by `cross-harness-parity`; this Objective consumes it and adds the onboarding coverage for all three.

## Non-Goals

- No standalone `objective` binary; the supported surface is the `ji` CLI (`ji objective …`).
- No contributor / dev-environment onboarding (`just`, pnpm, direnv, `slot`, source shims). Those serve SDL developers, not a customer who only wants objectives.
- No marketplace, remote skill registry, semantic-version solver, or dependency graph.
- No re-implementation of skill install-path logic here; consume `skill-management-subsystem`.
- No hidden state, telemetry, or account/licensing system in v1.
- Not shipping every harness on the platform list in v1 — only Claude Code, Codex, and Pi (Cursor, opencode, Gemini, Windsurf parked).

## Completion Criteria

- A customer with no SDL checkout can install `ji` from npm and run `ji objective …` against their own repo, checkout-free (no `ts/node_modules`).
- The objective skills install into a customer's Claude Code, Codex, and Pi harnesses through a first-party command, landing in the correct per-harness roots.
- A first-party bootstrap step activates objectives in a customer repo: a minimal portable `AGENTS.md` instruction block (idempotent, upgradeable, removable), `.ji/objectives/` present and committed, and git posture verified.
- A customer can follow real installation and quickstart docs to create → advance → update → close their first objective, with no placeholder pages, and the docs site is publishable.
- Onboarding is verified end-to-end in a throwaway non-SDL repo for **all three of Claude Code, Codex, and Pi** (decided 2026-07-01; stronger than the prior "Claude Code and Codex, Pi if feasible" bar).
- Explicit decisions are recorded for the Resolved Decisions below.

## Assumptions and Risks

Assumptions:

- npm is the customer install vector for the `ji` CLI. (User-confirmed.)
- The supported surface is the `ji` CLI, not a standalone objective binary. (User-confirmed.)
- Skill bundling and install are delivered by `skill-management-subsystem` and do not need to be rebuilt here.
- `ji objective` is effectively zero-config for a customer — trunk is auto-detected and `objective list` is explicitly Graphite-free — so portability is expected, though not yet verified end-to-end outside this checkout.
- `AGENTS.md` is the portable cross-harness instruction carrier: Codex and Pi read it natively, and Claude Code reaches it via the `CLAUDE.md → @AGENTS.md` import.

Risks:

- The checkout-free npm bundle is the long pole. Its owner (`checkout-free-sdl-distribution`) has decided its bundle strategy but the substantive publishing work (un-`private`-ing `@ji/kernel` and deps, replacing the source-path loader, producing a real bundle) has not started. Every prior capability accepted the run-from-source shim and deferred publishing, so the work may be larger than it looks. Not de-risked; external shipping stalls until it lands.
- Objective may carry hidden checkout / `ts/node_modules` assumptions: the CLI loads `@ji/objective` by source path via the kernel module loader, and the skills depend on a hidden `exec` surface. A checkout-free bundle must include the objective package and that surface. Not de-risked.
- Writing into a customer's `AGENTS.md` risks clobbering their content; needs a safe managed-block design. Mitigable.
- Codex cannot make explicit-only skills zero-ambient, so objective skills always cost context on Codex. Acceptable, but must be documented.
- Coordinating across three in-flight dependency Objectives risks sequencing stalls; mitigate by treating them as dependencies with explicit interface expectations rather than blocking work.

## Resolved Decisions

Resolved 2026-07-01 in a design grilling session (full record:
`updates/20260701T185244Z-grilling-decisions-and-distribution-split.md`).

- **npm distribution structure → SPLIT** into the dedicated `checkout-free-sdl-distribution`
  Objective; a hard dependency here, not this Objective's spine.
- **Instruction block → LEAN.** Day-one block teaches only that objectives exist, to run
  `ji objective list` before non-trivial work and read overlapping records, and to use the
  objective skills/CLI. `load-orientations` and Tracking-Gate prose are opt-in/upgradeable,
  not day-one.
- **Bootstrap home → `ji init`**, a thin repo-level composing orchestrator.
- **AGENTS.md write → managed `BEGIN`/`END` block** (areg-style `ji:objectives:*` markers,
  idempotent/upgradeable/removable) + the `CLAUDE.md → @AGENTS.md` import. Not copy-paste.
- **Pi slash extension → internal/additive.** `ji objective` CLI + skills is the single
  portable customer substrate on all three harnesses.
- **Mandatory harness bar → all three** (Claude Code + Codex + Pi) verified end-to-end.

Derived design (first build slice, see the update for full rationale): skill delivery
depends on `skill-management-subsystem`'s copy-into-harness-roots slice (not areg's symlink
model); `ji init` lives in a new `@ji/init` capability package reusing
`@ji/core/managed-region`; `--harness` is explicit/required (no sniffed default); git
posture is verify-and-write, never commit; the skill step is a faked `SkillMaterializer`
gateway until the bundle lands.

## Open Questions

- None outstanding. Reopen here if the `@ji/init` build or the `checkout-free-sdl-distribution`
  dependency surfaces a new fork.
