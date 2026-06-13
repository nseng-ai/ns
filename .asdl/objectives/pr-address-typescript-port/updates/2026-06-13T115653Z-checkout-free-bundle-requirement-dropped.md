# Checkout-free bundle requirement dropped

## Summary

After challenging the `bundle-distribution` next step, the checkout-free JavaScript bundle requirement is dropped from this Objective.

Durable decision:

- `pr-address` does not need to run without an asdl checkout for this Objective to complete.
- The accepted installed CLI model is the existing run-from-source shim installed by `just install-pr-address`: it prefers the enclosing worktree, otherwise falls back to the baked canonical checkout, and may require that checkout to have `ts/node_modules` available.
- No bundled JavaScript artifact, npm publish, `local|prod` wrapper mode, or `uvx`/Python wrapper path is required for cutover.
- Checkout-free distribution can be reconsidered later only if a real consumer requirement appears.

## Objective Impact

- `objective.md` now treats run-from-source wrapper distribution as the accepted installed-skill model, removes bundled installed-skill artifact language from completion criteria, and revises Python deletion gates so bundle cutover is no longer required.
- `roadmap.md` removes the active `bundle-distribution` endgame branch. The remaining endgame sequence is `plugin-retirement`, `python-deletion`, and `playbook`.
- The cutover row remains in progress because plugin retirement and Python fallback deletion are still pending.
- The Python deletion row is now gated on run-from-source wrapper evidence and plugin retirement, not checkout-free distribution.

## Follow-Ups

- Next Objective work should move to `plugin-retirement`: remove the `asdl pr-address ...` plugin surface and update docs/tests so the standalone `pr-address` CLI is the only active invocation surface.
- Keep wrapper changes limited to preserving and documenting the run-from-source shim contract unless a new explicit requirement reopens checkout-free distribution.
- Record the run-from-source distribution tradeoff in the final porting playbook.
