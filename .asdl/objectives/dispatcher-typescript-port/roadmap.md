# Roadmap

## Work

- [x] Create the dispatcher Child Objective.
  - Evidence: this Objective now exists under `.asdl/objectives/dispatcher-typescript-port/` as the dispatcher capability slice for `port-asdl-toolkit-to-typescript`.
- [x] Inventory the current Python dispatcher contract.
  - Evidence: `contract-inventory.md` records source, tests, workspace wiring, caller discovery, durable behavior, incidental behavior, and the recommended next action.
- [ ] Decide whether to port or retire the placeholder.
  - If active consumers need the `dispatcher` command or plugin mount to survive the migration, create a tiny TypeScript placeholder port that preserves help, version, and plugin discoverability.
  - If no consumers need the placeholder, plan deliberate retirement of `packages/asdl-dispatcher` and its workspace/build/test references.
- [ ] Execute the chosen implementation or retirement slice.
  - Preserve the documented contract during a port, or remove it deliberately during retirement with parent Objective evidence.
- [ ] Feed the decision and outcome back to the parent TypeScript migration Objective.
  - Update the migration ledger, roadmap evidence, and any porting-playbook lessons once the port/retire decision is complete.

## Parked

- Real GitHub Actions dispatch behavior. The current package name and help text gesture at dispatching coding tasks, but no operation contract exists yet.
- `packages/asdl-dispatcher/CONTEXT.md`. The repository context map keeps this package out of context scope while the dispatcher group has `operations=[]`.
