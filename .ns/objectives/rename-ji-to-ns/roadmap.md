# Roadmap

## Work

- [x] Close the `rename-sdl-to-ji` Objective with an explicit disposition for its
  trailing rows (machine-migration residue subsumed here; `@ji/*` → `@nseng-ai/*`
  correction superseded by `@ns/*`; GitHub repo rename overtaken — `origin` is
  already `nseng-ai/ns`). Evidence: `.ns/objectives/rename-sdl-to-ji/closed.md`
  records closure as superseded by this Objective.
- [x] Land the decision records: ADR 0026 (`docs/adr/0026-rename-ji-to-ns.md`), the
  naming brief (`docs/ns-naming-brief.md`), the superseded banner on
  `docs/ji-naming-brief.md`, this Objective record, and the frozen
  `collision-register.md` (DO-NOT-TOUCH inventory for the edit-agent brief).
- [x] Re-instantiate the cutover execution machinery from the sdl→ji rename: the
  refactor-swarm cutover pipeline and the AST codemod / manifest-rewrite lineage
  (`tools/pkg-scope-sweep/`), retargeted ji→ns. Evidence: `tools/cutover/`,
  `tools/pkg-scope-sweep/`, and `tools/machine-migration/` exist under this Objective.
- [x] Core cutover in one landing window: `ji` bin → `ns`, `.ji/` → `.ns/` (`git mv`,
      paths never content), `/ji:*` → `/ns:*`, `JI_*` → `NS_*`, XDG `*/ji/` → `*/ns/`,
      active docs and skills sweep, and the four `skills/ji-flow-*` dirs → `ns-flow-*`.
      Evidence: `.ns/` is present and `.ji/` absent; `ns --help`, `ns objective list`,
      and `ns objective exec load-orientations` work; `.pi/extensions/ns.ts` and the
      `skills/ns-flow-*` directories are present; no compat surface was observed in
      the update evidence.
- [~] Internal sweep, landing the same day: `@ji/*` → `@ns/*` workspace scope,
      `src/ji/` → `src/ns/`, `./ji/...` export subpaths, `ji-*.ts` filenames, the
      `"ji"` package.json manifest key → `"ns"`, `jicc` → `nscc`, `ji.toml` → `ns.toml`.
      Main package/path/config sweep landed: workspace packages are `@ns/*`, `ns.toml`
      is present, `ji.toml` is absent, `ts/packages/hosts/nscc` exists, and no
      `src/ji/` tracked path was found. Residual cleanup remains because the leftover
      grep still finds `@ji/` in live retrospective docs and `jicc`-named symbols under
      `ts/packages/hosts/nscc/`.
- [~] Post-landing rebaseline: sweep orientation trails and open Objective records
      whose active prose still points at `ji` surfaces (paths, commands, package
      names); historical records stay verbatim. Evidence: active orientation output and
      residual docs grep still contain stale `@ji/*` package references.
- [x] Machine migration, scripted this time: install shim, zshrc sentinel block, XDG
      dirs with worktree slots moved via `git worktree move`, `JI_*` shell-profile
      exports, and `refs/ji/*` → `refs/ns/*`; fix straggler branches by hand. Evidence:
      `migrate.py --list` reports all mutating steps done, legacy slot worktrees were
      not found, `refs/ns/*` exists, and `refs/ji/*` was not reported.

## Parked

- Checkout-dir rename `~/code/sdl-tools` → `~/code/ns` — deferred; documented
  follow-up is `mv` → `git worktree repair` → `just install-tools`.
- `@nseng-ai/ns` first-publish mechanics — owned by `checkout-free-sdl-distribution`;
  this Objective only supplies the name.
- Deeper `nscc` renaming or folding it into the `ns` surface — future product decision
  carried over from the sdl→ji rename's parking.
