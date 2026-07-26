# Rename SDL to ji

## Thesis

The product renames from SDL ("Source Development Lifecycle") to **ji** — a proper name
with no expansion, always lowercase (never `JI`, `Ji`, or an acronym). Decided July 2026;
the naming rationale, rejected alternatives, and accepted collisions live in ADR 0024,
with the full naming brief checked into `docs/`.

Timing was the forcing function: three in-flight objectives
(`checkout-free-sdl-distribution`, `ship-objectives-to-customers`, the retired website Objective)
were about to freeze the name into published npm packages, customer repos, and documentation
URLs — all three remain open and unlanded. Renaming pre-publish is a find-replace plus a
manual machine migration; renaming after any of them lands is a published-package and
customer-state migration. This Objective is therefore a **hard dependency of the first
external publish**: it owns the publish-name question that
`checkout-free-sdl-distribution` formerly carried as open (re-recorded there as resolved
by this Objective on 2026-07-02).

The transition is a **hard cutover** with zero compatibility codepaths — no `sdl` alias
bin, no `.sdl/` read-fallback, no legacy XDG fallback. This is safe because the consumer
population is exactly this repo and the owner's machines, and it honors the
compat-deletion stance the closed `sdl-config-layout-migration` objective established.

## Scope

- **Core brand surface, one landing window:** `sdl` bin → `ji`; Pi namespace `/sdl:*` →
  `/ji:*`; repo state dir `.sdl/` → `.ji/` (records move wholesale; prose is not
  scrubbed); XDG namespaces `$XDG_{STATE,CONFIG,DATA}_HOME/sdl/` → `.../ji/`; kernel and
  tooling paths (`ji objective`, `load-orientations`, extension manifests) move in the
  same landing so nothing breaks between commits. Tracked in the dedicated child
  Objective `ji-core-cutover`.
- **Workspace scopes:** `@sdl/*` and `@sdl-local/*` → `@nseng-ai/*` equivalents, plus
  the externally published package target `@nseng-ai/ji`, and the unscoped stragglers
  `sdl-flow` and `sdlcc`; `sdlcc` renames mechanically to `jicc`.
- **Vocabulary retirement:** root context `# SDL Tools` → `# ji`; compound canonical
  terms rename ("ji extension API", "ji Command Face", "ji Pi mirrors", …); a `ji`
  glossary entry records the lowercase-always rule with *Avoid*: `JI`, `Ji`, `SDL`,
  `Source Development Lifecycle`; AGENTS.md, CONTEXT-MAP.md, skills, and active docs
  sweep with it.
- **Decision records:** an ADR capturing the rename, the accepted collisions (Jujutsu
  `jj` adjacency, npm squat, zoxide `ji` alias convention), the lowercase rule, and the
  npm package naming plan; the naming brief lands under `docs/`.
- **npm naming:** do not claim the `@ji` npm scope. Publish under the existing
  `@nseng-ai` scope with package name `ji` (`@nseng-ai/ji`). No dispute for the
  squatted unscoped `ji` slug — the squat is an accepted collision; nothing waits on
  external parties.
- **GitHub repo rename:** `nseng-ai/sdl-tools` → `nseng-ai/ji`, sequenced last, executed
  manually by the owner; the Objective tracks it as a checklist item only.
- **Manual migration checklist:** one-shot documented `mv` steps for local machines (XDG
  dirs, checkout path, worktree slots). No migration tooling.

## Non-Goals

- No compatibility codepaths of any kind: no `sdl` alias bin, no `.sdl/` or legacy-XDG
  read fallback, no `/sdl:*` Pi aliases, no migration state machines.
- No scrubbing of historical records: archived Objectives, updates, closed
  branch-context prose, and old commit messages keep saying "sdl"/"SDL" forever.
- No auto-migration of user data; the machine migration is a manual checklist.
- Non-brand binaries (`slot`, `brmem`, `vibechk`, `areg`, `ccc`, `enriched-plan`,
  `packagechk`) are untouched.
- No dedicated `ji` GitHub org or handle; that is a launch-time branding decision.
- No product redesign of `jicc` beyond the mechanical rename; folding it into `ji` (or a
  better name) is a future decision.
- Marketing narrative (djinn/spellbook/jib) stays out of CONTEXT.md and AGENTS.md; the
  checked-in brief under `docs/` is its only in-repo home.
- Does not execute `checkout-free-sdl-distribution`'s bundling/publish work; this
  Objective only supplies and gates the name.

## Completion Criteria

- `ji …` is the only invocation surface; no `sdl` bin exists in the workspace.
- `.ji/` is the repo state root; `/ji:*` is the Pi namespace; XDG paths use the `ji`
  namespace; `just` passes and `ji objective list` works post-cutover.
- All workspace packages carry `@nseng-ai/*` (or `jicc`) names; no `@sdl` import
  remains, and the externally published package target is `@nseng-ai/ji`.
- CONTEXT.md carries the `ji` glossary entry with the casing rule and `SDL` in *Avoid*;
  no active doc, skill, or context file introduces the old name outside historical
  records.
