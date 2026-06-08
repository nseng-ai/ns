# Roaster Addressing Engine

## Thesis

Move PR feedback addressing to a roaster-owned workflow engine. `pr-address` and `internal-pr-stack-address` should become thin entrypoints that select targets/profiles and invoke roaster, while roaster owns feedback source accounting, triage, batching, resolver gating, validation provenance, closeout intent generation, and dashboard/audit artifacts.

The architectural goal is to preserve the user-facing `pr-address` workflow as a lightweight single-PR orchestrator/wrapper above roaster core, while removing the current `pr-address` implementation as the place where classification, planning, batching, validation, and closeout semantics live. There is explicitly no backwards-compatibility requirement for the old classification/planning shape. The durable user intent behind `pr-address` should remain available, but its workflow semantics should be delegated to roaster.

The first seed already exists as `collectors/github-pr-feedback.md`, introduced as a prompt-only GitHub PR feedback collector. Treat that file as a prototype seed, not the final contract. The future roaster-owned path needs stricter accounting than the seed prompt: source items plus proposed findings, deterministic source-item IDs, recorded helper evidence, optional closeout refs, and roaster validation.

## Scope

This Objective covers the design and implementation of a roaster-centered addressing engine for external feedback, starting with GitHub PR feedback.

In scope:

- Define roaster's unified "finding source" model, with `reviews` and `collectors` as user-facing categories.
- Add first-class roaster collector support, including a user-facing `roaster collect` surface and hidden deterministic `roaster exec` operations for recording/validating collector artifacts.
- Replace the prototype prompt-only GitHub PR feedback collector contract with a stricter roaster collector contract.
- Introduce addressable external source-item accounting:
  - every unresolved/current GitHub feedback source item is accounted for exactly once as a proposed finding, ignored item, or duplicate relation;
  - source items use deterministic adapter-scoped IDs;
  - findings keep human-readable IDs for triage;
  - optional typed closeout refs are available for adapters that can reply/resolve external feedback.
- Persist collector runs, source evidence, proposed findings, accounting, triage, batches, validation, closeout intents, and closeout results in roaster run artifacts.
- Let collector prompts call helper CLIs directly when useful, while requiring exact helper envelopes or verifiable helper-envelope references to be recorded back into roaster for validation.
- Keep `asdl-pr-address` as hidden helper CLI plumbing for GitHub PR feedback lookup/fetch/summarize/detail and GitHub closeout mutations.
- Make helper CLI outputs strict, versioned internal contracts between `pr-address exec` and roaster, despite no user-facing backwards-compatibility requirement.
- Preserve `pr-address` as a lightweight single-PR workflow wrapper that selects the current-branch roaster profile/target and delegates durable workflow semantics to roaster.
- Demote `internal-pr-stack-address` to a stack target/profile entrypoint that handles Graphite stack discovery/safety and then invokes the same roaster engine.
- Keep resolver execution agent-owned and roaster-gated: the active agent edits files; roaster records batches, expected paths, validation, completion evidence, and closeout intents.
- Keep Graphite dependencies behind explicit stack target/profile behavior, not in the generic roaster engine.

The intended final division is:

- Collectors answer: what external feedback exists?
- Roaster answers: what should be done, in what batches, with what validation and closeout plan?
- Resolver agents answer: make the code changes under roaster gates.
- Closeout adapters answer: execute approved external-system mutations exactly as instructed.
- Skills and lightweight workflow wrappers answer: choose the right roaster profile/target for the user's request while leaving durable semantics in roaster.

## Non-Goals

- Do not preserve the old `pr-address` core implementation shape for backwards compatibility; preserve the user-facing `pr-address` workflow only as a lightweight roaster-backed wrapper.
- Do not keep duplicated classification, batching, execution planning, or validation semantics in `pr-address` once roaster has the replacement path.
- Do not make `pr-address` or `internal-pr-stack-address` independent core workflow engines parallel to roaster.
- Do not require Graphite for single-PR/current-branch addressing.
- Do not make roaster call GitHub directly as workflow policy; GitHub operations should go through explicit helper/adapters.
- Do not put human-facing closeout wording generation in the GitHub adapter. Roaster generates proposed reply text; adapters execute approved intents.
- Do not execute GitHub closeout implicitly during collection or resolution. Closeout is a final explicit phase after validation and confirmation.
- Do not make collector prompts the durable schema authority. Prompts may describe the contract, but roaster's typed models and validators own it.
- Do not make code-review prompts adopt strict source-item accounting initially. Strict accounting applies first to addressable external collectors such as GitHub PR feedback.
- Do not add Branch Memory, hidden state, YAML registries, task databases, or durable automation ledgers for this workflow.
- Do not rely on live GitHub access for tests.

## Completion Criteria

This Objective is complete when:

