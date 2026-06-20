# slot-typescript-port objective created with deep prework

## Summary

Created the `slot-typescript-port` subobjective under the umbrella
`port-asdl-toolkit-to-typescript` (capability #7, Slots / `slot`) and embellished it with deep,
code-referenced analysis so a downstream agent can implement the port without re-reverse-engineering
the Python source. This is doc-authoring only — no `ts/packages/slot` scaffold, no TypeScript, no
Python deletion.

## Objective Impact

Promotes `slot` from "Unstarted" in the umbrella ledger to an active subobjective with an
independently-executable plan. Deliverables created:

- `objective.md` — sibling-skeleton contract (Thesis/Scope/Non-Goals/Completion Criteria/Definition
  of Progress/Runner Policy/Assumptions and Risks/Open Questions/Closure).
- `roadmap.md` — 11 semantic work rows + Parked, following the playbook vertical-slice sequence.
- `slot-contract-inventory.md` — durable-vs-incidental classification with `file:line` evidence.
- `prework/` — roaster-style downstream-execution suite: `README.md` + six specs (architecture &
  module map; pure-core & naming; worktree lifecycle; gt & gateways; shell & clipboard integration;
  ts-scaffold & cutover), each with `file:line` evidence and a TS test checklist.

## Key decisions recorded

- **Full-parity OS-coupling scope (user-confirmed).** Shell integration (`slot shell/completion
  install`), the parent-shell `cd` directive (`$SLOT_CD_DIRECTIVE_FILE`), and clipboard are in-scope
  for the cutover and flagged as the port's **primary novel risk** — the first OS-coupled / host-
  filesystem-state port in this migration. `prework/05` covers it at byte fidelity with a required
  real-shell parity check.
- **Roaster-style prework depth (user-confirmed).** Modular `prework/` specs rather than a single
  consolidated inventory, because `slot` is the largest (17 commands) and most OS-coupled capability
  ported so far.
- **Standalone-only**, no `asdl.plugins` analog (per the `areg` precedent); cd-directive protocol and
  rc-block markers kept verbatim; clipboard reason tags preserved; Graphite only behind `slot gt`;
  run-from-source `just install-slot` shim replacing the current editable-uv-tool install.

## Validation evidence

- Evidence base read from `packages/asdl-slots/src/asdl_slots/` (naming, inventory, planning,
  repo-context, pool/checkout/claim/free/gc lifecycle, gateways, shell/completion integration, gt
  navigation + free-stack + exec, CLI/plugin wiring, pyproject) and the TS reference packages
  (`ts/packages/brmem` scaffold, `justfile` install shims). The two highest-risk facts (the
  cd-directive protocol and the rc-block install bytes/markers) were transcribed verbatim from
  `shell_integration.py`, `cli/slot/shell.py`, and `cli/slot/completion.py`.
- `slot-typescript-port` is free of any prior record/archive; no `ts/packages/slot` exists yet.

## Follow-Ups

- Umbrella reconciliation: mark `slot` as an active subobjective in
  `port-asdl-toolkit-to-typescript`'s ledger/roadmap, and (separately surfaced) the umbrella's
  `roaster` ledger row still reads "Unstarted" though `roaster-typescript-port` is open — reconcile
  when touching the ledger.
- Execution begins at roadmap row 1 (inventory is already captured) → row 3 (scaffold + `list`).
