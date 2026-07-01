# Ship Objectives to Customers

## Thesis

The Objective capability is the first SDL feature we ship to external customers. Today it is only usable inside this repo checkout: it is delivered as the `sdl objective` CLI plus a family of skills plus a Pi extension, all run from source, and the accepted distribution model for every SDL CLI (including `sdl` itself) is a run-from-source shim that requires a repo checkout and `ts/node_modules`.

Shipping Objectives externally means a customer with no SDL checkout and no dev toolchain can: install the `sdl` CLI from npm, get the objective skills into whichever harness they use (Claude Code, Codex, or Pi), bootstrap their own repo so their agents actually reach for objectives, and follow real documentation — with no standalone objective binary.

This Objective owns the end-to-end customer onboarding thread and the currently-unowned long pole (checkout-free npm distribution of `sdl`). It depends on in-flight work for skill bundling (`skill-management-subsystem`), the documentation site (`eve-parity-docs-site`), and cross-harness reachability (`cross-harness-parity`).

## Scope

- **npm distribution of the `sdl` CLI (the long pole).** Make `@sdl/kernel` and its required runtime workspace dependencies publishable (drop `private`), resolve the source-path module loader so `@sdl/objective` and its hidden `exec` surface are bundled, produce a checkout-free bundle (no `ts/node_modules` precondition), and publish a versioned package to npm. This was deferred capability-by-capability "to the umbrella Objective," which closed (`port-asdl-toolkit-to-typescript`) without doing it, on the recorded rationale that no real external consumer existed yet. This Objective is that consumer. May be split into a dedicated subobjective — see Open Questions.
- **Skill delivery to the customer's harness.** Objective skills bundled into the npm package and installable into the correct per-harness roots (`.claude/skills/` for Claude Code; `.agents/skills/` for Codex and Pi) via `skill-management-subsystem`'s Pup-inspired `sdl skills` list/path/install surface. Shipping CLI and skills together also resolves the CLI↔skill bidirectional dependency.
- **Customer-repo bootstrap / activation.** A first-party path that materializes skills for the harnesses present in a repo, injects a minimal, portable, harness-neutral objective instruction block into `AGENTS.md` (with the `CLAUDE.md → @AGENTS.md` import for Claude Code), creates `.sdl/objectives/`, and verifies git posture. Activation has two independent requirements: the capability materialized where each harness looks, and the agents instructed to use it.
- **Onboarding documentation content.** Real (non-placeholder) concept and quickstart content for objectives in `docs-site` (installation, quickstart, concepts/objectives, tools/objective). The docs-site shell and stack are owned by `eve-parity-docs-site`; this Objective owns the objective-specific content and its publication gating.
- **Harness coverage.** Claude Code, Codex, and Pi are all first-class customer targets. Cross-harness reachability (deterministic logic in a shared CLI, a skill driving it, the Pi extension purely additive) is owned by `cross-harness-parity`; this Objective consumes it and adds the onboarding coverage for all three.

## Non-Goals

- No standalone `objective` binary; the supported surface is the `sdl` CLI (`sdl objective …`).
- No contributor / dev-environment onboarding (`just`, pnpm, direnv, `slot`, source shims). Those serve SDL developers, not a customer who only wants objectives.
- No marketplace, remote skill registry, semantic-version solver, or dependency graph.
- No re-implementation of skill install-path logic here; consume `skill-management-subsystem`.
- No hidden state, telemetry, or account/licensing system in v1.
- Not shipping every harness on the platform list in v1 — only Claude Code, Codex, and Pi (Cursor, opencode, Gemini, Windsurf parked).

## Completion Criteria

- A customer with no SDL checkout can install `sdl` from npm and run `sdl objective …` against their own repo, checkout-free (no `ts/node_modules`).
- The objective skills install into a customer's Claude Code, Codex, and Pi harnesses through a first-party command, landing in the correct per-harness roots.
- A first-party bootstrap step activates objectives in a customer repo: a minimal portable `AGENTS.md` instruction block (idempotent, upgradeable, removable), `.sdl/objectives/` present and committed, and git posture verified.
- A customer can follow real installation and quickstart docs to create → advance → update → close their first objective, with no placeholder pages, and the docs site is publishable.
- Onboarding is verified end-to-end in a throwaway non-SDL repo for at least Claude Code and Codex (Pi if feasible).
- Explicit decisions are recorded for the Open Questions below.

## Assumptions and Risks

Assumptions:

- npm is the customer install vector for the `sdl` CLI. (User-confirmed.)
- The supported surface is the `sdl` CLI, not a standalone objective binary. (User-confirmed.)
- Skill bundling and install are delivered by `skill-management-subsystem` and do not need to be rebuilt here.
- `sdl objective` is effectively zero-config for a customer — trunk is auto-detected and `objective list` is explicitly Graphite-free — so portability is expected, though not yet verified end-to-end outside this checkout.
- `AGENTS.md` is the portable cross-harness instruction carrier: Codex and Pi read it natively, and Claude Code reaches it via the `CLAUDE.md → @AGENTS.md` import.

Risks:

- The checkout-free npm bundle is the long pole and is currently unowned. Every prior capability accepted the run-from-source shim and deferred publishing, so the publishability work (dropping `private`, resolving workspace deps, producing a real bundle) may be larger than it looks. Not de-risked.
- Objective may carry hidden checkout / `ts/node_modules` assumptions: the CLI loads `@sdl/objective` by source path via the kernel module loader, and the skills depend on a hidden `exec` surface. A checkout-free bundle must include the objective package and that surface. Not de-risked.
- Writing into a customer's `AGENTS.md` risks clobbering their content; needs a safe managed-block design. Mitigable.
- Codex cannot make explicit-only skills zero-ambient, so objective skills always cost context on Codex. Acceptable, but must be documented.
- Coordinating across three in-flight dependency Objectives risks sequencing stalls; mitigate by treating them as dependencies with explicit interface expectations rather than blocking work.

## Open Questions

- Should checkout-free npm distribution of `sdl` be split into its own dedicated Objective (it benefits every capability, not just objective), or remain the spine of this one?
- What is the minimal, portable objective instruction block for a customer's `AGENTS.md` — does it include always-on `load-orientations` and the Tracking Gate on day one, or are those advanced / opt-in?
- Where does repo bootstrap live: `sdl init` (repo-level, composing skill install), `sdl objective init`, or folded into `sdl skills install`?
- Do we write the instruction block into the customer's `AGENTS.md` (managed `BEGIN`/`END` block, idempotent) or only document a copy-paste?
- Does the Pi `/sdl:objective:*` slash extension ship to customers, or is skills + CLI the customer substrate on all three harnesses with the Pi extension staying internal and additive?
- Which harness set is mandatory for the first customer release beyond the confirmed Claude Code + Codex + Pi?
