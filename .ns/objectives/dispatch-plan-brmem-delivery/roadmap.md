# Roadmap

## Work

- [x] Settle `references/README-draft.md` through the readme-driven-development loop around the decided Dispatch ID context-envelope convention and progressive-disclosure output.
  - Policy: local-only autorun may execute this row directly; stop only if implementation evidence requires changing the settled input, context-envelope, identity, or output contract.
  - Evidence: the README reads as coherent Pi-first product documentation, explains Dispatch ID correlation without exposing transport noise, and contains no hidden implementation task state.
- [ ] Implement local Saved Plan preparation and Branch Memory delivery: explicit plan resolution, Dispatch ID generation, convention-based context creation at `<dispatch-id>/plan/<plan-slug>.md`, setup preflight/refusal, exact Snapshot Ref publication planning, remote verification, typed envelope locator, and safe partial-failure outcomes.
  - Policy: local-only autorun may implement orchestration and fake-driven adapters/tests; it must not run `brmem put`, configure synchronization, or push any ref.
  - Evidence: targeted Plans/Branch Memory/Vercel tests cover stable Dispatch ID propagation, context-key validation, success, and every partial-failure boundary; relevant TypeScript checks pass.
- [ ] Extend the dispatch workflow and sandbox supervision to accept the typed context-envelope locator, seed `dispatch.id` at workflow start, fetch the exact Snapshot Ref, verify the convention-required plan member under the Dispatch ID prefix, and instruct the harness to run `brmem get` first and execute the plan.
  - Policy: local-only autorun may change code, tests, and deployable artifacts; deployment, Workflow Analytics queries, and cloud triggering remain outside the run.
  - Evidence: fake-driven workflow/sandbox tests pass; start attributes carry the Dispatch ID; recovery lookup treats zero, one, and multiple matches explicitly; trigger payload tests prove the plan body is absent; `build:deployable` passes.
- [ ] Ship `ns dispatch plan <plan-ref>` and Pi/portable wrapper coverage over the shared dispatch spine, with plan-specific anchor content, progressive-disclosure human output, full machine provenance, help, and failure recovery.
  - Policy: local-only autorun may execute command and wrapper work; no source/anchor push, PR mutation, workflow trigger, or publication.
  - Evidence: CLI scenarios cover human output (Dispatch ID plus PR/workflow links), machine schema (full context locator plus Dispatch ID and Vercel run ID), marked anchor-PR provenance content, operations, `-h`/`--help`, runtime parity, and relevant repository checks.
- [ ] Prove one real Branch Memory-delivered Saved Plan dispatch end to end and fold only witnessed facts into the README and Objective tracking.
  - Policy: excluded from local-only autorun. The loop stops and reports this row as the remaining human-run interlude; a separately authorized session owns every deployment, Branch Memory write, ref push, anchor-PR action, workflow trigger, and live fact fold.
  - Evidence: exact remote Snapshot Ref, supervisor precheck, harness `brmem get`, plan execution, agent-created commit, and normal anchor-PR landing are witnessed; existing long-supervision evidence is linked.
- [ ] Merge the settled contract into `ts/packages/capabilities/vercel/README.md`, repoint this Objective's canonical reference, and provide focused completion evidence back to `cloud-execution`.
  - Policy: local-only autorun may execute documentation and selected-Objective tracking edits after the implementation rows are locally complete; coordinate rather than overwrite concurrent broader README work. Any tracking mutation of `cloud-execution` remains outside this Objective's runner step and must use its own update workflow.
  - Evidence: no canonical contract remains only under this Objective's `references/` directory.

## Parked

- Accepting Branch Context Attached Plans or raw Branch Memory locators as dispatch input.
- Automatic or explicit cleanup tooling for retained `dispatch-context` Entries.
- Warm sandbox or snapshot optimization for Branch Memory-enabled dispatches.
- Any non-Vercel backend or alternate result-delivery path.
