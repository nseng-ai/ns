# Rename generic/internal-sounding packages to their public npm names

ADR 0028 made workspace name equal published npm name: whatever a package is called in
the workspace is what a consumer sees on npm from the day it publishes. That decision
left a residual problem — several packages still carried generic or internal-sounding
workspace names (`core`, `objective`, `slot`, `handoff`, `address`, the branch-retrospective evidence package, `roaster`)
that were never chosen as public product surface, only as convenient internal labels.
With the standalone-publish surface widening, those names were about to freeze into npm
forever.

**Decision (2026-07-05): rename these packages to their public names, with directory
moves to match, before the npm surface widens further:**

| Old                   | New                     | Directory                              |
| --------------------- | ----------------------- | -------------------------------------- |
| `@nseng-ai/core`      | `@nseng-ai/foundation`  | `ts/packages/infra/foundation`         |
| `@nseng-ai/objective` | `@nseng-ai/objectives`  | `ts/packages/capabilities/objectives`  |
| `@nseng-ai/slot`      | `@nseng-ai/slots`       | `ts/packages/capabilities/slots`       |
| `@nseng-ai/handoff`   | `@nseng-ai/handoffs`    | `ts/packages/capabilities/handoffs`    |
| `@nseng-ai/address`   | `@nseng-ai/pr-feedback` | `ts/packages/capabilities/pr-feedback` |
| branch-retro evidence | `@nseng-ai/retros`      | `ts/packages/capabilities/retros`      |
| `@nseng-ai/roaster`   | `@nseng-ai/reviews`     | `ts/packages/capabilities/reviews`     |

`@nseng-ai/kernel` is deliberately **not** part of this rename and stays unpublished
standalone: it remains a private internal workspace package whose runtime ships only
folded inside the `@nseng-ai/ns` esbuild bundle. Nothing about ADR 0026's or ADR 0028's
`@nseng-ai/ns` CLI publish target changes.

CLI command names, bin names, `/ns:*` slash-command names, and domain vocabulary were
initially unchanged by this ADR — only npm package names and package directory paths moved. `ns
objective ...` stays `ns objective ...` even though the package behind it is now
`@nseng-ai/objectives`; the `slot` binary stays `slot`; Roaster stays the name of the
review engine and `roaster` stays the CLI subcommand even though its package is now
`@nseng-ai/reviews`; Handoff stays the name of the artifact even though its package is
now `@nseng-ai/handoffs`. Product vocabulary and npm package identity are independent
axes.

Amendment (2026-07-06): Retros is the exception to that initial command-vocabulary
rule. Its command face, repo-local extension group, tests, docs, and agent-facing skill
references now use `ns retros exec ...` and Retros naming throughout.

Consequences:

- Every in-repo import, manifest dependency, and export-map reference to the old package
  names and old directory paths was swept in the same change as this ADR, via a
  deterministic rename sweep plus `git mv`, mirroring the `pkg-scope-sweep` codemod
  lineage ADR 0028 used for the `@ns/*` → `@nseng-ai/*` scope move.
- Historical prose is not rewritten: closed Objectives, prior ADR bodies, and old commit
  messages keep saying `@nseng-ai/core`, `@nseng-ai/address`, and so on forever. ADRs
  0004, 0018, and 0019 in particular carry current-path references to the old `core` and
  `address` locations that this ADR does not rewrite in place; each gets a short inline
  amendment note pointing here instead.
- Unpublished/internal packages are explicitly out of scope for this rename and their
  public-name question, if any, is a deferred decision: `ccc`, `pi`,
  `pi-command-surfaces`, `@internal/*`, `nscc`, `command-backed-skill-registry`, `areg`,
  `packagechk`, and `vibechk`.

Rejected alternatives:

- **Keep the generic names and add the alias-mapping layer ADR 0028 rejected.** Rejected
  for the same reason ADR 0028 gave: a permanent mapping tax, now multiplied across seven
  packages instead of avoided once.
- **Rename only the packages already scheduled to publish in wave 1, defer the rest.**
  Rejected — partial renames would leave some workspace names public and others not, with
  no principled line between them, and would force a second disruptive sweep later.
- **Fold `core`, `objective`, `slot`, etc. into the `@nseng-ai/ns` bundle like `kernel`.**
  Rejected; unlike `kernel`, these packages are capability-shaped and independently
  useful as standalone publish targets, so folding them would foreclose that.
