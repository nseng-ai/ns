# Roadmap

## Work

- [x] PR 1: add the project-local `.pi/extensions/asdl-stack-run/` extension skeleton with local `yaml` dependency, deterministic frontmatter extraction, runtime TypeScript validation for minimal plan and pointer-ledger schemas, branch/key derivation using `---` as the slash escape, rejection of planned branches containing literal `---`, and literal branch-presence validation against the plan body.
- [x] PR 2: implement Branch Memory plan storage and loading for `/stack-run`, including local-plan ingestion into namespace `stack-plans` with key `<objective>.md`, identical-content reuse, explicit replacement/confirmation for differing content, existing-plan-key loading, plan content hashing, and no Markdown body parsing beyond literal branch presence checks.
- [x] PR 3: implement slice start orchestration: find the first incomplete planned branch from the Branch Memory plan and derived handoff existence, require a clean worktree, create/check out the slice branch with raw git from the intended parent, immediately `gt track` it, write the branch-local pointer-only ledger in namespace `stack-runs`, and start a fresh Pi session with a compact kickoff prompt.
- [x] PR 4: add the structured agent protocol and closeout path: register `stack_slice_done` and `stack_slice_blocked`, trust `stack_slice_done` for v1, queue closeout from the tool, store the agent-drafted handoff in Branch Memory namespace `session-artifacts` under the derived current-branch key, and stop cleanly when blocked.
- [ ] PR 5: harden recovery, status, and documentation: add `/stack-status` or equivalent recovery display, support resuming the first incomplete branch after interruption, improve diagnostics for plan hash drift, missing ledgers, missing handoffs, Graphite tracking failures, dirty worktrees, and document the v1 plan format and workflow expectations.

## Parked

- [ ] Add mechanical closeout verification before advancing: current branch checks, Objective update presence, validation reruns, changed-file inventory, clean worktree, Graphite state, and handoff existence.
- [ ] Add checked-in JSON Schemas if external tooling needs to validate or repair stack-plan and slice-ledger frontmatter outside the Pi extension.
- [ ] Support branch rename or restack repair flows beyond fail-closed diagnostics.
- [ ] Promote the project-local extension into a reusable Pi package or global extension if the asdl workflow proves portable.
- [ ] Add richer supervised UI flows for selecting a starting branch, reviewing handoff drafts, and confirming continuation.
- [ ] Add automated PR submission support only after the local branch/session workflow is reliable and explicitly gated.
