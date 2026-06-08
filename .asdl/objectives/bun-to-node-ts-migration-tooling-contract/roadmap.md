# Roadmap

## Work

- [x] Inventory current TypeScript tooling entry points and record the contract-relevant facts.
      Focus on package manifests, workspace boundaries, lockfiles, `justfile` targets, TypeScript CLI launch paths, project-local Pi extension loading, docs-site scripts, and any current Bun-only assumptions that affect policy. Evidence should distinguish policy-setting facts from implementation chores for later child Objectives.

- [ ] Decide the Node baseline and TypeScript execution/build policy.
      Choose the Node version expectation and the strategy for running or building TypeScript CLIs and Pi extension modules. Evidence should include a small compatibility probe or concrete source inspection sufficient to justify the selected strategy and its constraints.

- [ ] Decide the pnpm workspace contract for downstream migration.
      Define the intended workspace shape, package-manager boundary, script expectations, and lockfile direction. Leave mechanical manifest, lockfile, and docs-site script edits to the pnpm workspace child Objective unless a minimal probe is needed to validate the decision.

- [ ] Decide the `node:sqlite` warning policy.
      Determine whether to accept, document, suppress, isolate, or avoid the experimental warning. Record the decision and downstream owner if implementation belongs in another child Objective.

- [ ] Update downstream migration guidance from the settled tooling contract.
      Record how the decisions should constrain the pnpm workspace, Vitest migration, Node runtime compatibility, and Bun-reference reconciliation child Objectives. Capture any assumption changes, risks, or open questions before closure.

## Parked

- [ ] Reconsider npm plus Node's built-in test runner only if pnpm or Vitest proves unsuitable during contract investigation.
- [ ] Redesign Bun-centric project templates only if the Bun-reference reconciliation child Objective determines those templates are inside the migration target.