- The ADR is merged and the naming brief is checked in under `docs/`.
- `checkout-free-sdl-distribution`'s publish-name open question is re-recorded as
  resolved by this Objective (done early, not at close).
- The npm publish target is `@nseng-ai/ji` under the existing `nseng-ai` org/scope; the
  unscoped `ji` squat is recorded as an accepted collision (no dispute), with the binary
  installing as `ji`.
- The GitHub repo is renamed to `nseng-ai/ji` (manual, final step).

## Assumptions and Risks

Assumptions:

- The consumer population is exactly this repo plus the owner's machines; no external
  consumer exists yet. This is what makes the hard cutover safe. If an external consumer
  appears before cutover completes, revisit the no-compat stance.
- GitHub redirects the old repo slug for clones, remotes, and links.
- The existing `nseng-ai` npm org/scope is the publish namespace, and package name `ji`
  is available/owned there for the external package target `@nseng-ai/ji`; no `@ji` org
  claim or fallback path is part of the plan.

Risks:

- **In-flight branches and worktree slots** created pre-cutover carry `.sdl/` trees and
  old paths; they hit rename-shaped conflicts on restack. Accepted: the cutover landed
  when the stack was shallow; remaining stragglers are fixed by hand under the
  machine-migration roadmap row.
- **The old root can regress post-cutover.** Proven live: the Objective Edges initiative
  created `.sdl/objectives/objective-edges/` on trunk on 2026-07-03 (commit `463ed7541`,
  still tracked at HEAD) — a live, open Objective record under the retired `.sdl/` root,
  invisible to `ji objective list`. Agents and tooling with stale path habits can
  reintroduce `.sdl/` at any time until the vocabulary sweep retires the old name from
  active docs and skills.
- **Brand adjacency risks are accepted, not de-risked:** Jujutsu (`jj`) is one keystroke
  away in the same git-tooling space; a nontrivial population binds `ji` as a zoxide
  alias. Both are recorded in the ADR as consciously accepted.

Retired risks (evidence at 2026-07-03 trunk refresh): the `.sdl/` → `.ji/` move and its
reader tooling landed together on master (`[cutover B1]` commit `d6184e4c4` and
successors) — `ji objective list`, `ji objective exec read-objective`, and
`load-orientations` all work; and `cross-harness-parity`'s `parity-table.md` already uses
`/ji:*` names, so the anticipated parity-table drift never materialized as a live gap.

## Open Questions

- Who owns moving the stray `.sdl/objectives/objective-edges/` record to
  `.ji/objectives/`: the `ji-core-cutover` child (as residual cutover cleanup) or the
  Objective Edges initiative that created it? This record only flags the regression; the
  fix crosses Objective boundaries and needs routing.
  Resolved at closure: this Objective took it as residual cutover cleanup — the record
  moved to `.ji/objectives/objective-edges/` verbatim in the closing PR.

## Closure

Closed 2026-07-03. Outcome: completed-with-supersession — the core rename shipped in
full, and the product name then moved on from `ji` to `ns` (see the `rename-ji-to-ns`
Objective and ADR 0026) before the remaining trailing rows landed under their original
framing.

Shipped under this Objective:

- Core cutover (bin, `.sdl/` → `.ji/`, `/sdl:*` → `/ji:*`, XDG, kernel/tooling paths) via
  the child Objective `ji-core-cutover`, closed 2026-07-03 with `just` green
  (3994/3994) and post-cutover smoke evidence.
- Decision records: ADR 0024 and `docs/ji-naming-brief.md`; the
  `checkout-free-sdl-distribution` publish-name question re-recorded as resolved.
- Vocabulary sweep of CONTEXT.md, CONTEXT-MAP.md, AGENTS.md, skills, and active docs.
- Package scope sweep first pass (`@sdl/*` → `@ji/*`, `sdlcc` → `jicc`,
  `src/sdl/` → `src/ji/`) via `tools/pkg-scope-sweep/`.

Disposition of the rows still open at closure:

- Machine migration: partially executed (zshrc shell-integration block and
  `refs/sdl/flow-land-backup*` refs migrated; no-op surfaces recorded). The residual
  checklist is subsumed by `rename-ji-to-ns`'s scripted machine migration, which
  migrates the same surfaces one more hop.
- Package scope correction (`@ji/*` → `@nseng-ai/*`): superseded — `rename-ji-to-ns`
  takes the workspace scope to `@ns/*` with the external publish target `@nseng-ai/ns`.
- GitHub repo rename to `nseng-ai/ji`: overtaken by events — the owner renamed the repo
  directly to `nseng-ai/ns` (verified 2026-07-03: `origin` is
  `https://github.com/nseng-ai/ns.git`), skipping the `ji` slug entirely.

Durable-rule graduation: the orientation's standing rule (one name everywhere; hard
cutover; never reintroduce a legacy name as a surface, path, or vocabulary) carries
forward in `rename-ji-to-ns`'s orientation rather than graduating to AGENTS.md, since it
remains initiative-scoped until that rename completes.