- Roaster has a first-class collector/accounting model for addressable external feedback, implemented with typed source-item, proposed-finding, accounting, helper-evidence, and closeout-ref models.
- `roaster collect` can start a governed collector run and produce a contract/task packet for GitHub PR feedback.
- Hidden roaster exec commands can record and validate collector results against helper evidence, enforcing strict accounting for unresolved/current GitHub feedback source items.
- Collector run artifacts persist compact evidence inline and full/raw bodies via payload locators.
- The GitHub PR feedback collector prompt is upgraded from prototype seed to the roaster-owned contract.
- Roaster triage/batching can consume collector proposed findings while preserving source-item provenance through resolver batches.
- Roaster can generate per-source-item closeout intents, grouped by finding/batch for display and approval, including proposed human-facing reply text.
- A GitHub closeout adapter path can execute approved closeout intents through `pr-address exec` helper commands.
- The public `pr-address` workflow exists at the end as a thin current-branch/single-PR roaster profile wrapper/entrypoint.
- The internal stack-address skill is rewritten as a thin Graphite stack target/profile entrypoint.
- Old `pr-address` classification/planning concepts are removed or made unreachable after the roaster replacement exists.
- The first implementation path is covered by deterministic schema/unit tests, CLI scenario tests, and fake/fixture helper-envelope tests with no live GitHub dependency.

## Definition of Progress

Progress is keepable when it moves durable workflow ownership from `pr-address`/skill prose into roaster-owned contracts, artifacts, validation, or profile-driven execution.

Useful progress includes:

- a smaller, typed roaster model that makes source accounting or closeout intent validation more explicit;
- a CLI command that records or validates inspectable artifacts;
- a prompt/schema update that removes ambiguity and aligns with roaster validators;
- a package refactor that deletes old `pr-address` workflow semantics after equivalent roaster behavior exists;
- a skill rewrite that makes `pr-address` or stack-address thinner and delegates semantics to roaster;
- deterministic tests or fixtures that prove source-item accounting, helper-envelope contracts, or closeout-intent safety.

Do not keep changes that merely move old `pr-address` workflow logic into another package without clarifying roaster ownership, or that make closeout mutation easier without preserving explicit final confirmation.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` and similar confirmed execution flows under these boundaries.

- Direct execution is allowed after a preview when the proposed slice has one clear thesis, preserves the resolved architectural decisions in this Objective, and does not require live GitHub mutation.
- Steer or ask first when a slice would change the meaning of collector accounting, make Graphite a generic runtime dependency, remove the `pr-address` helper CLI boundary, execute GitHub closeout, submit/push PRs, remove the lightweight `pr-address` wrapper workflow, or resurrect backwards compatibility for the old `pr-address` core workflow.
- Work may change Python packages, roaster prompts, skills, tests, fixtures, and Objective files. It may leave a stack of local Graphite branches or unsubmitted PRs only after explicit preview confirmation.
- Validation before keeping work should include targeted unit/scenario tests for changed Python commands/models and `just dprint-check` for Markdown prompt/skill/objective changes. Use fake helper envelopes instead of live GitHub for test coverage.
- External-system mutation is out of scope unless explicitly previewed and confirmed. That includes resolving/reopening GitHub threads, posting GitHub replies/comments/reactions, pushing/submitting PRs, publishing packages, or deploying services.
- Branch and PR submission remain manual unless the user explicitly requests submission in the current session.

## Assumptions and Risks

Assumptions:

- Roaster is the right durable home for collect/triage/batch/resolve/validate/closeout workflow semantics.
- `pr-address exec` can remain as hidden helper CLI plumbing without re-growing into a core workflow engine, while the public `pr-address` workflow remains as a lightweight roaster-backed wrapper.
- Shelling out to strict, versioned helper CLI contracts is acceptable for roaster integration, even though direct Python imports might be simpler for fake-driven tests.
- A prompt-assisted collector can call helper CLIs directly if the final collector result records exact helper envelopes or verifiable references and roaster validates the accounting.
- Source-item accounting is necessary for addressable external feedback but not initially necessary for roaster code-review prompts.
- Per-source-item closeout intents grouped by finding/batch are the right balance between execution precision and human approval UX.
- The current `collectors/github-pr-feedback.md` seed is useful context but can be rewritten without compatibility constraints.

Risks:

- The helper CLI boundary may become brittle unless output schemas are explicit, versioned, and covered by fixture tests.
- Prompt-directed helper calls can bypass provenance unless roaster rejects collector results that lack matching helper evidence.
- Strict source-item accounting can become too heavy if the schema tries to model the entire source-system lifecycle instead of initial collection accountability.
- Closeout reply wording is human-sensitive, especially for stack omnibus flows; generating text in roaster must still allow explicit user confirmation before mutation.
- Keeping the `asdl-pr-address` package name may continue to imply core workflow ownership unless docs/skills clearly distinguish the public lightweight `pr-address` wrapper from hidden helper plumbing.
- Deleting old classification/planning too early could temporarily remove a usable addressing path; deleting it too late could cause agents to keep using the old workflow.
- Stack branch policy can leak back into `internal-pr-stack-address` unless roaster profiles own both target selection semantics and fix-location policy.

## Open Questions

- What exact fields should the roaster collector result schema use for source items, proposed findings, duplicate relationships, helper-envelope references, and closeout refs?
- What exact fields should closeout intents use for operation type, proposed reply body, source item, batch/finding grouping, adapter target, approval state, and execution result?
- What should the explicit helper CLI schema versioning mechanism be: top-level version field, per-command contract name, or both?
- Which command names should roaster use for recording/validation: `record-collector-result`, `validate-collector-result`, `record-source-accounting`, or another shape?
- How much of current `prepare-run` should be split into lower-level helper commands before deleting the composite command?
- Should the first stack implementation create a new roaster collector package/module before or after updating the prototype prompt?
- What exact UX should the lightweight `pr-address` wrapper expose so users experience a coherent single-PR workflow without reintroducing duplicated core workflow logic?
