# Roadmap

## Work

- [ ] Claim the `@ji` npm scope: create the `ji` org under the `schrockn` npm account
      and record the registration. Owner action, one-shot; no dispute for the unscoped
      squat.
- [x] Land the decision records: ADR 0024 (`docs/adr/0024-rename-sdl-to-ji.md` —
      rationale, rejected alternatives, accepted collisions, lowercase rule, `@ji` scope
      plan), the naming brief (`docs/ji-naming-brief.md`), and the re-record of
      `checkout-free-sdl-distribution`'s publish-name open question as resolved by this
      Objective.
- [ ] Core cutover in one landing window: `sdl` bin → `ji`, `.sdl/` → `.ji/`,
      `/sdl:*` → `/ji:*`, XDG `*/sdl/` → `*/ji/`, kernel/tooling paths, and the
      `cross-harness-parity` table update.
      Evidence: `just` passes; `ji objective list` and `ji objective exec
  load-orientations` work; no compat codepath introduced.
- [ ] Write and execute the manual machine migration checklist (XDG `mv`s, checkout
      path, worktree slots), and fix up any straggler branches by hand.
- [ ] Vocabulary sweep: CONTEXT.md, CONTEXT-MAP.md, AGENTS.md, skills, and active docs —
      `ji` glossary entry with casing rule, `SDL` added to *Avoid*, compound canonical
      terms renamed.
- [ ] Package scope sweep: `@sdl/*` and `@sdl-local/*` → `@ji/*`; rename `sdl-flow`;
      `sdlcc` → `jicc`.
- [ ] Final, manual: rename the GitHub repo to `nseng-ai/ji`; update remotes and any
      active links.

## Parked

- Deeper `jicc` renaming or folding it into the `ji` surface — future product decision,
  not part of the mechanical rename.
- Dedicated `ji` GitHub org/handle — launch-time branding decision.
