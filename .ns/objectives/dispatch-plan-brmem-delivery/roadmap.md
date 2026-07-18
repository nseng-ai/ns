# Roadmap

## Work

- [x] Settle the initial Saved Plan delivery contract and progressive-disclosure
      output through README-driven development.
  - Historical evidence: this established explicit Saved Plan resolution,
    Dispatch ID correlation, non-overwriting git-native delivery, exact Snapshot
    provenance, and compact human/full machine output. Its original
    `<dispatch-id>/plan/<plan-slug>.md` layout is superseded below; the witnessed
    and local evidence for independent boundaries remains historical fact.

- [x] Implement and validate the original local plan-copy path.
  - Historical evidence: local stacked work covered plan resolution, Branch
    Memory setup refusal, non-overwriting Entry creation, exact ref publication
    and verification, locator-only plan payloads, Dispatch ID Workflow
    attributes and fake Analytics recovery, sandbox precheck, command/wrapper
    parity, and partial-failure evidence. Targeted fake-driven and repository
    TypeScript checks passed. No live Branch Memory or cloud mutation occurred.
  - Superseded contract: copying the Saved Plan to
    `dispatch-context/<dispatch-id>/plan/<plan-slug>.md` is no longer current
    behavior and must not be reintroduced.

- [x] Redesign prompt and plan dispatch around one generic instruction contract.
  - Contract: every dispatch creates anchor-scoped
    `dispatch-context/<dispatch-id>/instructions.md`; prompt content is exact
    instruction content, while plan instructions identify a normal
    anchor-scoped Branch Context Attached Plan and pin its commit. Workflow
    input carries only the instruction locator and Dispatch ID, with no raw work
    content or work-kind discriminator. Sandbox setup fetches all
    `refs/brmem/*`, verifies the pinned instruction Snapshot and Entry, and uses
    one `brmem get`-first bootstrap.
  - Rationale: Branch Context remains the owner and normal location of Attached
    Plans; the remote interface becomes generic without exposing an arbitrary
    Entry command.

- [~] Implement the redesigned generic path locally across Branch Context,
  prompt/plan orchestration, trigger/Workflow, sandbox setup, command output,
  and documentation.
  - Evidence: dirty local production and test changes implement curated Attached
    Plan ensure/reuse/conflict behavior; generic anchor-scoped instruction
    preparation and publication; shared anchor-to-run orchestration;
    locator-only trigger/Workflow contracts; fetch-all setup and exact
    instruction checks; pinned plan instructions; and compact PR provenance.
    Existing package tests and TypeScript gates were reported green before this
    documentation slice. The canonical package README and cloud draft now
    describe the redesigned contract.
  - Status boundary: locally implemented, not deployed or live-proven. This row
    remains partial until deployable build evidence exists. `build:deployable`
    is currently blocked because the implementing worktree has no local Vercel
    Project Settings; do not run `vercel pull` as a substitute in local-only
    work.

- [ ] Build and deploy the redesigned trigger/Workflow artifacts in a separately
      authorized operator session.
  - Gate: provide/link local Vercel Project Settings, pass `build:deployable`,
    deploy through the canonical production command, and verify deployment/alias
    identity. Record exact non-secret deployment evidence without inferring a
    successful run.
  - Policy: excluded from local-only Objective execution.

- [ ] Prove the generic prompt and Saved Plan paths live.
  - Prompt evidence: exact anchor-scoped instruction retrieval, first-call Bash,
    subagent spawn, agent-created commit, and normal landing.
  - Plan evidence: instruction retrieval at its pinned commit, Attached Plan
    retrieval at the separately pinned commit, plan execution, agent-created
    commit, and normal anchor landing.
  - Policy: every deployment, Branch Memory write/ref push, anchor mutation, and
    Workflow trigger requires separate authorization. Fold only witnessed facts
    into README and Objective tracking.

- [ ] Return focused completion evidence to `cloud-execution` through that
      Objective's own tracking workflow after live proof.
  - Evidence must distinguish historical raw-prompt proof from the new generic
    locator-only prompt/plan proof and must not overwrite broader cloud roadmap
    history.

## Parked

- A public `ns dispatch brmem` or other arbitrary Entry command.
- Automatic cleanup of retained `dispatch-context` instructions or
  `branch-context` attachments.
- A bounded context manifest/list unless fetch-all scale evidence requires one.
- Warm Sandbox optimization, alternate backends, handoff dispatch, jobs UI,
  scheduled work, and additional harnesses.
