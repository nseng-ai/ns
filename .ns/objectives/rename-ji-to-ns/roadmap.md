# Roadmap

## Work

- [~] Close the `rename-sdl-to-ji` Objective with an explicit disposition for its
  trailing rows (machine-migration residue subsumed here; `@ji/*` → `@nseng-ai/*`
  correction superseded by `@ns/*`; GitHub repo rename overtaken — `origin` is
  already `nseng-ai/ns`).
- [~] Land the decision records: ADR 0026 (`docs/adr/0026-rename-ji-to-ns.md`), the
  naming brief (`docs/ns-naming-brief.md`), the superseded banner on
  `docs/ji-naming-brief.md`, this Objective record, and the frozen
  `collision-register.md` (DO-NOT-TOUCH inventory for the edit-agent brief).
- [~] Re-instantiate the cutover execution machinery from the sdl→ji rename: the
  refactor-swarm cutover pipeline and the AST codemod / manifest-rewrite lineage
  (`tools/pkg-scope-sweep/`), retargeted ji→ns.
- [ ] Core cutover in one landing window: `ji` bin → `ns`, `.ji/` → `.ns/` (`git mv`,
      paths never content), `/ji:*` → `/ns:*`, `JI_*` → `NS_*`, XDG `*/ji/` → `*/ns/`,
      active docs and skills sweep, and the four `skills/ji-flow-*` dirs → `ns-flow-*`.
      Evidence: `just` green and `ns objective list` +
      `ns objective exec load-orientations` working post-cutover; no compat codepath
      introduced.
- [ ] Internal sweep, landing the same day: `@ji/*` → `@ns/*` workspace scope,
      `src/ji/` → `src/ns/`, `./ji/...` export subpaths, `ji-*.ts` filenames, the
      `"ji"` package.json manifest key → `"ns"`, `jicc` → `nscc`, `ji.toml` → `ns.toml`.
      Evidence: residual grep for leftover ji forms only (never positive-ns) is clean
      outside historical records.
- [ ] Post-landing rebaseline: sweep orientation trails and open Objective records
      whose active prose still points at `ji` surfaces (paths, commands, package
      names); historical records stay verbatim.
- [ ] Machine migration, scripted this time: install shim, zshrc sentinel block, XDG
      dirs with worktree slots moved via `git worktree move`, `JI_*` shell-profile
      exports, and `refs/ji/*` → `refs/ns/*`; fix straggler branches by hand.

## Parked

- Checkout-dir rename `~/code/sdl-tools` → `~/code/ns` — deferred; documented
  follow-up is `mv` → `git worktree repair` → `just install-tools`.
- `@nseng-ai/ns` first-publish mechanics — owned by `checkout-free-sdl-distribution`;
  this Objective only supplies the name.
- Deeper `nscc` renaming or folding it into the `ns` surface — future product decision
  carried over from the sdl→ji rename's parking.
