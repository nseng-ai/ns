# Rename SDL to ji

## Thesis

The product renames from SDL ("Source Development Lifecycle") to **ji** — a proper name
with no expansion, always lowercase (never `JI`, `Ji`, or an acronym). Decided July 2026;
the naming rationale, rejected alternatives, and accepted collisions live in a dedicated
ADR, with the full naming brief checked into `docs/`.

Timing is the forcing function: three in-flight objectives
(`checkout-free-sdl-distribution`, `ship-objectives-to-customers`, `eve-parity-docs-site`)
are about to freeze the name into published npm packages, customer repos, and docs-site
URLs. Renaming now is a find-replace plus a manual machine migration; renaming after any
of them lands is a published-package and customer-state migration. This Objective is
therefore a **hard dependency of the first external publish**: it owns the publish-name
question that `checkout-free-sdl-distribution` currently carries as open.

The transition is a **hard cutover** with zero compatibility codepaths — no `sdl` alias
bin, no `.sdl/` read-fallback, no legacy XDG fallback. This is safe because the consumer
population is exactly this repo and the owner's machines, and it honors the
compat-deletion stance the closed `sdl-config-layout-migration` objective established.

## Scope

- **Core brand surface, one landing window:** `sdl` bin → `ji`; Pi namespace `/sdl:*` →
  `/ji:*`; repo state dir `.sdl/` → `.ji/` (records move wholesale; prose is not
  scrubbed); XDG namespaces `$XDG_{STATE,CONFIG,DATA}_HOME/sdl/` → `.../ji/`; kernel and
  tooling paths (`sdl objective`, `load-orientations`, extension manifests) move in the
  same landing so nothing breaks between commits.
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
  appears before cutover, revisit the no-compat stance.
- GitHub redirects the old repo slug for clones, remotes, and links.
- The existing `nseng-ai` npm org/scope is the publish namespace, and package name `ji`
  is available/owned there for the external package target `@nseng-ai/ji`; no `@ji` org
  claim or fallback path is part of the plan.

Risks:

- **In-flight branches and worktree slots** created pre-cutover carry `.sdl/` trees and
  old paths; they will hit rename-shaped conflicts on restack. Accepted: land the
  cutover when the stack is shallow and fix stragglers by hand.
- **The `.sdl/` → `.ji/` move and the tooling that reads it must land together** —
  objective CLI paths, `load-orientations`, extension manifests, parity tests. A split
  landing breaks every agent's onboarding commands.
- **Brand adjacency risks are accepted, not de-risked:** Jujutsu (`jj`) is one keystroke
  away in the same git-tooling space; a nontrivial population binds `ji` as a zoxide
  alias. Both are recorded in the ADR as consciously accepted.
- **`cross-harness-parity`'s parity table** references `/sdl:*` names and will drift the
  moment the namespace renames; coordinate the table update into the cutover landing.

## Open Questions

None currently.
