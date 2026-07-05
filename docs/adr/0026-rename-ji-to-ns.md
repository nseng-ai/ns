# Rename ji to ns

The product renames from ji to **ns** — a proper name, always lowercase, including at
sentence starts (rewrite the sentence rather than capitalize). Never `NS` or `Ns` as the
product name; `NS_*` environment variables are ordinary env-var uppercase, not brand
casing. Decided July 2026, one day after ADR 0024's sdl→ji rename landed; this ADR
supersedes 0024's name verdict while carrying its cutover doctrine forward. (Numbering
note: the sequence contains two 0024s by accident and an 0025, so this is 0026.)

Unlike ji, which stood for nothing, ns means three things at once:

- **nonslop** — the toolkit that stands athwart slop calling stop. This is the thesis:
  durable planning Objectives, branch memory, and directed handoffs are anti-slop
  infrastructure. The equation "ns = nonslop" is established vocabulary — the owner's
  old `nonslop` repo shipped `ns-*` prefixed skills and an `ns-ci` workflow (see the
  closed `migrate-areg-and-ns-skills` Objective).
- **namespace** — the CLI is literally a namespace: `/ns:handoff:create` slash commands,
  the `.ns/` dotdir, `NS_*` env vars, `ns objective …` subcommands. The name describes
  the structure at every surface it appears on.
- **Nick Schrock's initials** — a private signature.

The two-letter infrastructure register (`gt`, `gh`, `jj`; `uv` and `ty` before them in
ADR 0024) carries over unchanged.

The cutover is hard, phased across one day, and ships zero compatibility codepaths: no
`ji` alias bin, no `.ji/` or legacy-XDG read fallback, no `/ji:*` Pi aliases. Phase one
is the core cutover (`ji` bin → `ns`, `.ji/` → `.ns/`, `/ji:*` → `/ns:*`,
`JI_*` → `NS_*`, XDG `*/ji/` → `*/ns/`, active docs, skills, the four
`skills/ji-flow-*` dirs → `ns-flow-*`); phase two is the internal sweep (`@ji/*` →
`@ns/*` workspace scope, `src/ji/` → `src/ns/`, `./ji/...` export subpaths, `ji-*.ts`
filenames, the `"ji"` package.json manifest key → `"ns"`, `jicc` → `nscc`,
`ji.toml` → `ns.toml`). Both land the same day via the re-instantiated refactor-swarm
cutover pipeline and the AST codemod lineage from the sdl→ji rename. This is safe for
the same reason it was in 0024: the consumer population is exactly this repository and
the owner's machines, and nothing was ever published under the superseded `@nseng-ai/ji`
target. History-facing content stays verbatim — closed Objectives, updates, ADR bodies,
and migration evidence keep saying "ji" (and "sdl") forever; `git mv .ji .ns` moves
paths, never content. The GitHub repo is already renamed: `origin` is
`https://github.com/nseng-ai/ns.git`.

Accepted collisions, consciously de-risked by nothing:

- `ns` is an extremely common token: the conventional `ns` variable for a namespace,
  English plurals ending in -ns, DNS NS records, nanoseconds, Cocoa/Foundation's `NS`
  class prefix, and NativeScript's `ns` CLI.
- Pre-existing in-repo `ns` tokens that are not the product name and must never be
  "fixed": brmem's `BRMEM_NS_SEGMENT = "ns"` ref segment (`refs/brmem/ns/...`,
  `ts/packages/infra/brmem/src/ref-layout.ts`), the `--namespace <ns>` placeholders in
  `skills/brmem/SKILL.md`, and the closed Objective slug `migrate-areg-and-ns-skills`.
  The full frozen inventory lives in the `rename-ji-to-ns` Objective's
  `collision-register.md`.
- Verification consequence: post-cutover residual-grep invariants search only for
  leftover ji forms, never for positive ns — the token is too common to assert on.

npm plan: packages publish under the existing **`@nseng-ai` scope**. The product CLI
package name is `ns`, yielding the publish target `@nseng-ai/ns`, superseding the
`@nseng-ai/ji` target recorded in the `rename-sdl-to-ji` Objective; the internal
workspace scope is `@ns/*` *(amended by ADR 0028: the workspace scope becomes bare
`@nseng-ai/*`; the rest of this ADR stands)*. No claim on the public `@ns` npm org/scope is assumed — not
as plan A, not as fallback — and whatever holds the unscoped npm `ns` slug is an
accepted collision with no dispute path, mirroring 0024's stance. The CLI installs a bin
named `ns`, so users type `ns`; packaging details beyond the product package target
remain `checkout-free-sdl-distribution`'s call.

The marketing narrative and the fuller naming deliberation live in
`docs/ns-naming-brief.md`, which supersedes `docs/ji-naming-brief.md`; this ADR records
the verdicts.
