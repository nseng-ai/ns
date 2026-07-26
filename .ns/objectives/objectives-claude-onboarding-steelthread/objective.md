---
edges:
  - objective: ship-objectives-to-customers
    annotation: Subobjective of the customer-Objectives umbrella; owns the first real customer onboarding thread through Claude Code.
  - objective: objectives-extension-customer-surface
    annotation: Consumes its completed v1 extension inspection surface so the documented onboarding path is coherent and supportable.
  - objective: objectives-bare-core-release
    annotation: Consumes its published bare-core and standalone Objectives artifacts as the exact registry inputs to onboarding.
---

# Claude E2E Onboarding

## Thesis

Eventually prove the thinnest real customer journey for shipped Objectives: a stranger starts in a throwaway non-ns repository, follows the public documentation without improvisation, installs the bare `ns` core, initializes Claude Code, acquires the standalone Objectives extension, and uses Claude Code to create, advance, update, and close one Objective. All remaining execution is deferred; this record preserves the qualified artifacts, evidence bar, and restart point without creating an active launch commitment.

This is a durable production steelthread, not a mock or throwaway implementation. The repository used for verification is disposable, but every layer under test is real: npm registry artifacts, the installed `ns` binary, repo-local configuration, extension acquisition, descriptor activation, skill provisioning, instruction reachability, Objective storage, Claude Code behavior, and published docs. A deviation is a product or documentation defect to fix and re-run, not an instruction the verifier may invent.

## Scope

- Finalize the canonical `@nseng-ai/ns` and `@nseng-ai/objectives` package READMEs using the verified bare-core flow.
- Make the documented order explicit: install core, run `ns init --harness claude-code`, install `npm:@nseng-ai/objectives`, then use the Objective lifecycle.
- Verify in an isolated foreign git repository that activation writes the pointer stanza and generated instructions, creates `.ns/objectives/`, and provisions the Objective skill into Claude Code's expected repository root.
- From a fresh Claude Code session that receives only the published documentation and repository state, complete create → next → update → close for one real Objective.
- Treat every undocumented command, manual repair, ambient checkout dependency, missing instruction, or unclear page as a defect; fix it in the owning surface and repeat from a clean repository.
- Qualify, publish with explicit external-write authorization, and registry-verify package artifacts that contain the canonical onboarding READMEs.
- Record the verified package versions, docs revision, harness conditions, and customer-visible caveats for umbrella synthesis.

## Non-Goals

- Codex or Pi onboarding verification; those remain deliberate post-thread breadth.
- Additional harnesses such as Cursor, opencode, Gemini, or Windsurf.
- Reimplementing extension acquisition or artifact provisioning inside this Objective.
- Launching or completing the deferred documentation; package READMEs are the canonical pre-launch customer surface.
- General skill upgrade/drift management, telemetry, licensing, accounts, or release automation.
- Broadening the v1 extension surface with fleet update, user scope, additional source kinds, or bare-name npm sugar.
- Accepting a scripted CLI-only lifecycle as a substitute for Claude Code following the installed instructions and skills.

## Completion Criteria

- Registry-served package READMEs state the verified bare-core Claude Code path with no placeholder or stale release-gate content on the Objective journey.
- In a clean foreign repository with no ns checkout or development dependencies, the published core initializes Claude Code and the published Objectives extension installs through `ns extension install npm:@nseng-ai/objectives`.
- The resulting repository contains the intended committed activation state, and Claude Code can discover the Objective instructions and installed skill without manual prompt injection or copying files from this checkout.
- A fresh Claude Code session follows the docs to create, advance with `objective-next`, record progress with `objective-update`, and close one Objective; the resulting Objective record passes structural checks.
- The entire journey is repeated successfully after all discovered deviations are fixed, with zero verifier improvisation and exact package/docs evidence recorded.
- Deferred Codex and Pi breadth remains possible without changing the proven shared CLI-and-skill substrate.

## Assumptions and Risks

Assumptions:

- Confirmed: completed `objectives-extension-customer-surface` supplies the complete v1 command contract documented by the journey.
- Confirmed: completed `objectives-bare-core-release` published `0.1.3` artifacts that install successfully in an isolated environment, though those artifacts predate the canonical onboarding READMEs.
- Revised: package READMEs are the canonical pre-launch customer surface; the intentionally deferred the retired website Objective no longer gates this journey.
- `CLAUDE.md` importing `@AGENTS.md`, the pointer stanza, generated `.ns/instructions.md`, and repository-local `.claude/skills/` together make Objective guidance reachable to a fresh Claude Code session.

Risks:

- Ambient global packages, credentials, Claude configuration, or an ns checkout could create a false pass. Verification must isolate installation prefixes and repository state and record all remaining environmental prerequisites.
- Claude Code behavior is probabilistic. The bar is instruction and skill reachability plus successful completion without hidden steering, not byte-identical dialogue.
- The canonical README source changes postdate registry release `0.1.3`; the journey cannot claim documentation-following evidence until a newly qualified package version exposes them through npm.
- Accepted sequencing gap: publication of the repaired README revision was intentionally skipped by explicit direction. Registry-served README completion criteria and a published-docs-only Claude journey remain unmet unless publication is revisited.
- Accepted deferral: all remaining publication, fresh-session lifecycle, repair-loop, and synthesis work is parked until the owner explicitly resumes this Objective. The Objective remains open as a preserved future E2E thread, not an active launch commitment.
- The lifecycle may expose defects in a dependency Objective. Route fixes to the owning Subobjective or record a new bounded follow-up rather than absorbing unrelated architecture work here.

## Open Questions

None at creation. The Claude-Code-first bar, command order, public-doc requirement, and zero-improvisation standard are inherited from settled parent decisions.

## Closure

Closed 2026-07-20 as deferred, making the record's own declared state honest: its thesis already stated "All remaining execution is deferred; this record preserves the qualified artifacts, evidence bar, and restart point without creating an active launch commitment."

Outcome at closure: substantial partial evidence exists — the bare-core install flow was verified, published `0.1.3` provisioning was confirmed for Claude Code (all ten declared Objective skills landed under `.claude/skills/` in a foreign repository), and the canonical README sources were repaired. Unmet: publication of the repaired README revision (intentionally skipped by explicit direction), registry-served README completion criteria, the fresh-session Claude lifecycle journey, the repair loop, and cross-seam defect synthesis.

Restart pointer: the record's Scope, evidence bar (real registry artifacts, isolated foreign repo, zero-improvisation standard), Risks (including the accepted sequencing gap), and roadmap rows are the complete restart state. Resuming means: publish a newly qualified package version exposing the repaired READMEs, then run the documented journey end to end. Nothing needs re-deciding.

Closure decision made in the 2026-07-20 open-objective portfolio review. The parent umbrella (`ship-objectives-to-customers`) closes as deferred alongside this record.
