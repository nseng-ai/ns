---
blocked: End-to-end verification is gated on the bare-core npm release and a publishable docs-site launch slice.
edges:
  - objective: ship-objectives-to-customers
    annotation: Subobjective of the customer-Objectives umbrella; owns the first real customer onboarding thread through Claude Code.
  - objective: objectives-extension-customer-surface
    annotation: Consumes its completed v1 extension inspection surface so the documented onboarding path is coherent and supportable.
  - objective: objectives-bare-core-release
    annotation: Consumes its published bare-core and standalone Objectives artifacts as the exact registry inputs to onboarding.
  - objective: eve-parity-docs-site
    annotation: Consumes its publishable site shell and launch-bar decisions while owning the Objective-specific onboarding content and verification.
---

# Objectives Claude Onboarding Steelthread

## Thesis

Prove the thinnest real customer journey for shipped Objectives: a stranger starts in a throwaway non-ns repository, follows the public documentation without improvisation, installs the bare `ns` core, initializes Claude Code, acquires the standalone Objectives extension, and uses Claude Code to create, advance, update, and close one Objective.

This is a durable production steelthread, not a mock or throwaway implementation. The repository used for verification is disposable, but every layer under test is real: npm registry artifacts, the installed `ns` binary, repo-local configuration, extension acquisition, descriptor activation, skill provisioning, instruction reachability, Objective storage, Claude Code behavior, and published docs. A deviation is a product or documentation defect to fix and re-run, not an instruction the verifier may invent.

## Scope

- Finalize the Objective-specific installation, quickstart, concept, and command documentation on the docs-site shell using the verified bare-core flow.
- Remove stale release-gate copy and make the documented order explicit: install core, run `ns init --harness claude-code`, install `npm:@nseng-ai/objectives`, then use the Objective lifecycle.
- Verify in an isolated foreign git repository that activation writes the pointer stanza and generated instructions, creates `.ns/objectives/`, and provisions the Objective skill into Claude Code's expected repository root.
- From a fresh Claude Code session that receives only the published documentation and repository state, complete create → next → update → close for one real Objective.
- Treat every undocumented command, manual repair, ambient checkout dependency, missing instruction, or unclear page as a defect; fix it in the owning surface and repeat from a clean repository.
- Publish or otherwise verify the final Objective pages on the production docs substrate after any required explicit authorization for external writes.
- Record the verified package versions, docs revision, harness conditions, and customer-visible caveats for umbrella synthesis.

## Non-Goals

- Codex or Pi onboarding verification; those remain deliberate post-thread breadth.
- Additional harnesses such as Cursor, opencode, Gemini, or Windsurf.
- Reimplementing extension acquisition, artifact provisioning, or docs-site infrastructure inside this Objective.
- General skill upgrade/drift management, telemetry, licensing, accounts, or release automation.
- Broadening the v1 extension surface with fleet update, user scope, additional source kinds, or bare-name npm sugar.
- Accepting a scripted CLI-only lifecycle as a substitute for Claude Code following the installed instructions and skills.

## Completion Criteria

- Public customer docs state the verified bare-core Claude Code path with no placeholder or stale release-gate content on the Objective journey.
- In a clean foreign repository with no ns checkout or development dependencies, the published core initializes Claude Code and the published Objectives extension installs through `ns extension install npm:@nseng-ai/objectives`.
- The resulting repository contains the intended committed activation state, and Claude Code can discover the Objective instructions and installed skill without manual prompt injection or copying files from this checkout.
- A fresh Claude Code session follows the docs to create, advance with `objective-next`, record progress with `objective-update`, and close one Objective; the resulting Objective record passes structural checks.
- The entire journey is repeated successfully after all discovered deviations are fixed, with zero verifier improvisation and exact package/docs evidence recorded.
- Deferred Codex and Pi breadth remains possible without changing the proven shared CLI-and-skill substrate.

## Assumptions and Risks

Assumptions:

- `objectives-extension-customer-surface` supplies the complete v1 command contract documented by the journey.
- `objectives-bare-core-release` supplies registry artifacts whose exact versions can be installed in an isolated environment.
- `eve-parity-docs-site` supplies a publishable production shell and settles the launch-bar treatment of pages outside this Objective journey.
- `CLAUDE.md` importing `@AGENTS.md`, the pointer stanza, generated `.ns/instructions.md`, and repository-local `.claude/skills/` together make Objective guidance reachable to a fresh Claude Code session.

Risks:

- Ambient global packages, credentials, Claude configuration, or an ns checkout could create a false pass. Verification must isolate installation prefixes and repository state and record all remaining environmental prerequisites.
- Claude Code behavior is probabilistic. The bar is instruction and skill reachability plus successful completion without hidden steering, not byte-identical dialogue.
- The docs-site launch bar or unrelated placeholder corpus may delay public deployment. Keep Objective-content ownership explicit and record any external site gate rather than weakening the end-to-end criterion.
- npm or docs deployment is an external write. Local preparation may proceed, but publishing requires explicit authorization through the owning workflow.
- The lifecycle may expose defects in a dependency Objective. Route fixes to the owning Subobjective or record a new bounded follow-up rather than absorbing unrelated architecture work here.

## Open Questions

None at creation. The Claude-Code-first bar, command order, public-doc requirement, and zero-improvisation standard are inherited from settled parent decisions.
