# Roadmap

## Work

- [ ] Settle `references/README-draft.md` through the readme-driven-development loop, including the exact Entry Key and user-visible locator/output choices.
  - Policy: steer first for unresolved user-facing commitments; documentation clarification within settled decisions may execute locally after preview.
  - Evidence: the README reads as coherent product documentation with no hidden transport commitments or implementation task state.
- [ ] Implement local Saved Plan preparation and Branch Memory delivery: explicit plan resolution, unique `dispatch-input` Entry creation, setup preflight/refusal, exact Snapshot Ref publication planning, remote verification, typed locator, and safe partial-failure outcomes.
  - Policy: local code and fake-driven tests may execute after preview; no real Branch Memory mutation or ref push.
  - Evidence: targeted Plans/Branch Memory/Vercel tests and relevant TypeScript checks pass.
- [ ] Extend the dispatch workflow and sandbox supervision to accept the typed locator, fetch and check the exact Entry before launch, and instruct the harness to run `brmem get` first and execute the plan.
  - Policy: local code, tests, and deployable build may execute after preview; deployment and cloud triggering require a separate confirmed interlude.
  - Evidence: fake-driven workflow/sandbox tests pass, trigger payload tests prove the plan body is absent, and `build:deployable` passes.
- [ ] Ship `ns dispatch plan <plan-ref>` and portable wrapper coverage over the shared dispatch spine, with plan-specific anchor content, machine output, help, and failure recovery.
  - Policy: local command and wrapper work may execute after preview; no branch push, PR mutation, or workflow trigger.
  - Evidence: CLI scenarios cover operations, `-h`/`--help`, machine schema/output, version/runtime parity where applicable, and relevant repository checks pass.
- [ ] Prove one real Branch Memory-delivered Saved Plan dispatch end to end and fold only witnessed facts into the README and Objective tracking.
  - Policy: steer first. Deployment, `brmem put`, ref pushes, anchor PR creation/mutation, and workflow triggering each require an explicit confirmed live-interlude preview; PR submission remains separate.
  - Evidence: exact remote Snapshot Ref, supervisor precheck, harness `brmem get`, plan execution, agent-created commit, and normal anchor-PR landing are witnessed; existing long-supervision evidence is linked.
- [ ] Merge the settled contract into `ts/packages/capabilities/vercel/README.md`, repoint this Objective's canonical reference, and provide focused completion evidence back to `cloud-execution`.
  - Policy: local documentation and Objective tracking may execute after preview; coordinate rather than overwrite concurrent broader README work.
  - Evidence: no canonical contract remains only under this Objective's `references/` directory.

## Parked

- Accepting Branch Context Attached Plans or raw Branch Memory locators as dispatch input.
- Automatic or explicit cleanup tooling for retained `dispatch-input` Entries.
- Warm sandbox or snapshot optimization for Branch Memory-enabled dispatches.
- Any non-Vercel backend or alternate result-delivery path.
